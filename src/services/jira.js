import axios from 'axios';

/**
 * Jira API Service
 * Note: Jira API usually requires CORS headers to be set. 
 * If running locally, you might need a CORS proxy or a browser extension to bypass CORS.
 */
const parseADF = (node) => {
  if (!node) return '';
  if (node.type === 'text') return node.text;
  if (!node.content) return '';
  return node.content.map(parseADF).join(node.type === 'paragraph' ? '\n' : ' ');
};

export const fetchUserStory = async (baseUrl, email, token, storyId) => {
  // Use current origin if in production, otherwise default to local proxy
  const PROXY_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://127.0.0.1:3001' 
    : window.location.origin;

  try {
    const response = await axios.post(`${PROXY_URL}/api/jira/fetch`, {
      baseUrl,
      email,
      token,
      storyId
    });

    const issue = response.data;
    const desc = issue.fields.description;
    
    return {
      id: issue.key,
      summary: issue.fields.summary,
      description: typeof desc === 'string' ? desc : parseADF(desc) || 'No description provided.',
      status: issue.fields.status.name,
      priority: issue.fields.priority?.name || 'Medium',
      assignee: issue.fields.assignee?.displayName || 'Unassigned',
      created: new Date(issue.fields.created).toLocaleDateString(),
      reporter: issue.fields.reporter?.displayName || 'Unassigned'
    };
  } catch (error) {
    console.error('Error fetching Jira story:', error);
    
    let message = 'Failed to fetch the story. Check your ID and API token.';
    
    if (error.response?.data) {
      const data = error.response.data;
      if (data.errorMessages && Array.isArray(data.errorMessages) && data.errorMessages.length > 0) {
        message = data.errorMessages[0];
      } else if (data.message) {
        message = typeof data.message === 'object' ? JSON.stringify(data.message) : data.message;
      } else if (data.error) {
        message = typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : data.error;
      }
    } else {
      message = error.message;
    }
    
    throw new Error(message);
  }
};
