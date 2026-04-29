import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, Play, Square, Terminal, CheckCircle2, XCircle, 
  Loader2, Image as ImageIcon, Settings, Eye, EyeOff,
  Plus, Trash2, Edit3, Save, ChevronRight, FileText, Code
} from 'lucide-react';
import axios from 'axios';

const ExecutionPage = ({ story, credentials }) => {
  const [steps, setSteps] = useState([]);
  const [generatedCases, setGeneratedCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [headless, setHeadless] = useState(true);
  const [engine, setEngine] = useState('groq');
  const [currentExecution, setCurrentExecution] = useState(null);
  const [logs, setLogs] = useState([]);
  const [stepStatus, setStepStatus] = useState({}); 
  const [screenshots, setScreenshots] = useState({}); 
  const [contextCode, setContextCode] = useState('');
  
  const eventSourceRef = useRef(null);
  const logEndRef = useRef(null);

  // Load Generated Cases and Script
  useEffect(() => {
    if (story?.id) {
      const storedCases = localStorage.getItem(`testpilot_cases_${story.id}`);
      if (storedCases) {
        const parsed = JSON.parse(storedCases);
        setGeneratedCases(parsed);
        // Default to first case if available
        if (parsed.length > 0) {
            handleCaseSelect(parsed[0].TC_ID, parsed);
        }
      } else {
        const initialSteps = story.Steps?.split('\n').filter(s => s.trim()) || [];
        setSteps(initialSteps.map((text, id) => ({ id, text, isEditing: false })));
      }

      const storedScript = localStorage.getItem(`testpilot_script_${story.id}`);
      if (storedScript) setContextCode(storedScript);
    }
  }, [story]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCaseSelect = (caseId, sourceCases = generatedCases) => {
    setSelectedCaseId(caseId);
    const tc = sourceCases.find(c => c.TC_ID === caseId);
    if (tc) {
        let uiSteps = [];
        
        // Only show Precondition (Login, etc) in the UI
        if (tc.Precondition || tc.Preconditions) {
            uiSteps.push(`PRECONDITION: ${tc.Precondition || tc.Preconditions}`);
        } else {
            uiSteps.push('No preconditions defined.');
        }

        setSteps(uiSteps.map((text, id) => ({ id, text, isEditing: false })));
    }
  };

  const addStep = () => {
    setSteps([...steps, { id: Date.now(), text: 'New Step', isEditing: true }]);
  };

  const removeStep = (id) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const updateStepText = (id, text) => {
    setSteps(steps.map(s => s.id === id ? { ...s, text } : s));
  };

  const toggleEdit = (id) => {
    setSteps(steps.map(s => s.id === id ? { ...s, isEditing: !s.isEditing } : s));
  };

  const [executionQueue, setExecutionQueue] = useState([]);
  const [runningTcId, setRunningTcId] = useState('');
  const isTransitioningRef = useRef(false);

  useEffect(() => {
    if (!isExecuting && executionQueue.length > 0 && !isTransitioningRef.current) {
      isTransitioningRef.current = true;
      const nextTcId = executionQueue[0];
      
      // Find the case and extract steps including preconditions
      const tc = generatedCases.find(c => c.TC_ID === nextTcId);
      if (tc) {
        setRunningTcId(nextTcId);
        setExecutionQueue(prev => prev.slice(1));
        
        let allSteps = [];
        if (tc.Precondition || tc.Preconditions) {
            allSteps.push(`PRECONDITION: ${tc.Precondition || tc.Preconditions}`);
        }
        const rawSteps = tc.Gherkin || tc.Steps || tc.Scenario || '';
        const parsedSteps = rawSteps.split('\n')
            .filter(s => s.trim())
            .filter(s => !s.trim().toLowerCase().startsWith('scenario:'))
            .map(s => s.trim());
        allSteps = [...allSteps, ...parsedSteps];
        
        handleCaseSelect(nextTcId); // Update UI
        
        setIsExecuting(true);
        setTimeout(() => {
           startAgentExecution(nextTcId, allSteps);
           isTransitioningRef.current = false;
        }, 1000); // 1s buffer for browser cleanup
      } else {
        setExecutionQueue(prev => prev.slice(1));
        isTransitioningRef.current = false;
      }
    } else if (!isExecuting && executionQueue.length === 0) {
      setRunningTcId('');
    }
  }, [isExecuting, executionQueue, generatedCases]);

  const runAllSequential = () => {
    if (generatedCases.length === 0) return;
    const allIds = generatedCases.map(c => c.TC_ID);
    setExecutionQueue(allIds);
  };

  const startAgentExecution = async (tcIdOverride = null, stepsOverride = null) => {
    setIsExecuting(true);
    setLogs([]);
    setStepStatus({});
    setScreenshots({});
    
    try {
      const activeTcId = tcIdOverride || selectedCaseId || story.id;
      const tc = generatedCases.find(c => c.TC_ID === activeTcId);
      
      let finalSteps = [];
      
      // 1. Take steps from UI (Preconditions/Modified steps)
      const uiSteps = steps.map(s => s.text);
      
      if (stepsOverride) {
          finalSteps = stepsOverride;
      } else if (tc) {
          // Merge UI steps with BDD steps
          const rawBdd = tc.Gherkin || tc.Steps || tc.Scenario || '';
          const bddSteps = rawBdd.split('\n')
              .filter(s => s.trim())
              .filter(s => !s.trim().toLowerCase().startsWith('scenario:'))
              .map(s => s.trim());
          
          finalSteps = [...uiSteps, ...bddSteps];
      } else {
          finalSteps = uiSteps;
      }

      const storedInstruction = localStorage.getItem(`testpilot_instruction_${story.id}`);
      const fallbackInstruction = localStorage.getItem('testpilot_ai_memory') || '';
      
      const resp = await axios.post('http://localhost:3001/api/agent-execute', {
        test_case_id: activeTcId,
        steps: finalSteps,
        headless,
        engine,
        contextCode,
        userInstructions: storedInstruction || story.Description || fallbackInstruction || '',
        credentials
      });

      const { executionId } = resp.data;
      setCurrentExecution(executionId);
      setupStream(executionId, activeTcId);
    } catch (err) {
      addLog(`❌ Failed to start agent: ${err.message}`, 'error');
      setIsExecuting(false);
    }
  };

  const setupStream = (executionId, tcId) => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    
    const es = new EventSource(`http://localhost:3001/api/agent-stream/${executionId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleAgentEvent(data, tcId);
    };

    es.onerror = () => {
      addLog('⚠️ Stream disconnected', 'warn');
      es.close();
    };
  };

  const handleAgentEvent = (data, tcId) => {
    switch (data.type) {
      case 'STEP_START':
        setStepStatus(prev => ({ ...prev, [data.index]: 'running' }));
        addLog(`🚀 Starting: ${data.step}`, 'info');
        break;
      case 'TOOL_CALL':
        addLog(`🛠️ Tool: ${data.name} (${JSON.stringify(data.args)})`, 'tool');
        break;
      case 'OBSERVATION':
        addLog(`👁️ Obs: ${data.observation}`, 'obs');
        break;
      case 'SCREENSHOT':
        setScreenshots(prev => {
            const stepIdx = Object.keys(stepStatus).find(k => stepStatus[k] === 'running');
            return { ...prev, [stepIdx]: [...(prev[stepIdx] || []), data.filename] };
        });
        break;
      case 'STEP_COMPLETE':
        setStepStatus(prev => ({ ...prev, [data.index]: 'completed' }));
        addLog(`✅ Step ${data.index + 1} finished`, 'success');
        break;
      case 'STEP_FAILED':
        setStepStatus(prev => ({ ...prev, [data.index]: 'failed' }));
        addLog(`❌ Step ${data.index + 1} failed`, 'error');
        break;
      case 'EXECUTION_COMPLETE':
        setIsExecuting(false);
        addLog(`🏁 Execution Finished: ${data.status} ${data.error ? '(' + data.error + ')' : ''}`, data.status === 'Success' ? 'success' : 'error');
        eventSourceRef.current?.close();
        
        // Save result to report
        axios.post('http://localhost:3001/api/execute-test', {
          test_case_id: tcId,
          status: data.status === 'Success' ? 'Pass' : 'Fail',
          comments: `AI Agent execution finished with status: ${data.status}`,
          manual: false,
          storyKey: story?.key
        }).catch(err => console.error('Failed to save AI report', err));
        break;
      case 'ERROR':
        addLog(`⚠️ Error: ${data.error}`, 'error');
        break;
    }
  };

  const addLog = (text, type) => {
    setLogs(prev => [...prev, { id: Date.now(), text, type, time: new Date().toLocaleTimeString() }]);
  };

  const stopExecution = () => {
    eventSourceRef.current?.close();
    setIsExecuting(false);
    addLog('🛑 Execution stopped by user', 'warn');
  };

  const glassStyle = {
    background: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(12px)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    padding: '1.5rem',
  };

  const logColors = {
    info: '#818cf8',
    tool: '#fbbf24',
    obs: '#94a3b8',
    success: '#10b981',
    error: '#ef4444',
    warn: '#f59e0b'
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem', height: 'calc(100vh - 140px)' }}>
      {/* LEFT: STEP EDITOR */}
      <div style={{ ...glassStyle, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', minWidth: '380px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={18} color="#818cf8" /> Agent Execution
            </h3>
            <p style={{ margin: '0.2rem 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>Select or edit steps for the AI agent</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={runAllSequential} disabled={isExecuting} style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#10b981', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Play size={14} /> Run All Sequence
            </button>
            <button onClick={addStep} style={{ background: 'rgba(129, 140, 248, 0.1)', border: '1px solid #818cf8', color: '#818cf8', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Plus size={14} /> Add Step
            </button>
          </div>
        </div>

        {/* Test Case Selector */}
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: '#6366f1', fontWeight: 600, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Selected Test Case</label>
            <select 
                value={selectedCaseId} 
                onChange={(e) => handleCaseSelect(e.target.value)}
                style={{ width: '100%', background: 'transparent', border: 'none', color: '#f8fafc', outline: 'none', fontSize: '0.9rem' }}
            >
                <option value="" disabled>Choose a test case...</option>
                {generatedCases.length > 0 ? (
                    generatedCases.map(tc => (
                        <option key={tc.TC_ID} value={tc.TC_ID} style={{ background: '#0f172a' }}>
                            {tc.TC_ID}: {tc.Title || tc['Test Case Title'] || tc.Scenario?.split('\n')[0]?.slice(0, 40)}
                        </option>
                    ))
                ) : (
                    <option value="manual" style={{ background: '#0f172a' }}>Story Default Steps</option>
                )}
            </select>
        </div>

        {/* Steps List */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ChevronRight size={14} /> Execution Steps
          </div>
          <AnimatePresence>
            {steps.map((step, index) => (
              <motion.div 
                key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  borderRadius: '10px', 
                  padding: '0.75rem 1rem', 
                  marginBottom: '0.6rem',
                  border: `1px solid ${stepStatus[index] === 'running' ? '#818cf8' : 'rgba(255,255,255,0.05)'}`,
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'center'
                }}
              >
                <div style={{ 
                  width: '24px', height: '24px', borderRadius: '50%', 
                  background: stepStatus[index] === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)', 
                  color: stepStatus[index] === 'completed' ? '#10b981' : '#818cf8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 600
                }}>
                  {index + 1}
                </div>
                
                <div style={{ flex: 1 }}>
                  {step.isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        autoFocus
                        style={{ 
                          width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #818cf8',
                          color: '#f8fafc', outline: 'none', padding: '2px 0', fontSize: '0.9rem'
                        }}
                        value={step.text}
                        onChange={(e) => updateStepText(step.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && toggleEdit(step.id)}
                      />
                      <button onClick={() => toggleEdit(step.id)} style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer' }}>
                        <Save size={14} />
                      </button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => toggleEdit(step.id)}
                      style={{ color: '#e2e8f0', cursor: 'text', fontSize: '0.9rem', width: '100%' }}
                    >
                      {step.text}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {stepStatus[index] === 'completed' && <CheckCircle2 size={16} color="#10b981" />}
                  {stepStatus[index] === 'failed' && <XCircle size={16} color="#ef4444" />}
                  {stepStatus[index] === 'running' && <Loader2 size={16} color="#818cf8" className="spin-icon" />}
                  {!isExecuting && (
                    <button onClick={() => removeStep(step.id)} style={{ background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', marginLeft: '0.4rem' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Reference Context Info */}
        {contextCode && (
            <div style={{ fontSize: '0.7rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.05)', padding: '0.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Code size={14} /> Automation context found! Agent will use it for selector hints.
            </div>
        )}

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '10px' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Engine:</span>
            <select 
              value={engine} 
              onChange={(e) => setEngine(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#f8fafc', outline: 'none', fontSize: '0.8rem', flex: 1 }}
            >
              <option value="groq" style={{ background: '#0f172a' }}>Groq (Llama 3)</option>
              <option value="openrouter" style={{ background: '#0f172a' }}>OpenRouter</option>
              <option value="gemini" style={{ background: '#0f172a' }}>Gemini</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '10px' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Mode:</span>
            <button 
              onClick={() => setHeadless(!headless)} 
              style={{ 
                background: 'transparent', border: 'none', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem'
              }}
            >
              {headless ? <EyeOff size={14} /> : <Eye size={14} />} {headless ? 'Headless' : 'Headed'}
            </button>
          </div>
          <button 
            onClick={() => isExecuting ? stopExecution() : startAgentExecution(selectedCaseId || null, null)} 
            className="btn-primary" 
            style={{ 
              gridColumn: 'span 2', background: isExecuting ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              color: isExecuting ? '#ef4444' : '#10b981', border: `1px solid ${isExecuting ? '#ef4444' : '#10b981'}`
            }}
          >
            {isExecuting ? <Square size={16} /> : <Bot size={16} />} {isExecuting ? `Stop Agent (${executionQueue.length > 0 ? executionQueue.length + ' left' : ''})` : 'Run Selected Test Case'}
          </button>
        </div>
      </div>

      {/* RIGHT: LIVE AGENT LOGS */}
      <div style={{ ...glassStyle, display: 'flex', flexDirection: 'column', gap: '1rem', background: '#0a0f1e', minWidth: 0, height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <Terminal size={18} color="#10b981" /> 
            Live Agent Log 
            {runningTcId && <span style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', border: '1px solid rgba(99,102,241,0.2)' }}>{runningTcId}</span>}
          </h3>
          {isExecuting && <div style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span className="dot-blink" style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' }} /> {runningTcId ? 'Executing Test Case...' : 'Streaming...'}
          </div>}
        </div>

        <div style={{ 
          flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '1rem', 
          fontFamily: 'monospace', fontSize: '0.85rem', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.05)'
        }}>
          {logs.length === 0 && <div style={{ color: '#475569', textAlign: 'center', marginTop: '4rem' }}>Waiting for execution to start...</div>}
          {logs.map(log => (
            <div key={log.id} style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.8rem' }}>
              <span style={{ color: '#475569' }}>[{log.time}]</span>
              <span style={{ color: logColors[log.type] || '#f8fafc' }}>{log.text}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        {/* SCREENSHOT GALLERY */}
        <div style={{ height: '120px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', padding: '0.75rem', display: 'flex', gap: '0.75rem', overflowX: 'auto', flexShrink: 0 }}>
          {Object.values(screenshots).flat().length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
              <ImageIcon size={24} style={{ marginBottom: '0.4rem' }} />
              <span style={{ fontSize: '0.75rem' }}>No screenshots yet</span>
            </div>
          )}
          {Object.values(screenshots).flat().map((src, i) => (
            <div key={i} style={{ position: 'relative', minWidth: '180px', height: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <img src={`http://localhost:3001/recordings/${src}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Step screenshot" />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', fontSize: '0.65rem', color: '#fff' }}>
                Capture #{i+1}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .dot-blink { animation: blink 1.5s infinite; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .spin-icon { animation: spin 2s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default ExecutionPage;
