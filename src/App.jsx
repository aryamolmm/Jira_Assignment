import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { LayoutDashboard, History as HistoryIcon, Beaker, Code2, LogOut, Brain, Zap, Settings, Play, Shield, Terminal, BarChart3 } from 'lucide-react'

import Login from './components/Login'
import Dashboard from './components/Dashboard'
import TestCasePage from './components/TestCasePage'
import PlaywrightPage from './components/PlaywrightPage'
import History from './components/History'
import MemoryPage from './components/MemoryPage'
import SuperAgent from './components/SuperAgent'
import SettingsPage from './components/SettingsPage'
import ExecutionPage from './components/ExecutionPage'
import ManualExecutionPage from './components/ManualExecutionPage'
import ExecutionReport from './components/ExecutionReport'

const SESSION_KEY = 'testpilot_session'
const API_KEYS_KEY = 'testpilot_api_keys'
const INACTIVITY_MS = 5 * 60 * 1000 // 5 minutes

function App() {
  const [credentials, setCredentials] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [currentStory, setCurrentStory] = useState(null)
  const [historyList, setHistoryList] = useState([])
  const [sessionExpired, setSessionExpired] = useState(false)
  const inactivityTimer = useRef(null)

  // ── Restore session on page load ──────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    if (stored) {
      try {
        const { creds, tab, story, lastActive } = JSON.parse(stored)
        const elapsed = Date.now() - lastActive
        if (elapsed < INACTIVITY_MS) {
          // Merge saved API keys into credentials
          const savedKeys = JSON.parse(localStorage.getItem(API_KEYS_KEY) || '{}')
          setCredentials({ 
            ...creds, 
            engine: savedKeys._activeEngine || creds.engine || 'gemini',
            geminiKey: savedKeys.gemini || '',
            groqKey: savedKeys.groq || '',
            openaiKey: savedKeys.openai || '',
            claudeKey: savedKeys.claude || '',
            openRouterKey: savedKeys.openrouter || ''
          })
          setActiveTab(tab || 'dashboard')
          if (story) setCurrentStory(story)
        } else {
          localStorage.removeItem(SESSION_KEY)
        }
      } catch {
        localStorage.removeItem(SESSION_KEY)
      }
    }

    const saved = localStorage.getItem('testpilot_history')
    if (saved) setHistoryList(JSON.parse(saved))
  }, [])

  // ── Persist session whenever credentials / tab / story change ─────
  useEffect(() => {
    if (credentials) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        creds: credentials,
        tab: activeTab,
        story: currentStory,
        lastActive: Date.now()
      }))
    }
  }, [credentials, activeTab, currentStory])

  // ── Inactivity timeout ────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    if (!credentials) return
    clearTimeout(inactivityTimer.current)
    // Update lastActive in storage
    const stored = localStorage.getItem(SESSION_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        localStorage.setItem(SESSION_KEY, JSON.stringify({ ...parsed, lastActive: Date.now() }))
      } catch {}
    }
    inactivityTimer.current = setTimeout(() => {
      handleLogout(true)
    }, INACTIVITY_MS)
  }, [credentials])

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer))
      clearTimeout(inactivityTimer.current)
    }
  }, [resetTimer])

  // ── Auth handlers ─────────────────────────────────────────────────
  const handleLogin = (creds) => {
    // Merge saved API keys
    const savedKeys = JSON.parse(localStorage.getItem(API_KEYS_KEY) || '{}')
    const mergedCreds = {
      ...creds,
      engine: savedKeys._activeEngine || 'gemini',
      geminiKey: savedKeys.gemini || '',
      groqKey: savedKeys.groq || '',
      openaiKey: savedKeys.openai || '',
      claudeKey: savedKeys.claude || '',
      openRouterKey: savedKeys.openrouter || ''
    }
    setCredentials(mergedCreds)
    setSessionExpired(false)
    setActiveTab('dashboard')
  }

  const handleLogout = (expired = false) => {
    clearTimeout(inactivityTimer.current)
    localStorage.removeItem(SESSION_KEY)
    setCredentials(null)
    setCurrentStory(null)
    setActiveTab('dashboard')
    setSessionExpired(!!expired)
  }

  const handleUpdateCredentials = (updated) => {
    setCredentials(updated)
    // Also persist active engine to API_KEYS_KEY
    const savedKeys = JSON.parse(localStorage.getItem(API_KEYS_KEY) || '{}')
    localStorage.setItem(API_KEYS_KEY, JSON.stringify({ ...savedKeys, _activeEngine: updated.engine }))
  }

  // ── Navigation ────────────────────────────────────────────────────
  const goToQA = (story) => {
    setCurrentStory(story)
    setActiveTab('qa')
    const newEntry = { story, timestamp: new Date().toISOString(), engine: credentials.engine }
    setHistoryList(prev => {
      const filtered = prev.filter(p => (p.story.id || p.story.key) !== (story.id || story.key))
      const updated = [newEntry, ...filtered]
      localStorage.setItem('testpilot_history', JSON.stringify(updated))
      return updated
    })
  }

  const goToAutomation = () => setActiveTab('automation')
  const backToDashboard = () => setActiveTab('dashboard')
  const backToQA = () => setActiveTab('qa')
  const viewFromHistory = (story) => { setCurrentStory(story); setActiveTab('qa') }

  // ── Login screen ──────────────────────────────────────────────────
  if (!credentials) {
    return (
      <div className="app-container">
        {sessionExpired && (
          <div style={{
            position: 'fixed', top: '1.5rem', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5', padding: '0.75rem 1.5rem', borderRadius: '12px',
            fontSize: '0.9rem', zIndex: 1000, backdropFilter: 'blur(8px)'
          }}>
            ⏱ Session expired due to inactivity. Please log in again.
          </div>
        )}
        <Login onLogin={handleLogin} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', maxWidth: '100vw' }}>
      {/* ── SIDEBAR ─────────────────────────────────────────────── */}
      <motion.aside
        initial={{ x: -250 }}
        animate={{ x: 0 }}
        style={{
          width: '260px',
          background: 'rgba(11, 15, 25, 0.95)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          padding: '2rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          backdropFilter: 'blur(10px)',
          position: 'fixed',
          top: 0, left: 0, bottom: 0,
          zIndex: 50
        }}
      >
        <div style={{ paddingBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '1.5rem' }}>
          <h2 className="title-gradient-primary" style={{ margin: 0, fontSize: '1.6rem' }}>Jira QA Assistant</h2>
          <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0.2rem 0 0', textTransform: 'uppercase', letterSpacing: '1px' }}>Jira Story Fetcher & AI Generator</p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
          <SidebarButton active={activeTab === 'dashboard'} icon={<LayoutDashboard size={18} />} label="Dashboard" onClick={() => setActiveTab('dashboard')} />
          <SidebarButton active={activeTab === 'super'} icon={<Zap size={18} />} label="AI Generator" onClick={() => setActiveTab('super')} />
          <SidebarButton active={activeTab === 'history'} icon={<HistoryIcon size={18} />} label="History" onClick={() => setActiveTab('history')} />
          <SidebarButton active={activeTab === 'memory'} icon={<Brain size={18} />} label="AI Memory" onClick={() => setActiveTab('memory')} />
          <SidebarButton active={activeTab === 'settings'} icon={<Settings size={18} />} label="Settings" onClick={() => setActiveTab('settings')} />

          <div style={{ margin: '1.5rem 0 0.5rem', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Generator Session</div>
          <SidebarButton active={activeTab === 'qa'} disabled={!currentStory} icon={<Beaker size={18} />} label="BDD Testcases" onClick={() => currentStory && setActiveTab('qa')} />
          <SidebarButton active={activeTab === 'automation'} disabled={!currentStory} icon={<Code2 size={18} />} label="Automation Scripts" onClick={() => currentStory && setActiveTab('automation')} />

          <div style={{ margin: '1.5rem 0 0.5rem', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Execution Session</div>
          <SidebarButton active={activeTab === 'manual_exec'} disabled={!currentStory} icon={<Shield size={18} />} label="Manual Execution" onClick={() => currentStory && setActiveTab('manual_exec')} />
          <SidebarButton active={activeTab === 'auto_exec'} disabled={!currentStory} icon={<Play size={18} />} label="Execution Console" onClick={() => currentStory && setActiveTab('auto_exec')} />
          <SidebarButton active={activeTab === 'exec_report'} icon={<BarChart3 size={18} />} label="Execution Report" onClick={() => setActiveTab('exec_report')} />
        </nav>

        {/* Active engine badge */}
        <div style={{ margin: '1rem 0', padding: '0.6rem 0.8rem', background: 'rgba(99,102,241,0.08)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.15)', fontSize: '0.75rem', color: '#818cf8' }}>
          ⚙ Engine: <strong style={{ color: '#a5b4fc', textTransform: 'capitalize' }}>{credentials.engine || 'gemini'}</strong>
          {!credentials.geminiKey && <div style={{ color: '#f87171', marginTop: '0.2rem' }}>⚠ No API key — go to Settings</div>}
        </div>

        <div style={{ paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={() => handleLogout(false)} style={{ background: 'transparent', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)', padding: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', borderRadius: '10px' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </motion.aside>

      {/* ── MAIN CONTENT ────────────────────────────────────────── */}
      <main style={{ marginLeft: '260px', flex: 1, padding: '2rem', maxWidth: 'calc(100% - 260px)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          {activeTab === 'dashboard' && (
            <Dashboard
              credentials={credentials}
              onUpdateCredentials={handleUpdateCredentials}
              onLogout={handleLogout}
              onGoToGenerator={goToQA}
            />
          )}
          {activeTab === 'super' && <SuperAgent credentials={credentials} />}
          {activeTab === 'history' && <History historyList={historyList} onViewStory={viewFromHistory} />}
          {activeTab === 'memory' && <MemoryPage />}
          {activeTab === 'settings' && (
            <SettingsPage
              credentials={credentials}
              onUpdateCredentials={handleUpdateCredentials}
            />
          )}
          {activeTab === 'qa' && currentStory && (
            <TestCasePage
              story={currentStory}
              credentials={credentials}
              onBack={backToDashboard}
              onGoToAutomation={goToAutomation}
            />
          )}
          {activeTab === 'automation' && currentStory && (
            <PlaywrightPage
              story={currentStory}
              credentials={credentials}
              onBack={backToQA}
              onGoToDashboard={backToDashboard}
            />
          )}
          {activeTab === 'manual_exec' && currentStory && <ManualExecutionPage story={currentStory} />}
          {activeTab === 'auto_exec' && currentStory && <ExecutionPage story={currentStory} credentials={credentials} />}
          {activeTab === 'exec_report' && <ExecutionReport />}
        </div>
      </main>
    </div>
  )
}

const SidebarButton = ({ active, disabled, icon, label, onClick }) => (
  <button
    onClick={!disabled ? onClick : null}
    style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem',
      background: active ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
      color: active ? '#c084fc' : (disabled ? '#475569' : '#94a3b8'),
      border: '1px solid',
      borderColor: active ? 'rgba(139, 92, 246, 0.3)' : 'transparent',
      borderRadius: '12px',
      boxShadow: 'none',
      fontWeight: active ? 600 : 500,
      opacity: disabled ? 0.6 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer',
      textAlign: 'left',
      transition: 'all 0.15s ease'
    }}
    onMouseEnter={(e) => { if (!active && !disabled) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'white' } }}
    onMouseLeave={(e) => { if (!active && !disabled) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' } }}
  >
    {icon} {label}
  </button>
)

export default App
