import { useState, useEffect } from 'react'
import { Zap, Cpu, Database } from 'lucide-react'
import { generateAutomationScriptAI, reworkScriptAI, downloadFile } from '../services/generator'

const PlaywrightPage = ({ story, credentials, onBack, onGoToDashboard }) => {
  const [script, setScript] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedTool, setSelectedTool] = useState('playwright')
  const [selectedLanguage, setSelectedLanguage] = useState('typescript')
  const [selectedFramework, setSelectedFramework] = useState('none')
  const [mappingMode, setMappingMode] = useState('ai')

  const getActiveKey = () => {
    switch (credentials.engine) {
      case 'groq': return credentials.groqKey;
      case 'openrouter': return credentials.openRouterKey;
      case 'openai': return credentials.openaiKey;
      case 'claude': return credentials.claudeKey;
      default: return credentials.geminiKey;
    }
  }

  useEffect(() => {
    const initScript = async () => {
      setIsGenerating(true)
      try {
        const activeKey = getActiveKey();
        const generatedScript = await generateAutomationScriptAI(story, activeKey, credentials.engine, selectedTool, selectedLanguage, selectedFramework, mappingMode)
        setScript(generatedScript)
      } catch (err) {
        console.error(err)
        setScript('// Error generating script. Please check your API key and try again.')
      } finally {
        setIsGenerating(false)
      }
    }
    initScript()
  }, [])

  const handleApplySettings = async () => {
    setIsGenerating(true)
    try {
      const activeKey = getActiveKey();
      const generatedScript = await generateAutomationScriptAI(story, activeKey, credentials.engine, selectedTool, selectedLanguage, selectedFramework, mappingMode)
      setScript(generatedScript)
    } catch (err) {
      console.error(err)
    } finally {
      setIsGenerating(false)
    }
  }

  const fileExt = selectedLanguage === 'typescript' ? 'ts' : selectedLanguage === 'python' ? 'py' : selectedLanguage === 'java' ? 'java' : selectedLanguage === 'csharp' ? 'cs' : 'js'

  const handleDownload = () => {
    downloadFile(script, `Agent2_${story.id}_test.spec.${fileExt}`, 'text/plain')
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(script)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '5rem' }}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button onClick={onBack} className="btn-secondary" style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: '10px' }}>
            ← Back to BDD Testcases
          </button>
          <button onClick={onGoToDashboard} className="btn-secondary" style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: '10px', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
            🔍 New Search
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '0.6rem', borderRadius: '12px' }}>
            <Cpu size={24} color="white" />
          </div>
          <div>
            <h1 className="title-gradient" style={{ margin: 0, fontSize: '1.8rem' }}>Automation Scripts</h1>
            <p style={{ color: '#94a3b8', margin: '0.2rem 0 0', fontSize: '0.9rem' }}>
              Forging <strong>{selectedTool} ({selectedLanguage})</strong> for <code>{story.id}</code>
            </p>
          </div>
        </div>

        {/* ── Settings Bar ─────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          rowGap: '1.2rem',
          columnGap: '1rem',
          padding: '1.5rem',
          background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9))',
          borderRadius: '16px',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          boxShadow: '0 10px 40px -10px rgba(99,102,241,0.15)',
          backdropFilter: 'blur(12px)'
        }}>
          {/* Tool selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Automation Tool:</span>
            <select
              value={selectedTool}
              onChange={(e) => setSelectedTool(e.target.value)}
              style={{
                height: '38px',
                padding: '0 0.8rem',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#f8fafc',
                outline: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                width: '100%'
              }}
            >
              <option value="playwright">Playwright</option>
              <option value="selenium">Selenium</option>
              <option value="cypress">Cypress</option>
              <option value="robot">Robot Framework</option>
              <option value="appium">Appium</option>
            </select>
          </div>

          {/* Language selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Language:</span>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              style={{
                height: '38px',
                padding: '0 0.8rem',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#f8fafc',
                outline: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                width: '100%'
              }}
            >
              <option value="typescript">TypeScript</option>
              <option value="javascript">JavaScript</option>
              <option value="java">Java</option>
              <option value="python">Python</option>
              <option value="csharp">C#</option>
            </select>
          </div>

          {/* Framework selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Framework:</span>
            <select
              value={selectedFramework}
              onChange={(e) => setSelectedFramework(e.target.value)}
              style={{
                height: '38px',
                padding: '0 0.8rem',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#f8fafc',
                outline: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                width: '100%'
              }}
            >
              <option value="none">None (Default)</option>
              <option value="pytest">PyTest</option>
              <option value="unittest">Unittest</option>
              <option value="testng">TestNG</option>
              <option value="junit">JUnit</option>
              <option value="mocha">Mocha</option>
              <option value="jest">Jest</option>
              <option value="cucumber">Cucumber (BDD)</option>
            </select>
          </div>

          {/* Apply - Spans Tool & Language columns */}
          <button
            onClick={handleApplySettings}
            className="btn-primary"
            disabled={isGenerating}
            style={{
              gridColumn: '1 / 3',
              height: '42px',
              fontSize: '0.9rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
              marginTop: '0.5rem'
            }}
          >
            {isGenerating
              ? <><div className="spinner" style={{ width: '14px', height: '14px', margin: 0 }}></div> Forging...</>
              : <><Zap size={16} /> Apply</>
            }
          </button>

          {/* Download - Spans Framework column */}
          <button
            onClick={handleDownload}
            className="btn-secondary"
            style={{ 
              gridColumn: '3 / 4',
              height: '42px', 
              fontSize: '0.9rem', 
              borderRadius: '8px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: '0.5rem'
            }}
          >
            <Database size={16} /> Download.{fileExt}
          </button>
        </div>
      </header>

      {/* ── Step Mapping Mode ────────────────────────────────────── */}
      <div style={{
        marginTop: '-1rem',
        marginBottom: '2rem',
        padding: '1.2rem 1.5rem',
        background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.4), rgba(15, 23, 42, 0.6))',
        borderRadius: '16px',
        border: '1px solid rgba(99, 102, 241, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <div style={{ fontSize: '0.85rem', color: '#a5b4fc', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Step Mapping Mode <span style={{ color: '#fbbf24', marginLeft: '0.5rem' }}>(Your CORE ENGINE CONTROL)</span></div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>This is the brain of your tool. Determine how steps are translated into code.</div>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.6rem 1.2rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, textTransform: 'none', color: '#f8fafc', fontSize: '0.85rem' }}>
            <input type="radio" name="mappingMode" value="direct" checked={mappingMode === 'direct'} onChange={(e) => setMappingMode(e.target.value)} style={{ width: 'auto', margin: 0 }} />
            Direct Mapping
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, textTransform: 'none', color: '#f8fafc', fontSize: '0.85rem' }}>
            <input type="radio" name="mappingMode" value="ai" checked={mappingMode === 'ai'} onChange={(e) => setMappingMode(e.target.value)} style={{ width: 'auto', margin: 0 }} />
            AI Enhanced Mapping
          </label>
        </div>
      </div>

      {/* ── Source Code Editor ────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: '#818cf8' }}>
            Source Code <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 400 }}>({selectedTool} · {selectedLanguage})</span>
          </h3>
          <button
            onClick={copyToClipboard}
            title="Copy Code"
            style={{ width: 'auto', padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.05)', fontSize: '1.25rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}
          >
            {copied ? '✅' : '📋'}
          </button>
        </div>

        {isGenerating ? (
          <div style={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
            <p style={{ color: '#94a3b8' }}>Forging {selectedTool} script in {selectedLanguage}...</p>
          </div>
        ) : (
          <textarea
            spellCheck="false"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            style={{
              width: '100%',
              height: '60vh',
              background: '#0f172a',
              color: '#94a3b8',
              fontFamily: 'monospace',
              padding: '1.5rem',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              resize: 'vertical',
              outline: 'none',
              fontSize: '0.9rem',
              lineHeight: '1.6'
            }}
          />
        )}
      </div>
    </div>
  )
}

export default PlaywrightPage
