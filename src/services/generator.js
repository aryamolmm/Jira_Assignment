import axios from 'axios';

const getProxyUrl = () => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://127.0.0.1:3001' 
  : window.location.origin;

/**
 * QA Engine 1: Test Spec Creation (AI Driven)
 */
export const generateTestCasesAI = async (story, apiKey, engine = 'gemini', typesList = 'happy, negative, edge', testFormat = 'bdd') => {
  const PROXY_URL = getProxyUrl();
  const userMemory = localStorage.getItem('testpilot_ai_memory') || '';
  
  try {
    const response = await axios.post(`${PROXY_URL}/api/ai/generate`, {
      story,
      apiKey,
      type: 'testcases',
      engine,
      userMemory,
      typesList,
      testFormat
    });
    return response.data.testCases;
  } catch (error) {
    console.error('Agent 1 Error:', error);
    const backendError = error.response?.data?.error;
    const message = typeof backendError === 'object' ? (backendError.message || JSON.stringify(backendError)) : (backendError || error.message);
    throw new Error(message || 'QA Engine failed to parse Jira story.');
  }
};

/**
 * QA Engine 2: Automation Code Forging (AI Driven)
 */
export const generateAutomationScriptAI = async (story, apiKey, engine = 'gemini', tool = 'playwright', language = 'typescript', framework = 'none', mappingMode = 'ai') => {
  const PROXY_URL = getProxyUrl();
  const userMemory = localStorage.getItem('testpilot_ai_memory') || '';

  try {
    const response = await axios.post(`${PROXY_URL}/api/ai/generate`, {
      story,
      apiKey,
      type: 'script',
      engine,
      userMemory,
      tool,
      language,
      framework,
      mappingMode
    });
    return response.data.script;

  } catch (error) {
    console.error('Agent 2 Error:', error);
    throw new Error('QA Engine failed to generate automation script.');
  }
};


/**
 * QA Engine 2.1: Update Script from Steps (AI Driven)
 */
export const updateScriptFromStepsAI = async (story, script, steps, apiKey, engine = 'gemini', tool = 'playwright', language = 'typescript') => {
  const PROXY_URL = getProxyUrl();
  const userMemory = localStorage.getItem('testpilot_ai_memory') || '';

  try {
    const response = await axios.post(`${PROXY_URL}/api/ai/generate`, {
      story,
      apiKey,
      type: 'update_from_steps',
      engine,
      userMemory,
      tool,
      language,
      script,
      steps
    });
    return { script: response.data.script, steps: response.data.steps };
  } catch (error) {
    console.error('Agent 2.1 Error:', error);
    throw new Error('QA Engine failed to update script from steps.');
  }
};

/**
 * QA Engine 3: Self-Healing Forger
 */
export const reworkScriptAI = async (story, script, errorLog, apiKey, engine = 'gemini', tool = 'playwright', language = 'typescript') => {
  const PROXY_URL = getProxyUrl();
  const userMemory = localStorage.getItem('testpilot_ai_memory') || '';

  try {
    const response = await axios.post(`${PROXY_URL}/api/ai/rework`, {
      story,
      script,
      errorLog,
      apiKey,
      engine,
      userMemory,
      tool,
      language
    });
    return response.data.script;
  } catch (error) {
    console.error('Agent 3 Error:', error);
    throw new Error('QA Engine failed to fix script.');
  }
};

export const convertToCSV = (testCases) => {
  if (!testCases || testCases.length === 0) return '';
  const headers = Object.keys(testCases[0]);
  const rows = testCases.map(tc => 
    headers.map(header => `"${(tc[header] || '').toString().replace(/"/g, '""')}"`).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
};

export const convertToExcel = (testCases) => {
  if (!testCases || testCases.length === 0) return '';
  const headers = Object.keys(testCases[0]);
  
  let html = '<table><thead><tr>';
  headers.forEach(h => html += `<th style="background-color: #4f46e5; color: white;">${h}</th>`);
  html += '</tr></thead><tbody>';
  
  testCases.forEach(tc => {
    html += '<tr>';
    headers.forEach(h => html += `<td>${tc[h] || ''}</td>`);
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  return html;
};

export const downloadFile = (content, fileName, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.click();
};
