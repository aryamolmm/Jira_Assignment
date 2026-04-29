import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal, Play, Cpu, CheckCircle2, XCircle, Brain, Code2,
  Beaker, Zap, Clock, ChevronRight, Copy, Check, SkipForward,
  AlertTriangle, BarChart2, RefreshCcw, Loader2, Shield
} from 'lucide-react';
import axios from 'axios';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AGENT_META = {
  Orchestrator:   { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', icon: <Cpu size={13} /> },
  MemoryAgent:    { color: '#ec4899', bg: 'rgba(236,72,153,0.12)',  icon: <Brain size={13} /> },
  ArchitectAgent: { color: '#c084fc', bg: 'rgba(192,132,252,0.12)', icon: <Beaker size={13} /> },
  AutomationAgent:{ color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', icon: <Code2 size={13} /> },
  CoverageAgent:  { color: '#34d399', bg: 'rgba(52,211,153,0.12)', icon: <BarChart2 size={13} /> },
  ReworkAgent:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', icon: <RefreshCcw size={13} /> },
};

const STATUS_ICON = {
  running:   <Loader2 size={12} className="spin-icon" style={{ color: '#6366f1' }} />,
  completed: <CheckCircle2 size={12} style={{ color: '#4ade80' }} />,
  bypassed:  <SkipForward size={12} style={{ color: '#64748b' }} />,
  reused:    <Shield size={12} style={{ color: '#f59e0b' }} />,
  match:     <CheckCircle2 size={12} style={{ color: '#ec4899' }} />,
  no_match:  <XCircle size={12} style={{ color: '#64748b' }} />,
  error:     <XCircle size={12} style={{ color: '#f87171' }} />,
  bypass:    <SkipForward size={12} style={{ color: '#f59e0b' }} />,
  info:      <ChevronRight size={12} style={{ color: '#94a3b8' }} />,
};

function msLabel(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={copy} style={{
      background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', padding: '4px 10px', cursor: 'pointer',
      color: copied ? '#4ade80' : '#94a3b8', fontSize: '0.75rem',
      display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.2s',
      width: 'auto' // Fix global width: 100%
    }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeBlock({ code, lang = 'gherkin' }) {
  if (!code) return null;
  const text = typeof code === 'object' ? JSON.stringify(code, null, 2) : String(code);
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', top: '10px', right: '10px', zIndex: 2,
        display: 'flex', gap: '6px', alignItems: 'center'
      }}>
        <span style={{ fontSize: '0.65rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>{lang}</span>
        <CopyButton text={text} />
      </div>
      <pre style={{
        background: 'rgba(2,6,23,0.7)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        padding: '1.2rem 1.2rem 1.2rem 1rem',
        overflowX: 'auto',
        fontSize: '0.78rem',
        lineHeight: '1.7',
        color: '#e2e8f0',
        margin: 0,
        maxHeight: '400px',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}>
        {text}
      </pre>
    </div>
  );
}

const PIPELINE_STEPS = [
  { id: 1, agent: 'ArchitectAgent',  tool: 'generate_gherkin',     label: 'BDD Testcases',    icon: <Beaker size={15} />,     color: '#c084fc' },
  { id: 2, agent: 'AutomationAgent', tool: 'generate_test_cases',  label: 'Playwright Tests', icon: <Code2 size={15} />,      color: '#60a5fa' },
  { id: 3, agent: 'CoverageAgent',   tool: 'analyze_coverage',     label: 'Coverage Report',  icon: <BarChart2 size={15} />,  color: '#34d399' },
  { id: 4, agent: 'ReworkAgent',     tool: 'improve_test_cases',   label: 'Improved Tests',   icon: <RefreshCcw size={15} />, color: '#fbbf24' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

const SuperAgent = ({ credentials }) => {
  const [task, setTask]           = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [trace, setTrace]         = useState([]);
  const [result, setResult]       = useState(null);
  const [activeTab, setActiveTab] = useState('trace');
  const [error, setError]         = useState(null);
  const traceEndRef               = useRef(null);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [trace]);

  const handleRun = async () => {
    if (!task.trim() || isRunning) return;
    setIsRunning(true);
    setTrace([]);
    setResult(null);
    setError(null);
    setActiveTab('trace');

    // Show optimistic trace while waiting
    const seedLogs = [
      { step: 0, agent: 'Orchestrator', tool: null, message: 'Received user input — initialising pipeline', status: 'info', ts: 0 },
      { step: 1, agent: 'MemoryAgent',  tool: null, message: 'Scanning memory index for semantic similarity...', status: 'running', ts: 120 },
    ];
    setTrace(seedLogs);

    try {
      const userMemory = localStorage.getItem('testpilot_ai_memory') || '';
      const activeKey = credentials?.engine === 'groq' ? credentials.groqKey : 
                        credentials?.engine === 'openrouter' ? credentials.openRouterKey :
                        credentials?.engine === 'openai' ? credentials.openaiKey :
                        credentials?.engine === 'claude' ? credentials.claudeKey :
                        credentials?.geminiKey;

      const resp = await axios.post('http://localhost:3001/api/agent/super/run', {
        input: task,
        userMemory,
        engine: credentials?.engine || 'gemini',
        apiKey: activeKey
      });

      // Animate real trace entries one by one
      const realTrace = resp.data.execution_trace || [];
      setTrace([]);
      for (let i = 0; i < realTrace.length; i++) {
        await new Promise(r => setTimeout(r, 350));
        setTrace(prev => [...prev, realTrace[i]]);
      }

      setResult(resp.data);
      if (story?.id) {
        localStorage.setItem(`testpilot_instruction_${story.id}`, task);
      }
      setActiveTab('trace');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setTrace(prev => [...prev, {
        step: prev.length + 1, agent: 'Orchestrator', tool: null,
        message: `❌ Pipeline failed: ${err.response?.data?.error || err.message}`,
        status: 'error', ts: 0
      }]);
    } finally {
      setIsRunning(false);
    }
  };

  const coverageData = result?.final_output?.coverage;
  const qualityScore = typeof coverageData === 'object' ? coverageData?.quality_score : null;

  // ── TAB CONTENT ────────────────────────────────────────────────────────────

  const tabContent = {
    trace: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <AnimatePresence>
          {trace.map((entry, i) => {
            const meta = AGENT_META[entry.agent] || AGENT_META.Orchestrator;
            return (
              <motion.div key={i}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '9px 12px', borderRadius: '10px',
                  background: meta.bg, border: `1px solid ${meta.color}22`,
                }}
              >
                <span style={{ color: meta.color, marginTop: '1px', flexShrink: 0 }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
                    <span style={{ color: meta.color, fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{entry.agent}</span>
                    {entry.tool && (
                      <span style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 7px', borderRadius: '5px', fontSize: '0.68rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {entry.tool}
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto', color: '#475569', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {STATUS_ICON[entry.status] || null}
                      {msLabel(entry.ts)}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.4 }}>{entry.message}</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isRunning && (
          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', color: '#6366f1', fontSize: '0.8rem' }}>
            <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Agent pipeline executing...</span>
          </motion.div>
        )}
        <div ref={traceEndRef} />
      </div>
    ),

    memory: result && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{
          background: result.memory.used_memory ? 'rgba(236,72,153,0.08)' : 'rgba(100,116,139,0.08)',
          border: `1px solid ${result.memory.used_memory ? 'rgba(236,72,153,0.2)' : 'rgba(100,116,139,0.15)'}`,
          borderRadius: '14px', padding: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
            <Brain size={20} color={result.memory.used_memory ? '#ec4899' : '#64748b'} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                Used Memory: <span style={{ color: result.memory.used_memory ? '#4ade80' : '#f87171' }}>
                  {result.memory.used_memory ? 'YES' : 'NO'}
                </span>
              </div>
              <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '2px' }}>
                Action: <span style={{ color: '#e2e8f0', fontWeight: 600, textTransform: 'uppercase' }}>{result.memory.memory_action}</span>
                {result.memory.similarity_score != null && (
                  <> &nbsp;·&nbsp; Similarity: <span style={{ color: '#f59e0b' }}>{Math.round(result.memory.similarity_score * 100)}%</span></>
                )}
              </div>
            </div>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>{result.memory.memory_summary}</p>
        </div>

        {/* Pipeline summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(result.pipeline_steps || []).map(ps => {
            const meta = AGENT_META[ps.agent] || AGENT_META.Orchestrator;
            return (
              <div key={ps.step} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <span style={{ color: meta.color, fontWeight: 700, fontSize: '0.72rem', width: '120px', flexShrink: 0 }}>{ps.agent}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#475569', flex: 1 }}>{ps.tool}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: ps.status === 'completed' ? '#4ade80' : ps.status === 'bypassed' ? '#64748b' : ps.status === 'reused' ? '#f59e0b' : '#475569' }}>
                  {STATUS_ICON[ps.status]} {ps.status}
                </span>
              </div>
            );
          })}
        </div>

        {result.total_ms != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.78rem' }}>
            <Clock size={12} /> Total pipeline time: <strong style={{ color: '#94a3b8' }}>{msLabel(result.total_ms)}</strong>
          </div>
        )}
      </div>
    ),

    gherkin: result?.final_output?.gherkin && (
      <CodeBlock code={result.final_output.gherkin} lang="gherkin" />
    ),

    tests: result?.final_output?.testCode && (
      <CodeBlock code={result.final_output.testCode} lang="typescript" />
    ),

    coverage: coverageData && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Score card */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'
        }}>
          {[
            { label: 'Coverage Status', value: coverageData.coverage_status, highlight: coverageData.coverage_status === 'complete' ? '#4ade80' : '#f87171' },
            { label: 'Quality Score', value: `${coverageData.quality_score ?? '—'} / 100`, highlight: qualityScore >= 80 ? '#4ade80' : qualityScore >= 60 ? '#f59e0b' : '#f87171' },
            { label: 'Coverage %', value: `${coverageData.coverage_percentage ?? '—'}%`, highlight: '#60a5fa' },
            { label: 'Missing Cases', value: coverageData.missing_cases?.length ?? 0, highlight: coverageData.missing_cases?.length ? '#f87171' : '#4ade80' },
          ].map(card => (
            <div key={card.label} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '12px', padding: '1rem', textAlign: 'center'
            }}>
              <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{card.label}</div>
              <div style={{ color: card.highlight, fontWeight: 700, fontSize: '1.1rem' }}>{card.value}</div>
            </div>
          ))}
        </div>

        {coverageData.summary && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '1rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
            {coverageData.summary}
          </div>
        )}

        {coverageData.missing_cases?.length > 0 && (
          <div>
            <div style={{ color: '#f87171', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              Missing Cases ({coverageData.missing_cases.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {coverageData.missing_cases.map((mc, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                  background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)',
                  borderRadius: '8px', padding: '8px 12px', fontSize: '0.8rem', color: '#fca5a5'
                }}>
                  <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '2px', color: '#f87171' }} />
                  {mc}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ),

    improved: result?.final_output?.improvedTestCode
      ? <CodeBlock code={result.final_output.improvedTestCode} lang="typescript (improved)" />
      : <div style={{ color: '#64748b', fontSize: '0.85rem', padding: '1rem' }}>No rework required — coverage was sufficient.</div>,
  };

  const TABS = [
    { id: 'trace',    label: 'Execution Trace', icon: <Terminal size={13} /> },
    { id: 'memory',   label: 'Memory Insight',  icon: <Brain size={13} /> },
    { id: 'gherkin',  label: 'BDD Testcases',   icon: <Beaker size={13} /> },
    { id: 'tests',    label: 'Playwright Tests', icon: <Code2 size={13} /> },
    { id: 'coverage', label: 'Coverage',         icon: <BarChart2 size={13} /> },
    { id: 'improved', label: 'Improved Tests',   icon: <RefreshCcw size={13} /> },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Header Card ─────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(217,70,239,0.08) 100%)',
          border: '1px solid rgba(139,92,246,0.25)', borderRadius: '20px', padding: '2rem',
          position: 'relative', overflow: 'hidden'
        }}
      >
        {/* Background glow */}
        <div style={{ position: 'absolute', top: '-30%', right: '-10%', width: '40%', height: '150%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ background: 'linear-gradient(135deg, #8b5cf6, #d946ef)', padding: '8px', borderRadius: '12px', display: 'flex' }}>
            <Zap size={20} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>AI Orchestrator</h2>
            <p style={{ margin: 0, color: '#7c3aed', fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>
              Autonomous QA Pipeline · <span style={{ color: '#d946ef' }}>{credentials?.engine || 'Gemini'} Mode</span>
            </p>
          </div>
          {result && !isRunning && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', padding: '6px 14px', borderRadius: '30px', color: '#4ade80', fontSize: '0.78rem', fontWeight: 600 }}>
              <CheckCircle2 size={13} /> Pipeline Completed
            </div>
          )}
        </div>

        <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '1rem 0 1.5rem', lineHeight: 1.6 }}>
          Describe any feature or user story. The AI Orchestrator will run <strong style={{ color: '#c084fc' }}>Architect → Automation → Coverage → Rework</strong> agents using smart execution.
        </p>

        {/* Input area */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch', width: '100%' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleRun(); }}
              placeholder="e.g. Login flow with email/password validation, session persistence, and lockout after 5 failed attempts..."
              rows={3}
              style={{
                width: '100%', background: 'rgba(2,6,23,0.6)',
                border: '1px solid rgba(139,92,246,0.25)', borderRadius: '14px',
                padding: '1rem', color: 'white', fontSize: '0.9rem',
                resize: 'none', outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
                lineHeight: 1.6,
                margin: 0
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(139,92,246,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(139,92,246,0.25)'}
            />
            <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '6px', paddingLeft: '4px' }}>Ctrl+Enter to execute</div>
          </div>

          <button onClick={handleRun} disabled={isRunning || !task.trim()}
            style={{
              background: isRunning ? 'rgba(139,92,246,0.2)' : 'linear-gradient(135deg, #8b5cf6, #d946ef)',
              border: isRunning ? '1px solid rgba(139,92,246,0.3)' : 'none',
              borderRadius: '14px', padding: '0 2.5rem', height: 'auto', width: 'auto', minWidth: '180px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: isRunning ? 'not-allowed' : 'pointer',
              boxShadow: isRunning ? 'none' : '0 10px 25px -5px rgba(139,92,246,0.4)',
              transition: 'all 0.3s', opacity: (!task.trim() && !isRunning) ? 0.5 : 1,
              flexShrink: 0
            }}
          >
            {isRunning
              ? <><Loader2 size={16} className="spin-icon" /> Generating...</>
              : <><Play size={16} /> Run Pipeline</>
            }
          </button>
        </div>
      </motion.div>

      {/* ── Pipeline Steps Bar ───────────────────────────────────────────── */}
      {(isRunning || result) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}
        >
          {PIPELINE_STEPS.map((ps) => {
            const pipelineStep = result?.pipeline_steps?.find(s => s.step === ps.id);
            const status = pipelineStep?.status ?? (isRunning ? 'pending' : 'pending');
            return (
              <div key={ps.id} style={{
                background: 'rgba(255,255,255,0.02)', border: `1px solid ${ps.color}30`,
                borderRadius: '14px', padding: '1rem', textAlign: 'center',
                transition: 'all 0.3s'
              }}>
                <div style={{ color: ps.color, display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>{ps.icon}</div>
                <div style={{ fontSize: '0.7rem', color: ps.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{ps.agent}</div>
                <div style={{ fontSize: '0.65rem', color: '#475569', fontFamily: 'monospace', marginBottom: '6px' }}>{ps.tool}</div>
                <div style={{
                  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                  color: status === 'completed' ? '#4ade80' : status === 'bypassed' ? '#64748b' : status === 'reused' ? '#f59e0b' : '#475569',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                }}>
                  {STATUS_ICON[status] || null} {status}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* ── Terminal & Output Panel ──────────────────────────────────────── */}
      {(trace.length > 0 || result) && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          style={{
            background: '#020617', borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.06)',
            overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)'
          }}
        >
          {/* Tab bar */}
          <div style={{
            display: 'flex', gap: 0, overflowX: 'auto',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)'
          }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              const hasContent = tab.id === 'trace' ? trace.length > 0
                : tab.id === 'memory'   ? !!result
                : tab.id === 'gherkin'  ? !!result?.final_output?.gherkin
                : tab.id === 'tests'    ? !!result?.final_output?.testCode
                : tab.id === 'coverage' ? !!result?.final_output?.coverage
                : tab.id === 'improved' ? true
                : false;

              return (
                <button key={tab.id} onClick={() => hasContent && setActiveTab(tab.id)}
                  style={{
                    padding: '12px 18px', fontSize: '0.75rem', fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#c084fc' : hasContent ? '#64748b' : '#2d3748',
                    background: isActive ? 'rgba(139,92,246,0.08)' : 'transparent',
                    borderBottom: isActive ? '2px solid #8b5cf6' : '2px solid transparent',
                    border: 'none', cursor: hasContent ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    whiteSpace: 'nowrap', transition: 'all 0.2s',
                    width: 'auto'
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              );
            })}

            {result?.total_ms != null && (
              <div style={{ marginLeft: 'auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '5px', color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>
                <Clock size={11} /> {msLabel(result.total_ms)}
              </div>
            )}
          </div>

          {/* Tab content */}
          <div style={{ padding: '1.5rem', maxHeight: '520px', overflowY: 'auto' }}>
            <AnimatePresence mode="wait">
              <motion.div key={activeTab}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {tabContent[activeTab] || (
                  <div style={{ color: '#475569', fontSize: '0.85rem', padding: '0.5rem' }}>
                    {isRunning ? 'Waiting for agent output...' : 'No output yet.'}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* ── Error State ──────────────────────────────────────────────────── */}
      {error && !isRunning && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: '14px', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '10px',
            color: '#fca5a5', fontSize: '0.85rem'
          }}
        >
          <XCircle size={16} style={{ flexShrink: 0, color: '#f87171' }} />
          <span><strong>Pipeline Error:</strong> {error}</span>
        </motion.div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin-icon { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};

export default SuperAgent;
