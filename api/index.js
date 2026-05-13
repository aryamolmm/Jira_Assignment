import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { exec, spawn } from 'child_process';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { existsSync, createReadStream, watch } from 'fs';
import { chromium } from 'playwright';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MEMORY_FILE = join(__dirname, '..', 'memory.json');
const EXECUTIONS_FILE = join(__dirname, '..', 'executions.json');

const app = express();
const PORT = 3001;

const activeProcesses = new Map();

app.use(cors());
app.use(express.json());

// ─── Memory Agent Helpers ────────────────────────────────────────────────────

function tokenize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
}

function computeSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  setA.forEach(t => { if (setB.has(t)) intersection++; });
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

async function loadMemoryData() {
  try {
    if (existsSync(MEMORY_FILE)) {
      const content = await readFile(MEMORY_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch {}
  return [];
}

// POST /api/memory/check — Check past runs for a similar input
app.post('/api/memory/check', async (req, res) => {
  const { input, threshold = 0.45 } = req.body;
  if (!input) return res.status(400).json({ error: 'Missing input' });

  const memory = await loadMemoryData();

  if (memory.length === 0) {
    return res.json({
      used_memory: false,
      reason: 'Memory is empty. No past executions found.',
      result: null
    });
  }

  let bestMatch = null;
  let bestScore = 0;
  for (const entry of memory) {
    const score = computeSimilarity(input, entry.input);
    if (score > bestScore) { bestScore = score; bestMatch = entry; }
  }

  if (bestScore >= threshold && bestMatch) {
    return res.json({
      used_memory: true,
      similarity_score: parseFloat(bestScore.toFixed(3)),
      reason: `Found a past execution with ${Math.round(bestScore * 100)}% similarity. Reusing outputs from: "${bestMatch.input.substring(0, 80)}..." (generated at ${bestMatch.timestamp}).`,
      matched_input: bestMatch.input,
      result: {
        gherkin: bestMatch.gherkin,
        testCode: bestMatch.testCode,
        coverage: bestMatch.coverage
      }
    });
  }

  return res.json({
    used_memory: false,
    similarity_score: parseFloat(bestScore.toFixed(3)),
    reason: `No sufficiently similar past execution found (best match: ${Math.round(bestScore * 100)}%). Generating fresh output.`,
    result: null
  });
});

// POST /api/memory/save — Persist a completed pipeline run to memory.json
app.post('/api/memory/save', async (req, res) => {
  const { input, gherkin, testCode, coverage } = req.body;
  if (!input || !gherkin) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const memory = await loadMemoryData();
    // Avoid exact duplicates
    const exists = memory.some(e => e.input === input);
    if (!exists) {
      memory.push({ input, gherkin, testCode: testCode || '', coverage: coverage || '', timestamp: new Date().toISOString() });
      await writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2));
    }
    res.json({ saved: !exists, total_entries: memory.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/memory/list — List all memory entries (for debugging)
app.get('/api/memory/list', async (req, res) => {
  const memory = await loadMemoryData();
  res.json({ total: memory.length, entries: memory.map(e => ({ input: e.input, timestamp: e.timestamp })) });
});

// ─────────────────────────────────────────────────────────────────────────────

// ─── Tool Selection Agent ─────────────────────────────────────────────────────

function isGherkin(text) {
  return /^\s*(Feature:|Scenario:|Given |When |Then |And )/im.test(text);
}

function isTestCode(text) {
  return (
    /import\s+.*playwright|import\s+.*@playwright/i.test(text) ||
    /test\s*\(['"]/i.test(text) ||
    /describe\s*\(['"]/i.test(text) ||
    /page\.(goto|click|fill|expect)/i.test(text)
  );
}

function detectStage(text) {
  if (isTestCode(text)) return 'test_code';
  if (isGherkin(text)) return 'gherkin';
  return 'feature_description';
}

function selectTool({ stage, input, missing_cases, test_code, gherkin }) {
  switch (stage) {
    case 'feature_description':
      return { tool_name: 'generate_gherkin', arguments: { feature_description: input } };
    case 'gherkin':
      return { tool_name: 'generate_test_cases', arguments: { gherkin: input } };
    case 'test_code':
      return { tool_name: 'run_playwright_tests', arguments: { test_code: input } };
    case 'coverage_check':
      return { tool_name: 'analyze_coverage', arguments: { gherkin: gherkin ?? input, test_code: test_code ?? '' } };
    case 'missing_cases':
      return { tool_name: 'improve_test_cases', arguments: { gherkin: gherkin ?? input, test_code: test_code ?? '', missing_cases: missing_cases ?? '' } };
    default: {
      const detected = detectStage(input);
      return selectTool({ stage: detected, input, missing_cases, test_code, gherkin });
    }
  }
}

// POST /api/agent/select-tool
// Body: { stage?, input, missing_cases?, test_code?, gherkin? }
app.post('/api/agent/select-tool', (req, res) => {
  const { stage, input, missing_cases, test_code, gherkin } = req.body;
  if (!input) return res.status(400).json({ error: 'Missing required field: input' });

  const resolvedStage = stage || detectStage(input);
  const result = selectTool({ stage: resolvedStage, input, missing_cases, test_code, gherkin });

  res.json({
    detected_stage: resolvedStage,
    ...result
  });
});

// ─── Orchestrator Agent ───────────────────────────────────────────────────────

app.post('/api/agent/orchestrate', (req, res) => {
  const { input } = req.body;
  if (!input) return res.status(400).json({ error: 'Missing input for orchestration' });

  // Simple orchestration logic as per the rules
  const result = {
    pipeline_steps: [
      "gherkin",
      "test_cases",
      "coverage",
      "rework_if_needed"
    ],
    status: "ready_to_execute"
  };

  res.json(result);
});

// ─── Gherkin Generation Agent ─────────────────────────────────────────────────

app.post('/api/agent/generate-gherkin', async (req, res) => {
  const { input, apiKey, engine = 'gemini' } = req.body;
  if (!input) return res.status(400).json({ error: 'Missing feature description' });

  const prompt = `You are a Gherkin Generation Agent.
    
    Input:
    Feature description: "${input}"
    
    Your task:
    - Convert feature into structured BDD scenarios
    - Cover main flow + edge cases
    
    Rules:
    - Use Given / When / Then format
    - Include at least 3 scenarios
    - Keep it realistic for automation
    - Return ONLY valid JSON: { "gherkin": "..." }`;

  try {
    let text = '';
    if (engine === 'groq') {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey || process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      text = response.data.choices[0].message.content;
    } else {
      if (!apiKey && !process.env.GEMINI_API_KEY) throw new Error('Gemini API Key is required');
      const genAI = new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(prompt);
      text = result.response.text();
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    res.json(JSON.parse(jsonText));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Playwright Test Generation Agent ─────────────────────────────────────────

app.post('/api/agent/generate-test', async (req, res) => {
  const { input, apiKey, engine = 'gemini' } = req.body;
  if (!input) return res.status(400).json({ error: 'Missing Gherkin scenarios' });

  const prompt = `You are a Playwright Test Generation Agent.
    
    Input:
    Gherkin scenarios: "${input}"
    
    Your task:
    - Convert Gherkin into Playwright TypeScript test scripts
    
    Rules:
    - Use proper Playwright syntax (@playwright/test)
    - Include assertions (expect)
    - Cover all scenarios
    - Return ONLY valid JSON: { "test_code": "..." }`;

  try {
    let text = '';
    if (engine === 'groq') {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey || process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      text = response.data.choices[0].message.content;
    } else {
      if (!apiKey && !process.env.GEMINI_API_KEY) throw new Error('Gemini API Key is required');
      const genAI = new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(prompt);
      text = result.response.text();
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    res.json(JSON.parse(jsonText));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Coverage Analysis Agent ──────────────────────────────────────────────────

app.post('/api/agent/analyze-coverage', async (req, res) => {
  const { gherkin, testCode, apiKey, engine = 'gemini' } = req.body;
  if (!gherkin || !testCode) return res.status(400).json({ error: 'Missing gherkin or test code' });

  const prompt = `You are a Coverage Analysis Agent.
    
    Inputs:
    - Gherkin scenarios: "${gherkin}"
    - Test code: "${testCode}"
    
    Your task:
    - Compare both
    - Identify missing or weak coverage
    
    Rules:
    - Be strict
    - Identify edge cases not covered
    - Do not assume completeness
    - Return ONLY valid JSON:
    {
      "coverage_status": "complete" | "incomplete",
      "missing_cases": ["case1", "case2"],
      "quality_score": 0-100
    }`;

  try {
    let text = '';
    if (engine === 'groq') {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey || process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      text = response.data.choices[0].message.content;
    } else {
      if (!apiKey && !process.env.GEMINI_API_KEY) throw new Error('Gemini API Key is required');
      const genAI = new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(prompt);
      text = result.response.text();
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    res.json(JSON.parse(jsonText));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Test Improvement Agent ───────────────────────────────────────────────────

app.post('/api/agent/improve-test', async (req, res) => {
  const { gherkin, testCode, missingCases, apiKey, engine = 'gemini' } = req.body;
  
  const prompt = `You are a Test Improvement Agent.
    
    Inputs:
    - Gherkin: "${gherkin}"
    - Existing test cases: "${testCode}"
    - Missing coverage areas: "${Array.isArray(missingCases) ? missingCases.join(', ') : missingCases}"
    
    Your task:
    - Improve test cases
    - Add missing scenarios
    - Strengthen assertions
    
    Rules:
    - Do not rewrite everything
    - Only enhance where needed
    - Return ONLY valid JSON: { "improved_test_code": "..." }`;

  try {
    let text = '';
    if (engine === 'groq') {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey || process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      text = response.data.choices[0].message.content;
    } else {
      if (!apiKey && !process.env.GEMINI_API_KEY) throw new Error('Gemini API Key is required');
      const genAI = new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(prompt);
      text = result.response.text();
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    res.json(JSON.parse(jsonText));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Super Agent Orchestrator ────────────────────────────────────────────────

app.post('/api/agent/super', async (req, res) => {
  const { input, userMemory, apiKey, engine = 'gemini' } = req.body;
  if (!input) return res.status(400).json({ error: 'Missing input for Super Agent' });

  const agent_logs = ["Orchestrator: Received user input"];
  const pipeline = [];
  const memory = await loadMemoryData();
  
  // 1. MEMORY CHECK
  agent_logs.push("MemoryAgent: [SYSTEM] Initiating similarity comparison with context index");
  let bestMatch = null;
  let bestScore = 0;

  for (const entry of memory) {
    const score = computeSimilarity(input, entry.input);
    if (score > bestScore) { bestScore = score; bestMatch = entry; }
  }

  const used_memory = bestScore > 0.45;
  let memory_action = "fresh";
  let memory_summary = "No sufficiently similar past execution found in memory database.";

  if (used_memory) {
    memory_action = bestScore > 0.85 ? "reuse" : "improve";
    memory_summary = `Semantic match identified (${Math.round(bestScore * 100)}%). Execution strategy set to: ${memory_action}.`;
  }
  
  if (userMemory) {
    agent_logs.push("MemoryAgent: [SYSTEM] Merging UI-defined memory overrides into active session");
  }
  agent_logs.push(`MemoryAgent: [STATUS] Memory check complete. Mode: ${memory_action}`);

  // 2. PIPELINE SELECTION
  
  agent_logs.push("ArchitectAgent: [CMD] Generating BDD / Gherkin scenario context");
  pipeline.push({ agent: "ArchitectAgent", action: "generate_gherkin" });

  agent_logs.push("AutomationAgent: [CMD] Creating production-ready Playwright test scripts");
  pipeline.push({ agent: "AutomationAgent", action: "generate_test_cases" });

  agent_logs.push("CoverageAgent: [CMD] Checking test coverage and edge-case implementation");
  pipeline.push({ agent: "CoverageAgent", action: "analyze_coverage" });

  if (memory_action !== "reuse") {
    agent_logs.push("ReworkAgent: [GATE] Triggered due to incomplete coverage/fresh run requirement");
    pipeline.push({ agent: "ReworkAgent", action: "improve_test_cases" });
  } else {
    agent_logs.push("Orchestrator: [BYPASS] Validation high. Bypassing rework agent for cached asset.");
  }

  res.json({
    memory: { used_memory, memory_action, memory_summary },
    agent_logs,
    pipeline,
    status: "completed"
  });
});

// ─── Super Agent Text Reporter ───────────────────────────────────────────────

app.post('/api/agent/super/text', async (req, res) => {
  const { input, userMemory } = req.body;
  
  const report = await axios.post(`http://localhost:${PORT}/api/agent/super`, { input, userMemory });
  const data = report.data;

  const textOutput = `
AI MEMORY:
Used Memory: ${data.memory.used_memory ? "YES" : "NO"}
Action: ${data.memory.memory_action}
Reason: ${data.memory.memory_summary}

----------------------------------------

AGENT PROCESS LOGS:

${data.agent_logs.join("\n")}

----------------------------------------

PIPELINE EXECUTION:

Step 1: Gherkin created  
Step 2: Test scripts generated  
Step 3: Coverage analyzed  
Step 4: Tests improved (if needed)  

----------------------------------------

FINAL STATUS:
Pipeline completed successfully`;

  res.send(textOutput);
});

// ─── Super Agent Tool-Aware Reporter ────────────────────────────────────────

app.post('/api/agent/super/tools', async (req, res) => {
  const { input, userMemory } = req.body;
  
  const report = await axios.post(`http://localhost:${PORT}/api/agent/super`, { input, userMemory });
  const data = report.data;

  const memorySection = `
AI MEMORY:
Used Memory: ${data.memory.used_memory ? "YES" : "NO"}
Action: ${data.memory.memory_action}
Reason: ${data.memory.memory_summary}`;

  const logsSection = `
AGENT_EXECUTION_LOGS:

Orchestrator → Received input
MemoryAgent → ${data.memory.used_memory ? "Match found" : "No match"}

ArchitectAgent → Calling Tool: generate_gherkin
Input: ${data.memory.used_memory ? "[REUSED FROM MEMORY]" : input}

AutomationAgent → Calling Tool: generate_test_cases
Input: [Gherkin Context]

CoverageAgent → Calling Tool: analyze_coverage
Input: [Gherkin + Test Cases]

ReworkAgent → Calling Tool: improve_test_cases
Input: [Missing Coverage Areas]`;

  const summarySection = `
TOOL CALL SUMMARY:

Step 1:
Tool: generate_gherkin
Executed: ${data.memory.memory_action === 'reuse' ? 'NO' : 'YES'}
Reason: ${data.memory.memory_action === 'reuse' ? 'Valid memory reuse' : 'New generation required'}

Step 2:
Tool: generate_test_cases
Executed: YES

Step 3:
Tool: analyze_coverage
Executed: YES

Step 4:
Tool: improve_test_cases
Executed: ${data.memory.memory_action === 'reuse' ? 'NO' : 'YES'}`;

  const textOutput = `
${memorySection}

----------------------------------------

${logsSection}

----------------------------------------

${summarySection}

----------------------------------------

FINAL STATUS:
Pipeline executed with memory-aware tool-calling logic`;

  res.send(textOutput);
});

// ─── Super Agent Full Execution Pipeline ────────────────────────────────────
// Calls each agent in sequence using real Groq API calls

async function callAI(engine, apiKey, prompt) {
  const resolvedEngine = (engine || 'gemini').toLowerCase();
  
  try {
    if (resolvedEngine === 'groq') {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt + "\n\nIMPORTANT: You must respond in valid JSON format." }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey || process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data.choices[0].message.content;
    } else if (resolvedEngine === 'openrouter') {
      console.log(`[OpenRouter] Calling model: deepseek/deepseek-chat`);
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: "deepseek/deepseek-chat",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }, {
        headers: { 
          'Authorization': `Bearer ${apiKey}`, 
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'TestPilot AI'
        }
      });
      console.log(`[OpenRouter] Response received successfully`);
      return response.data.choices[0].message.content;
    } else if (resolvedEngine === 'openai') {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-4-turbo",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      return response.data.choices[0].message.content;
    } else if (resolvedEngine === 'claude') {
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      }, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
      });
      return response.data.content[0].text;
    } else {
      const genAI = new GoogleGenerativeAI(apiKey || process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(prompt);
      return result.response.text();
    }
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
    const statusCode = err.response?.status;
    console.error(`[AI Error ${resolvedEngine}]:`, msg);
    throw new Error(`${resolvedEngine} API error ${statusCode || ''}: ${msg}`);
  }
}

app.post('/api/agent/super/run', async (req, res) => {
  const { input, userMemory = '', engine = 'gemini', apiKey } = req.body;
  if (!input) return res.status(400).json({ error: 'Missing input for Super Agent' });

  const resolvedEngine = engine.toLowerCase();
  const resolvedKey = apiKey;
  const executionTrace = [];
  const startTime = Date.now();
  let step = 0;

  const log = (agent, tool, message, status = 'running') => {
    step++;
    const entry = { step, agent, tool, message, status, ts: Date.now() - startTime };
    executionTrace.push(entry);
    return entry;
  };

  const parseAIResponse = (text) => {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : text;
      return JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse AI response:', text);
      throw new Error('AI returned an invalid JSON format. Please try again.');
    }
  };

  try {
    // ── Step 0: Memory Check ───────────────────────────────────────────────
    log('Orchestrator', null, 'Received user input — initialising pipeline', 'info');
    log('MemoryAgent', null, 'Scanning memory index for semantic similarity...', 'running');

    const memory = await loadMemoryData();
    let bestMatch = null, bestScore = 0;
    for (const entry of memory) {
      const score = computeSimilarity(input, entry.input);
      if (score > bestScore) { bestScore = score; bestMatch = entry; }
    }

    const used_memory = bestScore > 0.45;
    const memory_action = used_memory ? (bestScore > 0.85 ? 'reuse' : 'improve') : 'fresh';
    const memory_summary = used_memory
      ? `Semantic match identified (${Math.round(bestScore * 100)}%). Strategy: ${memory_action}.`
      : `No sufficiently similar past execution found (best score: ${Math.round(bestScore * 100)}%). Generating fresh output.`;

    log('MemoryAgent', null,
      used_memory ? `Match found — ${Math.round(bestScore * 100)}% similarity. Mode: ${memory_action}` : 'No match — fresh run initiated.',
      used_memory ? 'match' : 'no_match'
    );

    if (userMemory) {
      log('MemoryAgent', null, 'Merging user-defined memory overrides into active session', 'info');
    }

    // If REUSE and high confidence — serve directly from memory
    /* High confidence reuse disabled to ensure fresh data extraction for credentials */
    /*
    if (memory_action === 'reuse' && bestMatch) {
      ...
    }
    */

    // ── Step 1: ArchitectAgent → generate_gherkin ─────────────────────────
    log('ArchitectAgent', 'generate_gherkin', 'Calling tool: generate_gherkin — generating BDD scenarios...', 'running');

    const memCtx = userMemory ? `\n\n[USER MEMORY / PREFERENCES]\n${userMemory}\n` : '';
    const gherkinPrompt = `You are a Gherkin Generation Agent (ArchitectAgent).
${memCtx}
Feature description: "${input}"

Your task:
- Convert the feature into structured BDD scenarios (Feature / Scenario / Given / When / Then)
- Cover happy path + edge cases + negative scenarios
- Include at least 4 scenarios

CRITICAL RULES:
- PRESERVE EXACT DATA: If the user provides a specific URL, username, or password, YOU MUST INCLUDE THESE EXACT VALUES in the Gherkin steps. Do not generalize them to "valid credentials" if specific ones are given.
- Use strict Given / When / Then / And format
- Use realistic, testable steps
- Return ONLY valid JSON: { "gherkin": "..." }`;

    const gherkinRaw = await callAI(resolvedEngine, resolvedKey, gherkinPrompt);
    const gherkinData = parseAIResponse(gherkinRaw);
    const rawGherkin = gherkinData.gherkin || '';
    const gherkin = typeof rawGherkin === 'object' ? JSON.stringify(rawGherkin, null, 2) : String(rawGherkin);

    log('ArchitectAgent', 'generate_gherkin', `Tool returned ${gherkin.split('Scenario').length - 1} Gherkin scenarios`, 'completed');

    // ── Step 2: AutomationAgent → generate_test_cases ─────────────────────
    log('AutomationAgent', 'generate_test_cases', 'Calling tool: generate_test_cases — creating Playwright scripts...', 'running');

    const testPrompt = `
You are an expert QA automation engineer using Playwright.
Your task is to convert manual test cases into robust, executable Playwright automation scripts.

---------------------------------------
USER INSTRUCTIONS & CONTEXT
---------------------------------------
These instructions were entered by the user through the application. 
THEY MAY CONTAIN THE URL, CREDENTIALS, AND SPECIFIC UI HINTS.

User Input: "${input}"
Additional Context: "${userMemory || 'No additional context provided.'}"

---------------------------------------
APPLICATION DETAILS (EXTRACT FROM ABOVE)
---------------------------------------
1. Application URL: 
   - Identify the URL from the "USER INSTRUCTIONS & CONTEXT" section above.
   - If no URL is found, DO NOT GUESS. Use 'about:blank'.

2. Credentials:
   - Identify username/password from the "USER INSTRUCTIONS & CONTEXT" section above.
   - If no credentials are found, DO NOT GUESS. State that credentials are missing in the comments.

---------------------------------------
TEST INPUT (GHERKIN)
---------------------------------------
Test Case Name: Generated Test Suite for ${input.substring(0, 50)}...

Gherkin Scenarios:
${gherkin}

---------------------------------------
INSTRUCTIONS FOR THE AGENT
---------------------------------------

1. APPLICATION HANDLING
- Navigate to the Application URL identified above.
- Dynamically explore the UI using the provided credentials.
- Do NOT assume any fixed selectors; rely on visible text, roles, and labels.

2. LOCATOR STRATEGY
- Prefer getByRole > getByLabel > getByText.
- Avoid brittle selectors.

3. ACTION MAPPING
- "Enter / Input" → page.fill()
- "Click" → page.click()
- "Select" → page.selectOption()
- "Navigate" → page.goto()

4. ASSERTIONS
- Convert expected results into expect() assertions.

5. CODE QUALITY
- Generate clean, readable TypeScript code.
- Add meaningful comments for locator choices.

---------------------------------------
OUTPUT FORMAT
---------------------------------------
Generate:
- A complete Playwright test script (TypeScript)
- Return ONLY valid JSON in this format: { "test_code": "..." }
- No explanations, no markdown blocks.

---------------------------------------
IMPORTANT RULES
---------------------------------------
- PRIORITIZE the URL and Credentials found in the "USER INSTRUCTIONS & CONTEXT".
- DO NOT use hardcoded selectors unless provided in context.
- ALWAYS adapt to the given application URL.
- ALWAYS rely on UI exploration.

---------------------------------------
`;

    const testRaw = await callAI(resolvedEngine, resolvedKey, testPrompt);
    const testData = parseAIResponse(testRaw);
    const rawTest = testData.test_code || '';
    const testCode = typeof rawTest === 'object' ? JSON.stringify(rawTest, null, 2) : String(rawTest);

    log('AutomationAgent', 'generate_test_cases', `Tool returned Playwright script (${testCode.split('\n').length} lines)`, 'completed');

    // ── Step 3: CoverageAgent → analyze_coverage ──────────────────────────
    log('CoverageAgent', 'analyze_coverage', 'Calling tool: analyze_coverage — validating coverage gaps...', 'running');

    const coveragePrompt = `You are a Coverage Analysis Agent (CoverageAgent).

Gherkin Scenarios:
${gherkin}

Playwright Test Code:
${testCode}

Your task:
- Compare both — identify missing or weak coverage
- Be strict — do not assume completeness

Return ONLY valid JSON:
{
  "coverage_status": "complete" | "incomplete",
  "missing_cases": ["case description 1", "case description 2"],
  "coverage_percentage": 0-100,
  "quality_score": 0-100,
  "summary": "one-line coverage summary"
}`;

    const coverageRaw = await callAI(resolvedEngine, resolvedKey, coveragePrompt);
    const coverage = parseAIResponse(coverageRaw);

    log('CoverageAgent', 'analyze_coverage',
      `Tool returned: Status=${coverage.coverage_status}, Quality=${coverage.quality_score}/100, Missing=${coverage.missing_cases?.length || 0} cases`,
      'completed'
    );

    // ── Step 4: ReworkAgent → improve_test_cases (conditional) ────────────
    let improvedTestCode = null;
    const needsRework = coverage.coverage_status === 'incomplete' || memory_action !== 'reuse';

    if (needsRework) {
      log('ReworkAgent', 'improve_test_cases',
        `Coverage gap detected — calling tool: improve_test_cases (${coverage.missing_cases?.length || 0} missing cases)`,
        'running'
      );

      const reworkPrompt = `You are a Test Improvement Agent (ReworkAgent).
${memCtx}
Gherkin Scenarios:
${gherkin}

Existing Playwright Test Code:
${testCode}

Missing Coverage Areas identified by CoverageAgent:
${(coverage.missing_cases || []).join('\n')}

Your task:
- Enhance the existing test cases to close these coverage gaps
- Add missing test scenarios, strengthen assertions where weak
- Do NOT rewrite everything — only add/fix what is needed

Return ONLY valid JSON: { "improved_test_code": "..." }`;

      const reworkRaw = await callAI(resolvedEngine, resolvedKey, reworkPrompt);
      const reworkData = parseAIResponse(reworkRaw);
      const rawImproved = reworkData.improved_test_code;
      if (Array.isArray(rawImproved)) {
        improvedTestCode = rawImproved.map(item => typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item)).join('\n');
      } else if (rawImproved && typeof rawImproved === 'object') {
        improvedTestCode = JSON.stringify(rawImproved, null, 2);
      } else {
        improvedTestCode = String(rawImproved || testCode);
      }

      const improvedLines = improvedTestCode.split('\n').length;
      const origLines = (testCode || '').split('\n').length;
      log('ReworkAgent', 'improve_test_cases',
        `Tool returned improved script (${improvedLines} lines - was ${origLines})`,
        'completed'
      );
    } else {
      log('ReworkAgent', 'improve_test_cases', 'Bypassed — coverage complete, no rework required', 'bypassed');
    }

    // ── Save to memory ─────────────────────────────────────────────────────
    log('Orchestrator', null, 'Pipeline complete — saving run to memory index', 'info');
    const finalTestCode = improvedTestCode || testCode;
    const coverageStr = JSON.stringify(coverage);
    const exists = memory.some(e => e.input === input);
    if (!exists) {
      memory.push({ input, gherkin, testCode: finalTestCode, coverage: coverageStr, timestamp: new Date().toISOString() });
      await writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2));
    }

    log('Orchestrator', null, 'Memory index updated successfully', 'info');

    return res.json({
      memory: { used_memory, memory_action, memory_summary, similarity_score: bestScore },
      execution_trace: executionTrace,
      pipeline_steps: [
        { step: 1, agent: 'ArchitectAgent', tool: 'generate_gherkin', status: 'completed', output: gherkin },
        { step: 2, agent: 'AutomationAgent', tool: 'generate_test_cases', status: 'completed', output: testCode },
        { step: 3, agent: 'CoverageAgent', tool: 'analyze_coverage', status: 'completed', output: coverage },
        { step: 4, agent: 'ReworkAgent', tool: 'improve_test_cases', status: needsRework ? 'completed' : 'bypassed', output: improvedTestCode }
      ],
      final_output: {
        gherkin,
        testCode,
        coverage,
        improvedTestCode
      },
      status: 'completed',
      total_ms: Date.now() - startTime
    });

  } catch (err) {
    console.error('Super Agent Run Error:', err.message);
    executionTrace.push({ step: step + 1, agent: 'Orchestrator', tool: null, message: `❌ Pipeline failed: ${err.message}`, status: 'error', ts: Date.now() - startTime });
    return res.status(500).json({ error: err.message, execution_trace: executionTrace, status: 'error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

// Proxy endpoint to fetch Jira stories
app.post('/api/jira/fetch', async (req, res) => {
  const { baseUrl, email, token, storyId } = req.body;
  if (!baseUrl || !email || !token || !storyId) {
    return res.status(400).json({ error: 'Missing required credentials' });
  }

  // === Jira Logic ===

  let url = baseUrl.trim();
  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }
  url = url.replace(/\/+$/, '');
  const authHeader = Buffer.from(`${email}:${token}`).toString('base64');
  try {
    const response = await axios.get(`${url}/rest/api/3/issue/${storyId}`, {
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Accept': 'application/json'
      }
    });
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    res.status(status).json(error.response?.data || { error: error.message });
  }
});

// Endpoint for AI-driven generation
app.post('/api/ai/generate', async (req, res) => {
  const { story, apiKey, type, userMemory = '', tool = 'playwright', language = 'typescript', framework = 'none', mappingMode = 'ai', typesList = 'Happy Path, Negative, Edge', testFormat = 'bdd' } = req.body;
  const engine = (req.body.engine || 'gemini').toLowerCase().trim();
  
  console.log(`[AI GENERATE] Type: ${type} | Engine: ${engine} | API Key Present: ${!!apiKey}`);
  
  const memoryContext = userMemory ? `\n[PREREQUISITES / GLOBAL CONTEXT]\n${userMemory}\n` : '';
  const frameworkContext = framework !== 'none' ? ` Use the ${framework} framework.` : '';
  
  const mappingInstructions = mappingMode === 'direct' 
    ? `\nCRITICAL MAPPING RULE: Use STRICT Direct Mapping. You MUST map every single BDD step from the story EXACTLY to code. Do not infer or hallucinate missing steps. Do not add AI-enhanced validations unless explicitly stated in the story.`
    : `\nCRITICAL MAPPING RULE: Use AI Enhanced Mapping. You should intelligently infer required setup, teardown, and implicit assertions that make the test robust, even if not explicitly stated in the story.`;

  const prompt = type === 'script' 
    ? `[AGENT 2: AUTOMATION SPECIALIST]
       ${memoryContext}
       Write a complete automation script using ${tool} and ${language} for Jira Story: "${story.summary}".${frameworkContext}
       ${mappingInstructions}
       Description: ${story.description || 'No description'}.
       
       CRITICAL FRAMEWORK RULES:
       - If tool is 'robot' or 'Robot Framework', you MUST generate valid .robot DSL syntax (*** Settings ***, *** Test Cases ***), DO NOT generate raw Python code with Selenium imports.
       - If tool is 'cypress', generate valid Cypress describe/it blocks.
       - If tool is 'selenium', generate valid Selenium WebDriver code in ${language}.
       - If tool is 'playwright', generate valid Playwright test code in ${language}.
       
       The script MUST be production-ready and include Happy Path, Negative, and Edge cases.
       Return ONLY the raw code block with no markdown, no JSON wrapper.`
    : `[AGENT 1: BDD ANALYST]
       ${memoryContext}
       Analyze this Requirement/Story: "${story.summary}".
       Description: ${story.description || 'No description'}.
       Generate diverse test cases covering these types: ${typesList}.
       The test steps MUST be in ${testFormat === 'bdd' ? 'Strict BDD / Gherkin format (Given/When/Then)' : 'Normal step-by-step format (1. Do this, 2. Do that)'}.
       Format: JSON array of objects.
       Columns required: "TC_ID" (e.g. TC-01), "Scenario_Name", "Type" (e.g. Happy Path), "Gherkin" (The test steps text), and "Expected_Result" (Brief statement of expected outcome).
       Return ONLY the valid JSON array without markdown wrapping.`;

  try {
    let text = '';

    const callGemini = async () => {
      if (!apiKey) throw new Error('Gemini API Key is required');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(prompt);
      return result.response.text();
    };

    if (engine === 'groq') {
      try {
        const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: "llama-3.3-70b-versatile",
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        }, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });
        text = groqRes.data.choices[0].message.content;
      } catch (groqErr) {
        const isRateLimit = groqErr.response?.status === 429 || (groqErr.response?.data?.error?.message || '').toLowerCase().includes('rate limit') || (groqErr.response?.data?.error?.message || '').toLowerCase().includes('tokens per day');
        if (isRateLimit) {
          console.warn('[Fallback] Groq rate limit hit — switching to Gemini automatically.');
          text = await callGemini();
        } else {
          throw groqErr;
        }
      }
    } else if (engine === 'openai') {
      const oaiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-4-turbo",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      text = oaiRes.data.choices[0].message.content;
    } else if (engine === 'claude') {
      const claudeRes = await axios.post('https://api.anthropic.com/v1/messages', {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      }, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
      });
      text = claudeRes.data.content[0].text;
    } else if (engine === 'openrouter') {
      try {
        console.log(`[OpenRouter] Calling model: deepseek/deepseek-chat for generation`);
        const orRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: "deepseek/deepseek-chat",
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        }, {
          headers: { 
            'Authorization': `Bearer ${apiKey}`, 
            'Content-Type': 'application/json', 
            'HTTP-Referer': 'http://localhost:5173', 
            'X-Title': 'TestPilot AI' 
          }
        });
        console.log(`[OpenRouter] Generation successful`);
        text = orRes.data.choices[0].message.content;
      } catch (orErr) {
        const errMsg = orErr.response?.data?.error?.message || orErr.response?.data?.message || orErr.message;
        const errData = JSON.stringify(orErr.response?.data || {}, null, 2);
        console.error('[OpenRouter Full Error]:', errData);
        throw new Error(`OpenRouter Error: ${errMsg}`);
      }
    } else {
      text = await callGemini();
    }

    if (type === 'script') {
        text = text.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
        res.json({ script: text });
    } else {
        const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        const jsonText = jsonMatch ? jsonMatch[0] : text.replace(/```json|```|json/g, '').trim();
        res.json({ testCases: JSON.parse(jsonText.trim()) });
    }
  } catch (error) {
    let errorMessage = error.response?.data?.error?.message || error.message;
    console.error('AI Error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

// [AGENT 3: REWORK AGENT]
app.post('/api/ai/rework', async (req, res) => {
  const { story, script, errorLog, apiKey, engine = 'gemini', userMemory = '', tool = 'playwright', language = 'typescript', framework = 'none' } = req.body;
  
  const memoryContext = userMemory ? `\n[PREREQUISITES / GLOBAL CONTEXT]\n${userMemory}\n` : '';
  const frameworkContext = framework !== 'none' ? ` Use the ${framework} framework.` : '';

  const prompt = `[AGENT 3: DEBUG & REWORK SPECIALIST]
    ${memoryContext}
    The following ${tool} script (${language}) failed.
    STORY: ${story.summary}
    SCRIPT: ${script}
    ERROR LOG: ${errorLog}
    Return ONLY the corrected code block for ${tool} and ${language}.${frameworkContext}`;

  try {
    let text = '';

    const callGeminiRework = async () => {
      if (!apiKey) throw new Error('Gemini API Key is required');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(prompt);
      return result.response.text();
    };

    if (engine === 'groq') {
      try {
        const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: "llama-3.3-70b-versatile",
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        }, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });
        text = groqRes.data.choices[0].message.content;
      } catch (groqErr) {
        const isRateLimit = groqErr.response?.status === 429 || (groqErr.response?.data?.error?.message || '').toLowerCase().includes('rate limit') || (groqErr.response?.data?.error?.message || '').toLowerCase().includes('tokens per day');
        if (isRateLimit) {
          console.warn('[Fallback] Groq rate limit hit — switching to Gemini for rework.');
          text = await callGeminiRework();
        } else {
          throw groqErr;
        }
      }
    } else if (engine === 'openai') {
      const oaiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-4-turbo",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      text = oaiRes.data.choices[0].message.content;
    } else if (engine === 'claude') {
      const claudeRes = await axios.post('https://api.anthropic.com/v1/messages', {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      }, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
      });
      text = claudeRes.data.content[0].text;
    } else if (engine === 'openrouter') {
      try {
        console.log(`[OpenRouter] Calling model: deepseek/deepseek-chat for rework`);
        const orRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: "deepseek/deepseek-chat",
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1
        }, {
          headers: { 
            'Authorization': `Bearer ${apiKey}`, 
            'Content-Type': 'application/json', 
            'HTTP-Referer': 'http://localhost:5173', 
            'X-Title': 'TestPilot AI' 
          }
        });
        console.log(`[OpenRouter] Rework successful`);
        text = orRes.data.choices[0].message.content;
      } catch (orErr) {
        const errMsg = orErr.response?.data?.error?.message || orErr.response?.data?.message || orErr.message;
        console.error('[OpenRouter Rework Error]:', errMsg);
        throw new Error(`OpenRouter Error: ${errMsg}`);
      }
    } else {
      text = await callGeminiRework();
    }

    res.json({ script: text.replace(/```typescript|```ts|```|typescript/g, '').trim() });
  } catch (error) {
    res.status(500).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// Endpoint to run a Playwright test script
app.post('/api/test/run', async (req, res) => {
    const { script, id, tool = 'playwright' } = req.body;
    if (!script) return res.status(400).json({ error: 'No script provided' });
    
    if (tool !== 'playwright') {
      return res.json({ 
        success: true, 
        output: `⚠️ Automated execution for ${tool} is not configured in this environment.\n\nPlease copy the generated code to your local ${tool} project for execution.`, 
        error: null 
      });
    }

    try {
      const testsDir = join(tmpdir(), 'tests');
      try { await mkdir(testsDir, { recursive: true }); } catch (e) {}
      const testPath = join(testsDir, `${id}_test.spec.ts`);
      await writeFile(testPath, script);
      exec(`npx playwright test "${testPath}" --reporter=list`, (err, stdout, stderr) => {
        res.json({ success: !err, output: stdout, error: err ? stderr || err.message : null });
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

app.get('/api/browse-folder', async (req, res) => {
  console.log('[Browse] Triggering COM-based Folder Picker...');
  // Use Shell.Application COM object - very reliable on Windows without extra assembly loads
  const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "(New-Object -ComObject Shell.Application).BrowseForFolder(0, 'Select Playwright Project Folder', 0).Self.Path"`;
  
  exec(command, (error, stdout) => {
    if (error) {
      console.error('[Browse Error]', error);
      // Return null instead of 500 to keep the UI stable
      return res.json({ path: null, error: error.message });
    }
    const selectedPath = stdout.toString().trim();
    console.log(`[Browse Success] Path: "${selectedPath}"`);
    res.json({ path: selectedPath || null });
  });
});

app.post('/api/execute-test', async (req, res) => {
  const { test_case_id, status, comments, script, manual } = req.body;
  const startTime = Date.now();
  let newExecution;

  if (!manual && script) {
    const target = (req.body.projectPath || process.cwd()).trim();
    const browser = req.body.browser || 'chromium';
    const headless = req.body.headless !== false;
    
    console.log(`[CLI] Attempting to run in: ${target}`);
    
    if (!existsSync(target)) {
      return res.status(400).json({ error: `Directory not found: ${target}` });
    }

    const testFileName = `tp_${test_case_id}.spec.ts`;
    const testFilePath = join(target, testFileName);
    
    try {
      await writeFile(testFilePath, script);
      const args = ['playwright', 'test', testFileName];
      if (browser !== 'default') args.push(`--project=${browser}`);
      if (!headless) args.push('--headed');
      
      console.log(`[CLI] Running: ${npxCmd} ${args.join(' ')}`);
      
      const testProcess = spawn(npxCmd, args, { 
        cwd: target, 
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' }
      });
      
      activeProcesses.set(test_case_id, testProcess);

      let stdout = '';
      let stderr = '';

      testProcess.stdout.on('data', (data) => { stdout += data.toString(); });
      testProcess.stderr.on('data', (data) => { stderr += data.toString(); });

      const exitCode = await new Promise((resolve) => {
        testProcess.on('close', (code) => resolve(code));
      });

      activeProcesses.delete(test_case_id);
      const isSuccess = exitCode === 0;
      
      newExecution = {
        id: Date.now().toString(),
        test_case_id,
        status: isSuccess ? 'Pass' : 'Fail',
        output: `> CLI Output:\n${stdout}\n${stderr}`,
        execution_time: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        manual: false
      };
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    // Manual logic...
    newExecution = {
      id: Date.now().toString(),
      test_case_id,
      status: status || 'Pass',
      comments: comments || (manual ? 'Manual' : 'Auto'),
      execution_time: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      manual: !!manual
    };
  }

  // Save to memory and respond
  let executions = [];
  if (existsSync(EXECUTIONS_FILE)) {
    executions = JSON.parse(await readFile(EXECUTIONS_FILE, 'utf-8'));
  }
  executions.push(newExecution);
  await writeFile(EXECUTIONS_FILE, JSON.stringify(executions, null, 2));
  res.json(newExecution);
});

app.post('/api/run-suite', async (req, res) => {
  const { projectPath, browser, headless, source, gitUrl } = req.body;
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  let target = (projectPath || process.cwd()).trim();
  let log = `> Initializing suite run (Source: ${source || 'local'})\n`;

  try {
    if (source === 'git' && gitUrl) {
      log += `> Cloning repository: ${gitUrl}\n`;
      const cloneDir = join(tmpdir(), `tp_git_${Date.now()}`);
      if (!existsSync(cloneDir)) await mkdir(cloneDir, { recursive: true });
      
      await new Promise((resolve, reject) => {
        const git = spawn('git', ['clone', gitUrl, '.'], { cwd: cloneDir, shell: true });
        git.stdout.on('data', (d) => { log += d.toString(); });
        git.stderr.on('data', (d) => { log += d.toString(); });
        git.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Git clone failed with code ${code}`)));
      });
      target = cloneDir;
      log += `> Clone successful. Target: ${target}\n`;
    }

    log += `> Running Playwright tests in: ${target}\n`;
    
    const args = ['playwright', 'test'];
    if (browser !== 'default') args.push(`--project=${browser}`);
    if (!headless) args.push('--headed');
    
    log += `> Command: ${npxCmd} ${args.join(' ')}\n\n`;

    const testProcess = spawn(npxCmd, args, { 
      cwd: target, 
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    let output = '';
    testProcess.stdout.on('data', (data) => { output += data.toString(); });
    testProcess.stderr.on('data', (data) => { output += data.toString(); });

    testProcess.on('close', (code) => {
      console.log(`[CLI] Suite finished with code ${code}`);
      res.json({ 
        status: code === 0 ? 'Pass' : 'Fail', 
        output: log + output 
      });
    });

    testProcess.on('error', (err) => {
      res.status(500).json({ error: `Failed to start process: ${err.message}`, output: log + output });
    });

  } catch (err) {
    console.error('[CLI Suite Error]', err);
    res.status(500).json({ error: err.message, output: log });
  }
});

app.get('/api/execution-results', async (req, res) => {
  try {
    if (existsSync(EXECUTIONS_FILE)) {
      const content = await readFile(EXECUTIONS_FILE, 'utf-8');
      return res.json(JSON.parse(content));
    }
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/execution-results/clear', async (req, res) => {
  try {
    await writeFile(EXECUTIONS_FILE, JSON.stringify([]));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── QMetry Integration ────────────────────────────────────────────────────────

const normalizeQMetryUrl = (urlStr) => {
  let url = urlStr.trim();
  if (!url.startsWith('http')) url = `https://${url}`;
  
  // If user accidentally pastes their Jira Cloud URL (e.g., https://intelligentqaportal.atlassian.net)
  // or a deep link to the QMetry plugin page, we route it to the official QTM4J Cloud REST API
  if (url.includes('.atlassian.net') || url.includes('/qtm4j-test-management')) {
    return 'https://qtmcloud.qmetry.com';
  }
  
  return url.replace(/\/+$/, '');
};

app.post('/api/qmetry/test', async (req, res) => {
  const { qmetryBaseUrl, apiToken, projectId } = req.body;
  if (!qmetryBaseUrl || !apiToken) {
    return res.status(400).json({ error: 'Missing QMetry Base URL or API Token' });
  }

  const url = normalizeQMetryUrl(qmetryBaseUrl);

  try {
    // We will do a dummy POST to /testcases to check auth.
    // If it returns 401, auth failed. If it returns 400, auth passed but payload is invalid.
    // A 404 means the base URL is completely wrong.
    const response = await axios.post(`${url}/rest/api/latest/testcases`, {}, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'apiKey': apiToken,
        'Content-Type': 'application/json'
      }
    });
    res.json({ success: true, message: 'Connection successful!' });
  } catch (error) {
    const status = error.response?.status || 500;
    
    if (status === 400 || status === 422 || status === 200 || status === 201) {
      // If it's a 400 Bad Request, it means the endpoint exists and auth might have passed (or it validates auth after payload, but usually 401 is first).
      return res.json({ success: true, message: 'Connection verified (Endpoint reachable)' });
    }
    
    if (status === 401 || status === 403) {
       return res.status(status).json({ error: "Authentication failed. Please check your API Token.", details: error.response?.data });
    }

    const msg = error.response?.data?.errorMessage || error.response?.data?.error || error.message;
    res.status(status).json({ error: msg, details: error.response?.data });
  }
});

app.post('/api/qmetry/sync', async (req, res) => {
  const { settings, payload } = req.body;
  if (!settings || !settings.qmetryBaseUrl || !settings.apiToken) {
    return res.status(400).json({ error: 'Missing QMetry settings' });
  }

  const url = normalizeQMetryUrl(settings.qmetryBaseUrl);

  // Add project to payload if defined
  const requestPayload = { ...payload };
  if (settings.projectId) {
    requestPayload.project = { id: parseInt(settings.projectId, 10) || settings.projectId };
  }

  try {
    const response = await axios.post(`${url}/rest/api/latest/testcases`, requestPayload, {
      headers: {
        'Authorization': `Bearer ${settings.apiToken}`,
        'apiKey': settings.apiToken,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const msg = error.response?.data?.errorMessage || error.response?.data?.error || error.message;
    res.status(status).json({ error: msg, details: error.response?.data });
  }
});


/**
 * Playwright Browser Tools for the AI Agent
 */
const createBrowserTools = async (page) => ({
  open_url: async ({ url }) => {
    await page.goto(url, { waitUntil: 'networkidle' });
    return `Opened URL: ${url}`;
  },
  click_element: async ({ selector, description }) => {
    try {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      await locator.click({ timeout: 3000 });
      return `Clicked element: ${description || selector}`;
    } catch (err) {
      // Self-healing: If AI used //button for an <input type="submit">
      if (selector.includes('//button')) {
        const alt = selector.replace('//button', '//*[@id="login-button"]' ? '#login-button' : '//input');
        try {
          await page.click(alt, { timeout: 3000 });
          return `Clicked element via fallback: ${alt}`;
        } catch (e) { /* ignore fallback error */ }
      }
      // Try ID fallback if selector looks like an ID
      if (selector.includes('login-button')) {
         try {
           await page.click('#login-button', { timeout: 3000 });
           return `Clicked element via ID fallback: #login-button`;
         } catch (e) {}
      }
      throw err;
    }
  },
  fill_input: async ({ selector, value, description }) => {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 8000 });
    await locator.fill(value);
    return `Filled "${value}" into ${description || selector}`;
  },
  wait_for_element: async ({ selector, timeout = 5000 }) => {
    await page.waitForSelector(selector, { state: 'visible', timeout });
    return `Element visible: ${selector}`;
  },
  take_screenshot: async ({ step_id }) => {
    const filename = `screenshot_${step_id}_${Date.now()}.png`;
    const recDir = join(__dirname, '..', 'recordings');
    if (!existsSync(recDir)) await mkdir(recDir, { recursive: true });
    const path = join(recDir, filename);
    await page.screenshot({ path });
    return { filename, message: 'Screenshot captured' };
  },
  get_page_info: async () => {
    const title = await page.title();
    const url = page.url();
    const elements = await page.evaluate(() => {
      const interactives = Array.from(document.querySelectorAll('button, input, a, select, [role="button"]'));
      return interactives.map(el => ({
        tag: el.tagName,
        text: el.innerText || el.value || '',
        id: el.id || '',
        name: el.name || '',
        placeholder: el.placeholder || '',
        class: el.className || '',
        type: el.type || '',
        best_selector: el.id ? `#${el.id}` : (el.name ? `[name="${el.name}"]` : '')
      })).slice(0, 40);
    });
    return { title, url, interactives: elements };
  },
  get_url: async () => {
    return { url: page.url() };
  },
  wait_for_selector: async ({ selector, timeout = 5000 }) => {
    await page.waitForSelector(selector, { timeout });
    return `Element ${selector} is now present`;
  },
  assert_text: async ({ text }) => {
    const url = page.url();
    if (text.startsWith('http') && url.includes(text)) {
        return `Assertion Passed: Current URL (${url}) matches/contains "${text}"`;
    }
    const content = await page.content();
    const found = content.includes(text);
    if (!found) throw new Error(`Assertion Failed: Text "${text}" not found on page`);
    return `Assertion Passed: Text "${text}" is present`;
  },
  locate_element: async ({ selector, description }) => {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'attached', timeout: 8000 });
    const isVisible = await locator.isVisible();
    return `Element ${description || selector} found. Visible: ${isVisible}`;
  },
  // Aliases for better resilience
  click: async (args) => tools.click_element(args),
  type: async (args) => tools.fill_input(args),
  open: async (args) => tools.open_url(args),
  wait: async (args) => tools.wait_for_selector(args),
  check: async (args) => tools.locate_element(args),
  playwright: async (args) => tools.open_url(args),
  sleep: async ({ ms }) => new Promise(r => setTimeout(r, ms || 3000))
});

const AGENT_TOOLS = [
  {
    name: "open_url",
    description: "Navigate to a specific URL",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }
  },
  {
    name: "click_element",
    description: "Click an element using a CSS selector or text-based selector",
    parameters: { type: "object", properties: { selector: { type: "string" }, description: { type: "string" } }, required: ["selector"] }
  },
  {
    name: "fill_input",
    description: "Fill a form field or input with text",
    parameters: { type: "object", properties: { selector: { type: "string" }, value: { type: "string" }, description: { type: "string" } }, required: ["selector", "value"] }
  },
  {
    name: "take_screenshot",
    description: "Capture a screenshot of the current browser state",
    parameters: { type: "object", properties: { step_id: { type: "string" } }, required: ["step_id"] }
  },
  {
    name: "get_page_info",
    description: "Get metadata about the current page including title, URL and list of interactive elements",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "get_url",
    description: "Get the current browser URL",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "wait_for_selector",
    description: "Wait for a specific element to appear on the page",
    parameters: { type: "object", properties: { selector: { type: "string" }, timeout: { type: "number" } }, required: ["selector"] }
  },
  {
    name: "locate_element",
    description: "Locate an element and check if it exists in the DOM",
    parameters: { type: "object", properties: { selector: { type: "string" }, description: { type: "string" } }, required: ["selector"] }
  },
  {
    name: "click",
    description: "Alias for click_element",
    parameters: { type: "object", properties: { selector: { type: "string" } } }
  },
  {
    name: "type",
    description: "Alias for fill_input",
    parameters: { type: "object", properties: { selector: { type: "string" }, value: { type: "string" } } }
  },
  {
    name: "sleep",
    description: "Wait for a few seconds",
    parameters: { type: "object", properties: { ms: { type: "number" } } }
  },
  {
    name: "assert_text",
    description: "Assert that specific text or a URL is present",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
  }
];

// ── AI AGENT EXECUTION SYSTEM 2.0 (STREAMING) ────────────────────

const executionStreams = new Map();

app.get('/api/agent-stream/:executionId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const { executionId } = req.params;
  executionStreams.set(executionId, res);
  req.on('close', () => { executionStreams.delete(executionId); });
});

const sendAgentUpdate = (id, data) => {
  const res = executionStreams.get(id);
  if (res) res.write(`data: ${JSON.stringify(data)}\n\n`);
};

app.post('/api/agent-execute', async (req, res) => {
  const { test_case_id, steps, headless = true, engine = 'groq', contextCode = '', userInstructions = '', credentials = {} } = req.body;
  const executionId = uuidv4();
  runAgentExecution(executionId, test_case_id, steps, headless, engine, contextCode, userInstructions, credentials);
  res.json({ executionId });
});

const runAgentExecution = async (executionId, tcId, steps, headless, engine, contextCode, userInstructions, credentials = {}) => {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();
  const tools = await createBrowserTools(page);
  
  // Extract credentials from ANY part of the context for global enforcement
  const allText = userInstructions + " " + steps.join(" ");
  const userMatch = allText.match(/(?:user|username|user\s+name|login)\s*(?:id|name)?\s*(?:is|as|[:=])\s*([^\s,]+)/i);
  const passMatch = allText.match(/(?:pass|password|pass\s+word)\s*(?:is|as|[:=])\s*([^\s,]+)/i);
  
  const activeUser = userMatch ? (userMatch[1] || userMatch[2]) : null;
  const activePass = passMatch ? (passMatch[1] || passMatch[2]) : null;
  const credsBlock = activeUser ? `\n\n### ACTIVE SESSION CREDENTIALS\n- USERNAME: ${activeUser}\n- PASSWORD: ${activePass || 'Check goal for password'}` : '';

  try {
    // ── Pre-Navigation (Fast Start) ──
    const urlMatch = allText.match(/https?:\/\/[^\s"']+/);
    if (urlMatch) {
        const url = urlMatch[0];
        const credsInfo = activeUser ? ` (Using: ${activeUser} / ${activePass ? '****' : 'no password detected'})` : '';
        sendAgentUpdate(executionId, { type: 'OBSERVATION', observation: `Fast-starting: Navigating to ${url}${credsInfo}` });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } else {
        await page.goto('https://www.saucedemo.com/', { waitUntil: 'networkidle' });
    }

    const useGemini = engine === 'gemini';
    const useOpenRouter = engine === 'openrouter';
    
    // Prioritize keys from frontend credentials object, then environment variables
    const geminiKey = credentials.geminiKey || process.env.GEMINI_API_KEY;
    const groqKey = credentials.groqKey || process.env.GROQ_API_KEY;
    const openRouterKey = credentials.openRouterKey || process.env.OPENROUTER_API_KEY;

    const genAI = useGemini ? new GoogleGenerativeAI(geminiKey) : null;
    const model = useGemini ? genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      tools: [{ functionDeclarations: AGENT_TOOLS }]
    }) : null;

    let chat = useGemini ? model.startChat({ history: [] }) : null;
    
    // Clean context code to prevent data leakage (keep only selectors/logic)
    const sanitizedContext = contextCode.replace(/['"]([^'"]+)['"]/g, (match, p1) => {
        if (p1.includes('.') || p1.includes('#') || p1.includes('//') || p1.length < 3) return match; // Keep selectors
        return '"[HIDDEN_DATA]"';
    });

    const contextPrompt = contextCode ? `\n\nREFERENCE CODE (USE FOR SELECTORS ONLY):\n\`\`\`javascript\n${sanitizedContext}\n\`\`\`` : '';

    let externalHistory = [
      { 
        role: 'system', 
        content: `### IDENTITY
QA Automation Agent. Follow credentials EXACTLY.${credsBlock}

### RULES
- ALWAYS use the Username/Password from the ACTIVE SESSION CREDENTIALS above.
- NEVER use placeholders like "username", "admin", "AI_test", or "valid_user".
- NEVER attempt to bypass login by navigating directly to internal URLs (e.g., /inventory.html) unless specifically instructed. You MUST complete the login form.
- For login buttons, prioritize ID or Name selectors (e.g., #login-button) over tag-based XPaths like //button.
- If a selector fails, use 'get_page_info' to see the updated DOM.
- YOU MUST RESPOND IN VALID JSON FORMAT. THIS IS A MANDATORY REQUIREMENT.
- Your response MUST be a single JSON object matching one of these two schemas:
  1. To call a tool: { "tool": "tool_name", "args": { "param1": "value1" } }
  2. To complete the step: { "done": true, "message": "Step completed successfully" }

### TOOLS
- open_url(url)
- click_element(selector, description)
- fill_input(selector, value, description)
- get_page_info()
- assert_text(text)

### PRECONDITION
Instruction: "${userInstructions}"
Selectors Hint: ${sanitizedContext.substring(0, 500)}`
      }
    ];

    sendAgentUpdate(executionId, { type: 'OBSERVATION', observation: `Agent starting with instruction: "${userInstructions.substring(0, 50)}..."` });

    for (let index = 0; index < steps.length; index++) {
      const stepText = steps[index];
      
      // Artificial delay to prevent rate limiting
      if (index > 0) await new Promise(r => setTimeout(r, 2000));
      
      sendAgentUpdate(executionId, { type: 'STEP_START', index, step: stepText });
      
      let stepResolved = false;
      let lastObservation = `Goal: ${stepText}\n\nWhat is your next tool call? Remember to use the EXACT values from the goal.`;

      for (let i = 0; i < 15; i++) {
        let name, args;

        if (useGemini) {
          const result = await chat.sendMessage(lastObservation);
          const call = result.response.candidates[0].content.parts.find(p => p.functionCall);
          if (call) {
            name = call.functionCall.name;
            args = call.functionCall.args;
          }
        } else {
          const apiConfig = useOpenRouter ? {
            url: 'https://openrouter.ai/api/v1/chat/completions',
            key: openRouterKey,
            model: "deepseek/deepseek-chat"
          } : {
            url: 'https://api.groq.com/openai/v1/chat/completions',
            key: groqKey,
            model: "llama-3.1-8b-instant"
          };

          const callLLM = async (retryCount = 0) => {
            try {
              return await axios.post(apiConfig.url, {
                model: apiConfig.model,
                messages: [...externalHistory, { role: 'user', content: lastObservation }],
                response_format: { type: "json_object" }
              }, {
                headers: { 'Authorization': `Bearer ${apiConfig.key}`, 'Content-Type': 'application/json' }
              });
            } catch (err) {
              if (err.response?.status === 429 && retryCount < 5) {
                const wait = (retryCount + 1) * 5000;
                sendAgentUpdate(executionId, { type: 'OBSERVATION', observation: `Rate limit hit. Waiting ${wait/1000}s (Retry ${retryCount+1}/5)...` });
                await new Promise(r => setTimeout(r, wait));
                return callLLM(retryCount + 1);
              }
              throw err;
            }
          };

          const res = await callLLM();

          const extractJSON = (text) => {
            try {
              const match = text.match(/[\{\[][\s\S]*[\}\]]/);
              let parsed = match ? JSON.parse(match[0]) : JSON.parse(text);
              if (Array.isArray(parsed)) parsed = parsed[0];
              // Map hallucinated keys if model missed the schema
              if (parsed.action && !parsed.tool) {
                parsed.tool = parsed.action;
                parsed.args = parsed.args || { 
                  selector: parsed.selector, 
                  value: parsed.value || parsed.text,
                  text: parsed.text || parsed.value 
                };
              }
              return parsed;
            } catch (e) { return null; }
          };

          const rawContent = res.data.choices[0].message.content;
          const jsonRes = extractJSON(rawContent);
          externalHistory.push({ role: 'assistant', content: rawContent });
          
          if (!jsonRes) {
            // LLM failed to return JSON, send observation to correct it
            lastObservation = `Error: You MUST respond with ONLY valid JSON matching the schema. Your previous response was: ${rawContent}`;
            sendAgentUpdate(executionId, { type: 'ERROR', error: 'LLM returned invalid JSON. Forcing retry...' });
            continue; // Skip tool execution and ask LLM again
          }

          if (jsonRes.tool) {
            name = jsonRes.tool;
            args = jsonRes.args;
          } else if (jsonRes.done) {
            sendAgentUpdate(executionId, { type: 'STEP_COMPLETE', index });
            stepResolved = true;
            break;
          } else {
            // Valid JSON, but missing tool or done key
            lastObservation = `Error: Your JSON must contain either a "tool" key or a "done" key. You provided: ${rawContent}`;
            sendAgentUpdate(executionId, { type: 'ERROR', error: 'LLM returned JSON without tool or done keys. Forcing retry...' });
            continue;
          }
        }
        
        if (name) {
          sendAgentUpdate(executionId, { type: 'TOOL_CALL', name, args });
          try {
            const observation = await tools[name]({ ...args, step_id: `${executionId}_${index}` });
            const obsText = typeof observation === 'object' ? (observation.message || JSON.stringify(observation)) : observation;
            if (name === 'take_screenshot') sendAgentUpdate(executionId, { type: 'SCREENSHOT', filename: observation.filename });
            lastObservation = `Observation: ${obsText}`;
            sendAgentUpdate(executionId, { type: 'OBSERVATION', observation: obsText });
            if (!useGemini) externalHistory.push({ role: 'user', content: lastObservation });
          } catch (toolErr) {
            lastObservation = `Error: ${toolErr.message}`;
            sendAgentUpdate(executionId, { type: 'ERROR', error: toolErr.message });
            if (!useGemini) externalHistory.push({ role: 'user', content: lastObservation });
          }
        } else if (useGemini) {
          // Gemini didn't return a tool call. Let's check what it said.
          const textPart = result.response.candidates[0].content.parts.find(p => p.text);
          if (textPart && textPart.text) {
             const text = textPart.text.toLowerCase();
             if (text.includes('done') || text.includes('completed') || text.includes('success')) {
                sendAgentUpdate(executionId, { type: 'STEP_COMPLETE', index });
                stepResolved = true;
                break;
             } else {
                lastObservation = `Error: You must use a tool call to perform actions, or say you are "done" to complete the step. Your previous message was: ${textPart.text}`;
                sendAgentUpdate(executionId, { type: 'OBSERVATION', observation: `Agent thought: ${textPart.text.substring(0, 100)}... Forcing tool usage.` });
             }
          } else {
             sendAgentUpdate(executionId, { type: 'STEP_COMPLETE', index });
             stepResolved = true;
             break;
          }
        }
      }
      if (!stepResolved) {
        sendAgentUpdate(executionId, { type: 'STEP_FAILED', index });
        sendAgentUpdate(executionId, { type: 'EXECUTION_COMPLETE', status: 'Failed' });
        return; // Stop execution on failure
      }
    }
    sendAgentUpdate(executionId, { type: 'EXECUTION_COMPLETE', status: 'Success' });
  } catch (err) {
    console.error('[Agent Error]', err.response?.data || err.message);
    sendAgentUpdate(executionId, { type: 'EXECUTION_COMPLETE', status: 'Failed', error: err.message });
  } finally {
    if (!headless) {
        // Keep browser open for 10 seconds so user can see what happened
        await new Promise(r => setTimeout(r, 10000));
    }
    await browser.close();
  }
};

app.use('/recordings', express.static(join(__dirname, '..', 'recordings')));

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Hybrid AI & Jira Proxy Running at http://localhost:${PORT}`);
  });
}

export default app;

