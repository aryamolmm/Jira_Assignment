
export const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3001'
      : window.location.origin;
  }
  return 'http://localhost:3001';
};

export const API_URLS = {
  AGENT_RUN: `${getBaseUrl()}/api/agent/super/run`,
  EXECUTION_RESULTS: `${getBaseUrl()}/api/execution-results`,
  EXECUTE_TEST: `${getBaseUrl()}/api/execute-test`,
  CLEAR_RESULTS: `${getBaseUrl()}/api/execution-results/clear`,
  AGENT_EXECUTE: `${getBaseUrl()}/api/agent-execute`,
  AGENT_STREAM: (id) => `${getBaseUrl()}/api/agent-stream/${id}`,
  RECORDINGS: (src) => `${getBaseUrl()}/recordings/${src}`
};
