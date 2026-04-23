import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain, Sparkles } from 'lucide-react';

const MemoryPage = () => {
  const [memory, setMemory] = useState('');

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem('testpilot_ai_memory');
    if (saved) setMemory(saved);
  }, []);

  // Auto-save to local storage
  const handleMemoryChange = (e) => {
    const val = e.target.value;
    setMemory(val);
    localStorage.setItem('testpilot_ai_memory', val);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card"
      style={{ padding: '2.5rem', borderRadius: '24px', position: 'relative', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'rgba(236, 72, 153, 0.2)', padding: '0.6rem', borderRadius: '12px' }}>
          <Brain size={24} color="#ec4899" />
        </div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>QA Knowledge Base</h2>
      </div>

      <p style={{ color: '#94a3b8', lineHeight: '1.6', marginBottom: '2rem', maxWidth: '800px' }}>
        Instructions or context entered here will be "remembered" by the AI and included in every generation. 
        Use this for coding standards, project-specific business rules, or preferred testing styles.
      </p>

      <div style={{ position: 'relative' }}>
        <textarea
          value={memory}
          onChange={handleMemoryChange}
          placeholder="Enter instructions, constraints, or context here... (e.g., 'Always use async/await', 'Follow SauceDemo naming conventions', etc.)"
          style={{
            width: '100%',
            minHeight: '400px',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '1.5rem',
            color: 'white',
            fontSize: '1rem',
            lineHeight: '1.6',
            outline: 'none',
            resize: 'vertical',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
          }}
        />
        
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'flex-end', 
          gap: '0.5rem', 
          marginTop: '1rem',
          fontSize: '0.8rem',
          color: '#64748b'
        }}>
          <Sparkles size={14} color="#f59e0b" />
          <span>Context Active</span>
          <span style={{ margin: '0 0.5rem', opacity: 0.3 }}>•</span>
          <span>Safe Sync active</span>
        </div>
      </div>

      {/* Background Glow */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-10%',
        width: '40%',
        height: '40%',
        background: 'radial-gradient(circle, rgba(236, 72, 153, 0.05) 0%, transparent 70%)',
        zIndex: -1,
        pointerEvents: 'none'
      }} />
    </motion.div>
  );
};

export default MemoryPage;
