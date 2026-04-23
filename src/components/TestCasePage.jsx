import { useState, useEffect, useRef } from 'react'
import { generateTestCasesAI, convertToCSV, convertToExcel, generateAutomationScriptAI } from '../services/generator'

const TestCasePage = ({ story, credentials, onBack, onGoToAutomation }) => {
  const [testCases, setTestCases] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [editingIndex, setEditingIndex] = useState(null)
  const [editFormData, setEditFormData] = useState({})
  const [testFormat, setTestFormat] = useState('bdd')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)
  const [selectedTypes, setSelectedTypes] = useState({
    happy: true,
    negative: true,
    edge: true,
    performance: false,
    security: false
  })

  const toggleType = (type) => {
    setSelectedTypes(prev => ({ ...prev, [type]: !prev[type] }))
  }

  const getActiveKey = () => {
    switch (credentials.engine) {
      case 'groq': return credentials.groqKey;
      case 'openrouter': return credentials.openRouterKey;
      case 'openai': return credentials.openaiKey;
      case 'claude': return credentials.claudeKey;
      default: return credentials.geminiKey;
    }
  }

  const performAnalysis = async () => {
    try {
      setLoading(true)
      setError(null)
      const typesList = Object.entries(selectedTypes).filter(([_, isSelected]) => isSelected).map(([type]) => type).join(', ')
      const activeKey = getActiveKey();
      
      if (!activeKey) {
        throw new Error(`No API key found for the selected engine (${credentials.engine}). Please check your Settings.`);
      }

      const cases = await generateTestCasesAI(story, activeKey, credentials.engine, typesList, testFormat)
      
      // Map Work Key to TC_ID
      const mappedCases = cases.map(c => {
        const newC = { ...c, 'TC_ID': c['Work Key'] || c['TC_ID'] || `TC-${Math.floor(Math.random() * 1000)}` };
        delete newC['Work Key'];
        return newC;
      });

      setTestCases(mappedCases)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Run analysis on mount
  useEffect(() => {
    performAnalysis()
  }, [])

  const handleEditRow = (index, tc) => {
    setEditingIndex(index)
    setEditFormData({ ...tc })
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setEditFormData({})
  }

  const handleSaveRow = (index) => {
    const updatedCases = [...testCases]
    updatedCases[index] = { ...editFormData }
    setTestCases(updatedCases)
    setEditingIndex(null)
    setEditFormData({})
  }

  const handleDeleteRow = (index) => {
    const updatedCases = testCases.filter((_, i) => i !== index)
    setTestCases(updatedCases)
  }

  const downloadFile = (content, fileName, type) => {
    const blob = new Blob([content], { type: `${type};charset=utf-8;` })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
  }

  if (loading) return (
    <div className="glass-card animate-pulse" style={{ textAlign: 'center', padding: '4rem' }}>
      <div className="spinner" style={{ margin: '0 auto 1.5rem' }}></div>
      <h2 className="title-gradient">Analyzing Story</h2>
      <p style={{ color: '#94a3b8' }}>Generating comprehensive QA suite...</p>
    </div>
  )

  if (error) return (
    <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
      <p style={{ color: '#ef4444', fontSize: '1.1rem', marginBottom: '0.5rem' }}>⚠️</p>
      <p style={{ color: '#ef4444', marginBottom: '1.5rem' }}>Analysis Failure<br />{error}</p>
      <button onClick={() => window.location.reload()}>Retry Analysis</button>
    </div>
  )

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '5rem' }}>
      {/* Header */}
      <div className="glass-card" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button onClick={onBack} style={{ width: 'auto', marginBottom: '0.75rem', background: 'transparent', border: '1px solid #10b981', color: '#10b981', padding: '0.4rem 1rem', fontSize: '0.85rem', borderRadius: '8px' }}>
            🔍 Back to Search
          </button>
          <h2 className="title-gradient" style={{ margin: 0 }}>BDD Testcases</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>{story?.key} – {story?.summary?.slice(0, 60)}...</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onGoToAutomation}
            disabled={testCases.length === 0}
            style={{
              padding: '0.6rem 1.2rem', fontSize: '0.85rem',
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              boxShadow: '0 4px 15px -5px rgba(99,102,241,0.4)',
              borderRadius: '8px', transition: 'transform 0.2s',
              color: 'white', fontWeight: 600, border: 'none', cursor: 'pointer'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            Generate Automation Script →
          </button>

          <button
            onClick={() => downloadFile(convertToCSV(testCases), `${story.id}_test_cases.csv`, 'text/csv')}
            className="secondary-btn"
            disabled={testCases.length === 0}
          >
            ↓ CSV
          </button>
          <button
            onClick={() => downloadFile(convertToExcel(testCases), `${story.id}_test_cases.xls`, 'application/vnd.ms-excel')}
            className="secondary-btn"
            disabled={testCases.length === 0}
          >
            ↓ Excel
          </button>
        </div>
      </div>

      {/* Generation Configuration Panel */}
      <div className="glass-card" style={{ marginBottom: '2rem', padding: '1.5rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start', background: 'rgba(15, 23, 42, 0.6)', overflow: 'visible', zIndex: 10 }}>
        <div style={{ flex: 1, minWidth: '250px', position: 'relative' }} ref={dropdownRef}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#a5b4fc', marginBottom: '0.8rem', fontWeight: 600 }}>Test Types</label>
          <div 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{ 
              padding: '0.6rem 1rem', borderRadius: '8px', background: '#0f172a', 
              border: '1px solid rgba(99, 102, 241, 0.3)', color: '#f8fafc', 
              width: '100%', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {Object.entries(selectedTypes).filter(([_, isSelected]) => isSelected).map(([type]) => type.charAt(0).toUpperCase() + type.slice(1)).join(', ') || 'Select Types...'}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>▼</span>
          </div>

          {isDropdownOpen && (
            <div style={{ 
              position: 'absolute', top: 'calc(100% + 0.5rem)', left: 0, width: '100%', 
              background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', 
              border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: '12px', zIndex: 50, 
              padding: '0.5rem', boxShadow: '0 10px 40px rgba(0,0,0,0.6)', overflow: 'hidden'
            }}>
              {['happy', 'negative', 'edge', 'performance', 'security'].map(type => (
                <label key={type} style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.8rem', 
                  cursor: 'pointer', borderRadius: '8px', background: 'transparent', transition: 'background 0.2s', margin: 0 
                }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${selectedTypes[type] ? '#8b5cf6' : 'rgba(255,255,255,0.3)'}`, background: selectedTypes[type] ? '#8b5cf6' : 'transparent', transition: '0.2s' }}>
                    {selectedTypes[type] && <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
                  </div>
                  <input type="checkbox" checked={selectedTypes[type]} onChange={() => toggleType(type)} style={{ display: 'none' }} />
                  <span style={{ fontSize: '0.9rem', color: selectedTypes[type] ? '#fff' : '#cbd5e1', textTransform: 'capitalize', fontWeight: selectedTypes[type] ? 600 : 400 }}>{type}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#a5b4fc', marginBottom: '0.8rem', fontWeight: 600 }}>TEST FORMAT</label>
          <select value={testFormat} onChange={e => setTestFormat(e.target.value)} style={{ padding: '0.6rem 1rem', borderRadius: '8px', background: '#0f172a', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#f8fafc', width: '100%', outline: 'none' }}>
            <option value="bdd">BDD / Gherkin Format</option>
            <option value="normal">Normal (Step-by-step) Format</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
          <button onClick={performAnalysis} className="btn-primary" disabled={loading} style={{ padding: '0.8rem 1.5rem', marginTop: '1.5rem', whiteSpace: 'nowrap' }}>
            {loading ? 'Generating...' : '↺ Regenerate Tests'}
          </button>
        </div>
      </div>

      {/* Test Cases Table */}
      {testCases.length > 0 && (
        <div className="glass-card" style={{ padding: 0, overflowX: 'auto', marginBottom: '2rem' }}>
          <table style={{ minWidth: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
              <tr>
                {['TC_ID', 'Scenario', 'Steps', 'Type', 'Expected Result', 'Actual Result', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '0.9rem 1rem', textAlign: 'left', color: '#818cf8', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {testCases.map((tc, i) => {
                const isEditing = editingIndex === i;
                
                return (
                  <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s', background: isEditing ? 'rgba(99, 102, 241, 0.05)' : 'transparent' }}
                    onMouseEnter={e => { if(!isEditing) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                    onMouseLeave={e => { if(!isEditing) e.currentTarget.style.background = 'transparent' }}
                  >
                    {isEditing ? (
                      <>
                        <td style={{ padding: '0.9rem 1rem' }}>
                          <input type="text" value={editFormData['TC_ID'] || ''} onChange={e => setEditFormData({...editFormData, 'TC_ID': e.target.value})} style={{ width: '80px', padding: '0.4rem', fontSize: '0.8rem' }} />
                        </td>
                        <td style={{ padding: '0.9rem 1rem' }}>
                          <textarea value={editFormData.Scenario_Name || ''} onChange={e => setEditFormData({...editFormData, Scenario_Name: e.target.value})} style={{ width: '100%', minWidth: '150px', padding: '0.4rem', fontSize: '0.8rem', minHeight: '60px' }} />
                        </td>
                        <td style={{ padding: '0.9rem 1rem' }}>
                          <textarea value={editFormData.Gherkin || ''} onChange={e => setEditFormData({...editFormData, Gherkin: e.target.value})} style={{ width: '100%', minWidth: '250px', padding: '0.4rem', fontSize: '0.8rem', minHeight: '100px', fontFamily: 'monospace' }} />
                        </td>
                        <td style={{ padding: '0.9rem 1rem' }}>
                          <select value={editFormData.Type || ''} onChange={e => setEditFormData({...editFormData, Type: e.target.value})} style={{ width: '120px', padding: '0.4rem', fontSize: '0.8rem', background: '#0f172a', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}>
                            <option value="">Select Type</option>
                            <option value="Happy Path">Happy Path</option>
                            <option value="Negative">Negative</option>
                            <option value="Edge Case">Edge Case</option>
                            <option value="Performance">Performance</option>
                            <option value="Security">Security</option>
                          </select>
                        </td>
                        <td style={{ padding: '0.9rem 1rem' }}>
                          <textarea value={editFormData.Expected_Result || ''} onChange={e => setEditFormData({...editFormData, Expected_Result: e.target.value})} style={{ width: '100%', minWidth: '150px', padding: '0.4rem', fontSize: '0.8rem', minHeight: '60px' }} />
                        </td>
                        <td style={{ padding: '0.9rem 1rem' }}>
                          <textarea value={editFormData.Actual_Result || ''} onChange={e => setEditFormData({...editFormData, Actual_Result: e.target.value})} style={{ width: '100%', minWidth: '150px', padding: '0.4rem', fontSize: '0.8rem', minHeight: '60px' }} placeholder="Blank" />
                        </td>
                        <td style={{ padding: '0.9rem 1rem', whiteSpace: 'nowrap' }}>
                          <button onClick={() => handleSaveRow(i)} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', marginRight: '0.5rem' }}>Save</button>
                          <button onClick={handleCancelEdit} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px' }}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '0.9rem 1rem', color: '#6366f1', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{tc['TC_ID']}</td>
                        <td style={{ padding: '0.9rem 1rem', fontWeight: '600', maxWidth: '200px', color: '#f8fafc' }}>{tc.Scenario_Name}</td>
                        <td style={{ padding: '0.9rem 1rem', color: '#cbd5e1', whiteSpace: 'pre-wrap', minWidth: '250px', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', margin: '0.5rem', lineHeight: '1.6' }}>
                          {tc.Gherkin}
                        </td>
                        <td style={{ padding: '0.9rem 1rem' }}>
                          <span style={{
                            padding: '0.25rem 0.8rem', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
                            background: tc.Type?.toLowerCase().includes('negative') ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                            color: tc.Type?.toLowerCase().includes('negative') ? '#f87171' : '#4ade80',
                            border: `1px solid ${tc.Type?.toLowerCase().includes('negative') ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`
                          }}>
                            {tc.Type || 'Unassigned'}
                          </span>
                        </td>
                        <td style={{ padding: '0.9rem 1rem', color: '#cbd5e1', fontSize: '0.85rem' }}>
                          {tc.Expected_Result || '-'}
                        </td>
                        <td style={{ padding: '0.9rem 1rem', color: '#cbd5e1', fontSize: '0.85rem' }}>
                          {tc.Actual_Result || ''}
                        </td>
                        <td style={{ padding: '0.9rem 1rem', display: 'flex', gap: '0.4rem' }}>
                           <button onClick={() => handleEditRow(i, tc)} title="Edit" style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.05)', fontSize: '0.9rem', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✏️</button>
                           <button onClick={() => handleDeleteRow(i)} title="Delete" style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.9rem', border: '1px solid rgba(239, 68, 68, 0.2)', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🗑️</button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}

export default TestCasePage
