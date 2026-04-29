import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, Save, MessageSquare, AlertCircle } from 'lucide-react';
import axios from 'axios';

const ManualExecutionPage = ({ story }) => {
  const [testCases, setTestCases] = useState([]);
  const [executionResults, setExecutionResults] = useState({});
  const [stats, setStats] = useState({ total: 0, passed: 0, failed: 0, pending: 0 });

  useEffect(() => {
    const savedCases = JSON.parse(localStorage.getItem(`testpilot_cases_${story?.id}`) || '[]');
    setTestCases(savedCases);
    fetchResults();
  }, [story]);

  useEffect(() => { calculateStats(); }, [testCases, executionResults]);

  const fetchResults = async () => {
    try {
      const resp = await axios.get('http://localhost:3001/api/execution-results');
      const resultsMap = {};
      resp.data.forEach(res => { resultsMap[res.test_case_id] = res; });
      setExecutionResults(resultsMap);
    } catch (err) { console.error('Failed to fetch results', err); }
  };

  const calculateStats = () => {
    const total = testCases.length;
    let passed = 0; let failed = 0;
    testCases.forEach(tc => {
      const res = executionResults[tc.TC_ID];
      if (res?.status === 'Pass') passed++;
      else if (res?.status === 'Fail') failed++;
    });
    setStats({ total, passed, failed, pending: total - (passed + failed) });
  };

  const handleStatusChange = (tcId, status) => {
    setExecutionResults(prev => ({
      ...prev,
      [tcId]: { ...prev[tcId], status }
    }));
  };

  const handleCommentChange = (tcId, comments) => {
    setExecutionResults(prev => ({
      ...prev,
      [tcId]: { ...prev[tcId], comments }
    }));
  };

  const saveExecution = async (tcId) => {
    const res = executionResults[tcId] || {};
    try {
      await axios.post('http://localhost:3001/api/execute-test', {
        test_case_id: tcId,
        status: res.status || 'Not Run',
        comments: res.comments || '',
        manual: true,
        syncToQMetry: true,
        storyKey: story?.key
      });
      alert(`Test case ${tcId} results saved to Jira QMetry!`);
    } catch (err) {
      console.error('Save failed', err);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* ── Manual Stats ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {[
          { label: 'Total Manual Cases', value: stats.total, color: '#6366f1', icon: <MessageSquare size={18} /> },
          { label: 'Passed', value: stats.passed, color: '#10b981', icon: <CheckCircle2 size={18} /> },
          { label: 'Failed', value: stats.failed, color: '#ef4444', icon: <XCircle size={18} /> },
          { label: 'Not Run', value: stats.pending, color: '#94a3b8', icon: <Clock size={18} /> },
        ].map(card => (
          <div key={card.label} style={{
            background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '16px', padding: '1.2rem', display: 'flex', alignItems: 'center', gap: '1rem'
          }}>
            <div style={{ background: `${card.color}15`, padding: '10px', borderRadius: '12px', color: card.color }}>{card.icon}</div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{card.label}</div>
              <div style={{ color: '#f8fafc', fontSize: '1.4rem', fontWeight: 700 }}>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Manual Execution Table ───────────────────────────────────── */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
        <div style={{ padding: '1.5rem', background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={20} color="#10b981" /> Manual Execution Tracker
          </h3>
          <p style={{ margin: '0.2rem 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>Update test statuses and sync with Jira Stories / QMetry</p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
              <tr>
                <th style={thStyle}>Scenario Details</th>
                <th style={thStyle}>Execution Status</th>
                <th style={thStyle}>Comments / Observations</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {testCases.map((tc) => {
                const res = executionResults[tc.TC_ID] || {};
                return (
                  <tr key={tc.TC_ID} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{tc.Scenario_Name || tc.Scenario}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>{tc.TC_ID}</div>
                    </td>
                    <td style={tdStyle}>
                      <select 
                        value={res.status || 'Not Run'} 
                        onChange={(e) => handleStatusChange(tc.TC_ID, e.target.value)}
                        style={selectStyle}
                      >
                        <option value="Not Run">Not Run</option>
                        <option value="Pass">Pass</option>
                        <option value="Fail">Fail</option>
                        <option value="Blocked">Blocked</option>
                        <option value="Skipped">Skipped</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <textarea 
                        placeholder="Enter execution notes..."
                        value={res.comments || ''}
                        onChange={(e) => handleCommentChange(tc.TC_ID, e.target.value)}
                        style={textareaStyle}
                      />
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => saveExecution(tc.TC_ID)} className="btn-save">
                        <Save size={14} /> Sync QMetry
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {testCases.length === 0 && (
        <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
          <AlertCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
          <p>No test cases found for this story.</p>
        </div>
      )}

      <style>{`
        .btn-save {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.2);
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 0.8rem;
          transition: all 0.2s;
        }
        .btn-save:hover {
          background: rgba(16, 185, 129, 0.25);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
};

const thStyle = { padding: '1.2rem', textAlign: 'left', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' };
const tdStyle = { padding: '1.2rem', verticalAlign: 'top' };

const selectStyle = {
  width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', padding: '8px 12px', color: '#f8fafc', outline: 'none', fontSize: '0.85rem'
};

const textareaStyle = {
  width: '100%', minHeight: '60px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px', padding: '10px', color: '#f8fafc', outline: 'none', fontSize: '0.85rem', resize: 'vertical'
};

export default ManualExecutionPage;
