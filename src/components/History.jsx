import { motion } from 'framer-motion'
import { History as HistoryIcon, Clock, CheckCircle2 } from 'lucide-react'

const History = ({ historyList, onViewStory }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="animate-fade-in"
    >
      <header style={{ marginBottom: '3rem', background: 'rgba(30, 41, 59, 0.4)', padding: '1rem 2rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', padding: '0.6rem', borderRadius: '12px' }}>
          <HistoryIcon size={24} color="white" />
        </div>
        <div>
          <h1 className="title-gradient" style={{ margin: 0, fontSize: '1.5rem' }}>Fetched Story Archive</h1>
          <p style={{ color: '#94a3b8', margin: '0.2rem 0 0', fontSize: '0.85rem' }}>Your historical QA generation logs</p>
        </div>
      </header>

      {historyList && historyList.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {historyList.map((item, index) => (
            <motion.div 
              key={index}
              whileHover={{ scale: 1.01 }}
              className="glass-card"
              style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #6366f1', cursor: 'pointer' }}
              onClick={() => onViewStory(item.story)}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', padding: '0.2rem 0.6rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600 }}>
                    {item.story.id || item.story.key}
                  </span>
                  <span style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Clock size={12} /> {new Date(item.timestamp).toLocaleString()}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#f8fafc' }}>{item.story.summary}</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Generated with {item.engine === 'groq' ? 'Groq LPU' : 'Gemini Pro'} • {item.testCount || 0} Test Cases</p>
              </div>
              <CheckCircle2 color="#10b981" />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <HistoryIcon size={48} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#9ca3af' }}>No History Yet</h3>
          <p style={{ color: '#64748b', margin: 0, fontSize: '0.9rem' }}>Generate some test cases on the Dashboard to see them here.</p>
        </div>
      )}
    </motion.div>
  )
}

export default History
