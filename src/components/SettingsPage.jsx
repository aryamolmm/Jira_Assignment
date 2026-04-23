import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings, Key, CheckCircle, Cpu, Save, Eye, EyeOff, Trash2 } from 'lucide-react'

export const ENGINES = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    icon: '✦',
    model: 'gemini-1.5-pro',
    color: '#4285f4',
    gradient: 'linear-gradient(135deg, #4285f4, #34a853)',
    placeholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey'
  },
  {
    id: 'groq',
    name: 'Groq (LLaMA)',
    icon: '⚡',
    model: 'llama-3.3-70b-versatile',
    color: '#f55036',
    gradient: 'linear-gradient(135deg, #f55036, #f7a600)',
    placeholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys'
  },
  {
    id: 'openai',
    name: 'OpenAI GPT-4',
    icon: '◎',
    model: 'gpt-4-turbo',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    icon: '◆',
    model: 'claude-3-5-sonnet-20241022',
    color: '#d97706',
    gradient: 'linear-gradient(135deg, #d97706, #b45309)',
    placeholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: '⊕',
    model: 'DeepSeek Chat',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    placeholder: 'sk-or-...',
    docsUrl: 'https://openrouter.ai/keys'
  }
]

const STORAGE_KEY = 'testpilot_api_keys'

const SettingsPage = ({ credentials, onUpdateCredentials }) => {
  const [apiKeys, setApiKeys] = useState({ gemini: '', groq: '', openai: '', claude: '', openrouter: '' })
  const [activeEngine, setActiveEngine] = useState(credentials?.engine || 'gemini')
  const [showKey, setShowKey] = useState({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setApiKeys(prev => ({ ...prev, ...parsed }))
        if (parsed._activeEngine) setActiveEngine(parsed._activeEngine)
      } catch {}
    }
    if (credentials?.engine) setActiveEngine(credentials.engine)
  }, [])

  const handleSave = () => {
    const toStore = { ...apiKeys, _activeEngine: activeEngine }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
    
    // Sync all keys to the parent credentials state
    onUpdateCredentials({ 
      ...credentials, 
      engine: activeEngine, 
      geminiKey: apiKeys.gemini,
      groqKey: apiKeys.groq,
      openaiKey: apiKeys.openai,
      claudeKey: apiKeys.claude,
      openRouterKey: apiKeys.openrouter
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const toggleShow = (id) => setShowKey(prev => ({ ...prev, [id]: !prev[id] }))
  const clearKey = (id) => setApiKeys(prev => ({ ...prev, [id]: '' }))

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem' }}>
        <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '0.7rem', borderRadius: '14px', boxShadow: '0 8px 20px rgba(99,102,241,0.3)' }}>
          <Settings size={24} color="white" />
        </div>
        <div>
          <h1 className="title-gradient" style={{ margin: 0, fontSize: '1.8rem' }}>Inference Engine Settings</h1>
          <p style={{ color: '#94a3b8', margin: '0.2rem 0 0', fontSize: '0.9rem' }}>
            Save API keys once — select your engine from the Dashboard anytime.
          </p>
        </div>
      </div>

      {/* Active Engine Selector */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <h3 style={{ margin: '0 0 1rem', color: '#e2e8f0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Cpu size={16} style={{ color: '#818cf8' }} /> Active Inference Engine
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.8rem' }}>
          {ENGINES.map(engine => (
            <motion.button
              key={engine.id}
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveEngine(engine.id)}
              style={{
                padding: '1rem',
                borderRadius: '14px',
                border: activeEngine === engine.id ? `2px solid ${engine.color}` : '2px solid rgba(255,255,255,0.06)',
                background: activeEngine === engine.id ? `${engine.color}18` : 'rgba(255,255,255,0.02)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                boxShadow: activeEngine === engine.id ? `0 0 20px ${engine.color}30` : 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '1.3rem' }}>{engine.icon}</span>
                {activeEngine === engine.id && <CheckCircle size={15} color={engine.color} />}
              </div>
              <div style={{ fontWeight: 600, color: activeEngine === engine.id ? engine.color : '#cbd5e1', fontSize: '0.85rem' }}>{engine.name}</div>
              <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '0.2rem' }}>{engine.model}</div>
              {!apiKeys[engine.id] && <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', color: '#ef4444' }}>⚠ No key</div>}
              {apiKeys[engine.id] && <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', color: '#22c55e' }}>✓ Key saved</div>}
            </motion.button>
          ))}
        </div>
      </div>

      {/* API Keys */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '1.8rem' }}>
        {ENGINES.map(engine => (
          <div key={engine.id} className="glass-card" style={{
            padding: '1.2rem 1.5rem',
            border: `1px solid ${activeEngine === engine.id ? engine.color + '40' : 'rgba(255,255,255,0.05)'}`,
            transition: 'border-color 0.3s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: engine.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                {engine.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.9rem' }}>{engine.name}</div>
                <a href={engine.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#6366f1', fontSize: '0.72rem', textDecoration: 'none' }}>
                  Get API Key →
                </a>
              </div>
              {activeEngine === engine.id && (
                <span style={{ background: `${engine.color}20`, color: engine.color, padding: '0.15rem 0.6rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, border: `1px solid ${engine.color}40`, flexShrink: 0 }}>
                  ACTIVE
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Key size={13} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                <input
                  type={showKey[engine.id] ? 'text' : 'password'}
                  value={apiKeys[engine.id] || ''}
                  onChange={(e) => setApiKeys(prev => ({ ...prev, [engine.id]: e.target.value }))}
                  placeholder={`${engine.name} API key (${engine.placeholder})`}
                  style={{ margin: 0, paddingLeft: '2.2rem', width: '100%', fontFamily: 'monospace', fontSize: '0.83rem' }}
                />
              </div>
              <button onClick={() => toggleShow(engine.id)} title={showKey[engine.id] ? 'Hide' : 'Show'}
                style={{ width: '38px', height: '38px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>
                {showKey[engine.id] ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              {apiKeys[engine.id] && (
                <button onClick={() => clearKey(engine.id)} title="Clear"
                  style={{ width: '38px', height: '38px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ef4444', flexShrink: 0 }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Save */}
      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleSave} className="btn-primary"
        style={{ width: '100%', padding: '1rem', fontSize: '1rem', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
          background: saved ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          boxShadow: saved ? '0 4px 20px rgba(16,185,129,0.4)' : '0 4px 20px rgba(99,102,241,0.4)', transition: 'all 0.3s ease' }}>
        {saved ? <><CheckCircle size={18} /> Settings Saved!</> : <><Save size={18} /> Save Settings & Activate Engine</>}
      </motion.button>

      <div style={{ marginTop: '1.5rem', padding: '1rem 1.2rem', background: 'rgba(99,102,241,0.08)', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.15)', fontSize: '0.82rem', color: '#94a3b8', lineHeight: '1.6' }}>
        <strong style={{ color: '#a5b4fc' }}>ℹ️ Key Storage:</strong> Keys are saved in your browser's <code>localStorage</code> and are never sent to any server other than the respective AI provider. They persist across sessions automatically.
      </div>
    </div>
  )
}

export default SettingsPage
