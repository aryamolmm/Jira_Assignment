import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart3, CheckCircle2, XCircle, Clock, Search, 
  Filter, FileText, Download, ExternalLink, Calendar
} from 'lucide-react';
import axios from 'axios';

const ExecutionReport = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupByTestCase, setGroupByTestCase] = useState(true);
  const [selectedRun, setSelectedRun] = useState(null);
  const [testCases, setTestCases] = useState([]);

  useEffect(() => {
    fetchResults();
    // Scan all localStorage keys for generated test cases
    const allCases = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('testpilot_cases_')) {
        try {
          const saved = JSON.parse(localStorage.getItem(key));
          if (Array.isArray(saved)) {
            saved.forEach(c => {
              // Ensure we don't add duplicate IDs from different stories
              if (!allCases.find(existing => existing.TC_ID === c.TC_ID)) {
                allCases.push(c);
              }
            });
          }
        } catch (e) { console.error('Failed to parse test cases for key', key, e); }
      }
    }
    setTestCases(allCases);
  }, []);

  const fetchResults = async () => {
    try {
      const resp = await axios.get('http://localhost:3001/api/execution-results');
      setResults(Array.isArray(resp.data) ? resp.data : []);
    } catch (err) {
      console.error('Failed to fetch results', err);
    } finally {
      setLoading(false);
    }
  };

  const getProcessedResults = () => {
    // 1. Get all unique test case IDs from definitions + results
    const allIds = new Set([
      ...testCases.map(tc => tc.TC_ID),
      ...results.map(r => r.test_case_id)
    ]);

    // 2. Map each ID to its latest result or "Pending"
    let merged = Array.from(allIds).map(id => {
      const latestResult = [...results]
        .filter(r => r.test_case_id === id)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      
      const definition = testCases.find(tc => tc.TC_ID === id);
      
      if (latestResult) {
        return { ...latestResult, isExecuted: true, title: definition?.Title || definition?.['Test Case Title'] || 'AI Generated Run' };
      } else {
        return {
          test_case_id: id,
          status: 'Pending',
          comments: 'This test case has not been executed yet.',
          timestamp: new Date().toISOString(),
          isExecuted: false,
          title: definition?.Title || definition?.['Test Case Title'] || 'Definition Missing'
        };
      }
    });

    // 3. Sorting: Executed first, then Pending, both by timestamp (or ID)
    merged.sort((a, b) => {
        if (a.isExecuted !== b.isExecuted) return b.isExecuted ? 1 : -1;
        return new Date(b.timestamp) - new Date(a.timestamp);
    });

    // 4. Filtering
    return merged.filter(res => {
      const matchesSearch = (res.test_case_id || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (res.title || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || res.status?.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  };

  const displayResults = getProcessedResults();

  const stats = {
    totalDefined: testCases.length,
    totalRuns: results.length,
    passed: results.filter(r => r.status === 'Pass' || r.status === 'Success').length,
    failed: results.filter(r => r.status === 'Fail' || r.status === 'Error').length,
    pending: testCases.length - new Set(results.map(r => r.test_case_id)).size
  };

  const passRate = (stats.passed + stats.failed) > 0 ? Math.round((stats.passed / (stats.passed + stats.failed)) * 100) : 0;

  const handleClearResults = async () => {
    if (window.confirm('Are you sure you want to clear all execution history and generated test cases? This will completely reset the report.')) {
      try {
        await axios.post('http://localhost:3001/api/execution-results/clear');
        
        // Also clear manual test cases from localStorage
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith('testpilot_cases_')) {
            localStorage.removeItem(key);
          }
        }
        
        setTestCases([]);
        fetchResults();
      } catch (err) { alert('Failed to clear results'); }
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '4rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', padding: '0.6rem', borderRadius: '12px' }}>
            <BarChart3 size={24} color="white" />
          </div>
          <div>
            <h1 className="title-gradient" style={{ margin: 0, fontSize: '1.8rem' }}>Execution Intelligence</h1>
            <p style={{ color: '#94a3b8', margin: '0.2rem 0 0', fontSize: '0.9rem' }}>Comprehensive status of generated test cases and execution history</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
            <button onClick={handleClearResults} style={{ width: 'auto', padding: '0.7rem 1.2rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                Clear All Results
            </button>
            <button onClick={fetchResults} className="btn-secondary" style={{ width: 'auto', padding: '0.7rem 1.2rem' }}>
                Refresh Results
            </button>
        </div>
      </header>

      {/* Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem' }}>
        {[
          { label: 'Manual Cases', value: stats.totalDefined, color: '#f8fafc', sub: 'Total Generated' },
          { label: 'Pass Rate', value: `${passRate}%`, color: '#10b981', sub: 'Success Metrics' },
          { label: 'Passed', value: stats.passed, color: '#10b981', sub: 'Successful runs' },
          { label: 'Failed', value: stats.failed, color: '#ef4444', sub: 'Requires fixing' },
          { label: 'Pending', value: Math.max(0, stats.pending), color: '#94a3b8', sub: 'Not executed yet' },
        ].map((card, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            style={{
              background: 'rgba(30, 41, 59, 0.4)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '16px',
              padding: '1.2rem',
              textAlign: 'center'
            }}
          >
            <div style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>{card.label}</div>
            <div style={{ color: card.color, fontSize: '1.6rem', fontWeight: 800 }}>{card.value}</div>
            <div style={{ color: '#475569', fontSize: '0.6rem', marginTop: '0.3rem' }}>{card.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Filters Bar */}
      <div style={{ 
        display: 'flex', gap: '1.5rem', alignItems: 'center', 
        background: 'rgba(15, 23, 42, 0.6)', padding: '1rem', 
        borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input 
            type="text" 
            placeholder="Filter by TC ID or Title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ 
              width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', padding: '0.6rem 1rem 0.6rem 2.6rem', color: '#f8fafc', outline: 'none', fontSize: '0.9rem'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <Filter size={18} color="#6366f1" />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ 
              background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', padding: '0.6rem 1rem', color: '#f8fafc', outline: 'none', fontSize: '0.9rem'
            }}
          >
            <option value="all">All Statuses</option>
            <option value="pass">Passed</option>
            <option value="success">Success</option>
            <option value="fail">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      {/* Merged Results List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>Syncing results...</div>
        ) : displayResults.length === 0 ? (
          <div className="glass-card" style={{ padding: '4rem', textAlign: 'center', color: '#64748b' }}>
             No test cases or executions found.
          </div>
        ) : (
          displayResults.map((res, i) => (
            <motion.div 
              key={res.test_case_id + i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              style={{
                background: 'rgba(15, 23, 42, 0.4)',
                borderLeft: `4px solid ${
                    (res.status === 'Pass' || res.status === 'Success') ? '#10b981' : 
                    (res.status === 'Pending' ? '#475569' : '#ef4444')
                }`,
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1.5rem',
                cursor: res.isExecuted ? 'pointer' : 'default',
                opacity: res.status === 'Pending' ? 0.7 : 1
              }}
              whileHover={res.isExecuted ? { scale: 1.01, background: 'rgba(30, 41, 59, 0.6)' } : {}}
              onClick={() => res.isExecuted && setSelectedRun(res)}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: '0.95rem' }}>{res.test_case_id}</span>
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 500 }}>{res.title}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '600px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {res.comments}
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: '120px' }}>
                <div style={{ 
                  color: (res.status === 'Pass' || res.status === 'Success') ? '#10b981' : 
                         (res.status === 'Pending' ? '#94a3b8' : '#ef4444'),
                  fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.2rem'
                }}>
                  {res.status.toUpperCase()}
                </div>
                {res.isExecuted && (
                    <div style={{ fontSize: '0.7rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                        <Clock size={12} /> {new Date(res.timestamp).toLocaleTimeString()}
                    </div>
                )}
              </div>
              
              {res.isExecuted && (
                <div style={{ color: '#334155' }}>
                    <ChevronRight size={18} />
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Detailed Modal */}
      <AnimatePresence>
        {selectedRun && (
          <div style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', 
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' 
          }}>
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{ 
                background: '#0f172a', width: '100%', maxWidth: '800px', borderRadius: '24px', 
                border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden'
              }}
            >
              <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Run Details: {selectedRun.test_case_id}</h3>
                <button onClick={() => setSelectedRun(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
              </div>
              <div style={{ padding: '2rem', maxHeight: '70vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                   <div>
                      <div style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Execution Time</div>
                      <div style={{ color: '#f8fafc' }}>{new Date(selectedRun.timestamp).toLocaleString()}</div>
                   </div>
                   <div>
                      <div style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Final Status</div>
                      <div style={{ color: (selectedRun.status === 'Pass' || selectedRun.status === 'Success') ? '#10b981' : '#ef4444', fontWeight: 800, fontSize: '1.2rem' }}>{selectedRun.status}</div>
                   </div>
                </div>
                <div style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Agent Execution Logs</div>
                <pre style={{ 
                  background: '#020617', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)',
                  color: '#94a3b8', fontSize: '0.85rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace'
                }}>
                  {selectedRun.output || selectedRun.comments}
                </pre>
              </div>
              <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.2)', textAlign: 'right' }}>
                <button onClick={() => window.print()} className="btn-primary" style={{ width: 'auto', padding: '0.6rem 1.5rem' }}>Download Report</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ChevronRight = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
);

const thStyle = { padding: '1.2rem', textAlign: 'left', color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 };
const tdStyle = { padding: '1.2rem', verticalAlign: 'middle' };

export default ExecutionReport;
