import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { KeyRound, Link as LinkIcon, Mail, ShieldCheck } from 'lucide-react'

const JIRA_CREDS_KEY = 'testpilot_jira_creds'

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    baseUrl: import.meta.env?.VITE_JIRA_URL || '',
    email: import.meta.env?.VITE_JIRA_EMAIL || '',
    token: import.meta.env?.VITE_JIRA_TOKEN || ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Auto-fill saved Jira credentials
  useEffect(() => {
    const saved = localStorage.getItem(JIRA_CREDS_KEY)
    if (saved) {
      try {
        const { baseUrl, email } = JSON.parse(saved)
        setFormData(prev => ({ ...prev, baseUrl: baseUrl || prev.baseUrl, email: email || prev.email }))
      } catch {}
    }
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setTimeout(() => {
      if (formData.baseUrl && formData.email && formData.token) {
        // Save Jira URL + email (NOT token for security)
        localStorage.setItem(JIRA_CREDS_KEY, JSON.stringify({ baseUrl: formData.baseUrl, email: formData.email }))
        onLogin(formData)
      }
      setIsSubmitting(false)
    }, 800)
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="glass-card" 
      style={{ maxWidth: '440px', width: '100%', margin: '15vh auto', padding: '3rem 2.5rem' }}
    >
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <motion.div 
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}
          style={{ width: '64px', height: '64px', background: 'linear-gradient(135deg, #6366f1, #a855f7)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.4)' }}
        >
          <ShieldCheck color="white" size={32} />
        </motion.div>
        
        <h1 className="title-gradient" style={{ margin: '0 0 0.5rem', fontSize: '2rem' }}>Jira QA Assistant</h1>
        <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.95rem' }}>
          Connect your workspace to begin autonomous QA capabilities.
        </p>
      </div>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <LinkIcon size={14} /> Workspace URL
          </label>
          <input 
            type="url" 
            placeholder="e.g. https://domain.atlassian.net" 
            value={formData.baseUrl}
            onChange={(e) => setFormData({...formData, baseUrl: e.target.value})}
            required
            style={{ margin: 0 }}
          />
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem 0 0.5rem' }}>
            <Mail size={14} /> Email Address
          </label>
          <input 
            type="email" 
            placeholder="developer@thinkpalm.com" 
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            required
            style={{ margin: 0 }}
          />
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem 0 0.5rem' }}>
            <KeyRound size={14} /> Jira API Token
          </label>
          <input 
            type="password" 
            placeholder="•••••••••••••••••••••" 
            value={formData.token}
            onChange={(e) => setFormData({...formData, token: e.target.value})}
            required
            style={{ margin: 0 }}
          />
        </div>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit" 
          disabled={isSubmitting}
          style={{ 
            marginTop: '1.5rem', 
            padding: '1rem',
            background: 'linear-gradient(to right, #4f46e5, #9333ea)',
            boxShadow: '0 4px 15px rgba(79, 70, 229, 0.4)'
          }}
        >
          {isSubmitting ? 'Authenticating...' : 'Connect to Jira'}
        </motion.button>
      </form>
    </motion.div>
  )
}

export default Login
