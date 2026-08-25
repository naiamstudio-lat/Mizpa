/**
 * run-agent v5 - Hermes Agent Server
 * 
 * Creates VM from snapshot (Hermes + Agent Server pre-installed on port 3000).
 * Creates preview domain mapping ({site-id}.style.dev → port 3000).
 * Returns preview domain URL for frontend direct connection.
 * 
 * Frontend calls: POST https://{site-id}.style.dev/chat
 * Agent Server uses Hermes with SOUL.md (personality) + AGENTS.md (context) + tools.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FREESTYLE_API = 'https://api.freestyle.sh'
const SNAPSHOT_ID = 'sh-zh3kcy2mejs69uviljed' // Hermes + Agent Server pre-installed
const AGENT_SERVER_PORT = 3000

function freestyleHeaders() {
  return {
    'Authorization': `Bearer ${Deno.env.get('FREESTYLE_API_KEY')}`,
    'Content-Type': 'application/json',
  }
}

// VM Management
async function getVmStatus(vmId: string): Promise<string> {
  try {
    const res = await fetch(`${FREESTYLE_API}/v1/vms/${vmId}`, { headers: freestyleHeaders() })
    if (!res.ok) return 'not_found'
    const data = await res.json()
    return data.state || 'unknown'
  } catch { return 'error' }
}

async function createVm(name: string): Promise<string> {
  const res = await fetch(`${FREESTYLE_API}/v1/vms`, {
    method: 'POST', headers: freestyleHeaders(),
    body: JSON.stringify({ name, idleTimeoutSeconds: 300, snapshotId: SNAPSHOT_ID })
  })
  if (!res.ok) throw new Error(`VM create failed: ${res.status}`)
  const data = await res.json()
  return data.id
}

async function resumeVm(vmId: string): Promise<void> {
  await fetch(`${FREESTYLE_API}/v1/vms/${vmId}/start`, {
    method: 'POST', headers: freestyleHeaders(),
    body: '{}'
  })
}

async function deleteVm(vmId: string): Promise<void> {
  await fetch(`${FREESTYLE_API}/v1/vms/${vmId}`, {
    method: 'DELETE', headers: freestyleHeaders()
  })
}

async function execVm(vmId: string, command: string, timeout = 60000): Promise<string> {
  const res = await fetch(`${FREESTYLE_API}/v1/vms/${vmId}/exec-await`, {
    method: 'POST', headers: freestyleHeaders(),
    body: JSON.stringify({ command, timeout })
  })
  const data = await res.json()
  if (!res.ok && data.stderr) throw new Error(data.stderr)
  return data.stdout || ''
}

// Create preview domain mapping: {domain}.style.dev → VM port
async function createDomainMapping(domain: string, vmId: string, vmPort: number): Promise<void> {
  const res = await fetch(`${FREESTYLE_API}/domains/v1/mappings/${domain}`, {
    method: 'PUT', headers: freestyleHeaders(),
    body: JSON.stringify({ vmId, vmPort })
  })
  if (!res.ok) {
    const text = await res.text()
    console.log(`[run-agent] Domain mapping failed (${res.status}): ${text}`)
    // Non-fatal — VM still works, just not via preview domain
  }
}

// Agent Server code (embedded in edge function)
const AGENT_SERVER_CODE = `/**
 * Mizpa Agent Server v4
 * Middleware layer: adds personality + tools on top of OmniRoute
 *
 * Architecture:
 *   Frontend → Agent Server (port 3000) → OmniRoute (port 20128) → LLM Provider
 *
 * Endpoints:
 * POST /chat - Send message, get response with personality
 * GET /status - Agent status
 */

import http from 'http';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PORT = 3000;
const WORKSPACE = '/workspace';
const OMNIROUTE_URL = 'http://localhost:20128';
const OMNIROUTE_MODEL = 'auto/best-chat';
const MAX_HISTORY = 20;

// Agent state
let conversationHistory = [];
let isProcessing = false;
let lastActivity = Date.now();

// Execute shell command with proper PATH
function run(cmd, timeoutMs = 60000) {
  try {
    const out = execSync(cmd, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      cwd: WORKSPACE,
      shell: '/bin/bash',
      env: { ...process.env, PATH: '/root/.local/bin:/usr/local/bin:/usr/bin:/bin' }
    });
    return { ok: true, output: out.trim() };
  } catch (e) {
    return { ok: false, output: (e.stderr || e.message || '').trim() };
  }
}

// Read file safely
function readFileSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return ''; }
}

// Call OmniRoute API with personality context
async function callOmniRoute(userMessage) {
  // Build conversation history
  const historyMessages = conversationHistory
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content }));

  // Read agent context files for system prompt
  const agentsMd = readFileSafe(path.join(WORKSPACE, 'AGENTS.md'));
  const soulMd = readFileSafe(path.join(WORKSPACE, 'SOUL.md'));

  const systemPrompt = \`\${soulMd || 'You are a senior frontend engineering agent specialized in React, Vite, and Tailwind CSS. Respond concisely.'}

\${agentsMd ? 'PROJECT CONTEXT:\\n' + agentsMd : ''}\`;

  // Build OpenAI-compatible messages array
  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userMessage }
  ];

  // Call OmniRoute
  const response = await fetch(\`\${OMNIROUTE_URL}/v1/chat/completions\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OMNIROUTE_MODEL,
      messages,
      stream: false
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(\`OmniRoute error \${response.status}: \${errText.slice(0, 200)}\`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || '✅ Tarea completada.';
}

// Execute tool calls from agent response
function executeTools(response) {
  const results = [];

  // WRITE pattern: WRITE:path\\n---\\ncontent\\n---
  const writeRegex = /WRITE:([^\\n]+)\\n---\\n([\\s\\S]*?)\\n---/g;
  let match;
  while ((match = writeRegex.exec(response)) !== null) {
    const [, filePath, content] = match;
    const fullPath = path.join(WORKSPACE, filePath.trim());
    try {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content);
      results.push(\`✅ Archivo creado: \${filePath.trim()}\`);
    } catch (e) {
      results.push(\`❌ Error creando \${filePath.trim()}: \${e.message}\`);
    }
  }

  // EXEC pattern: EXEC:command
  const execRegex = /EXEC:([^\\n]+)/g;
  while ((match = execRegex.exec(response)) !== null) {
    const cmd = match[1].trim();
    const result = run(cmd);
    results.push(result.ok ? \`✅ \${cmd}\` : \`❌ \${cmd}: \${result.output}\`);
  }

  return results;
}

// Handle POST /chat
async function handleChat(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { message } = JSON.parse(body);
      if (!message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Message required' }));
        return;
      }

      conversationHistory.push({ role: 'user', content: message });
      lastActivity = Date.now();
      isProcessing = true;

      const response = await callOmniRoute(message);
      const toolResults = executeTools(response);
      const cleanResponse = response.replace(/FINISHED|TERMINADO/g, '').trim();

      conversationHistory.push({ role: 'assistant', content: cleanResponse });
      if (conversationHistory.length > MAX_HISTORY * 2) {
        conversationHistory = conversationHistory.slice(-MAX_HISTORY);
      }

      isProcessing = false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        response: cleanResponse,
        tools: toolResults,
        timestamp: Date.now()
      }));
    } catch (e) {
      isProcessing = false;
      console.error('[agent-server error]', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

// Handle GET /status
function handleStatus(req, res) {
  // Check OmniRoute availability
  let omniRouteStatus = 'unknown';
  try {
    const result = run('curl -sf http://localhost:20128/v1/models | head -c 50', 5000);
    omniRouteStatus = result.ok && result.output.includes('object') ? 'available' : 'not ready';
  } catch { omniRouteStatus = 'error'; }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: isProcessing ? 'processing' : 'idle',
    omniRoute: omniRouteStatus,
    model: OMNIROUTE_MODEL,
    lastActivity,
    historyLength: conversationHistory.length,
    uptime: process.uptime()
  }));
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.url === '/chat' && req.method === 'POST') handleChat(req, res);
  else if (req.url === '/status' && req.method === 'GET') handleStatus(req, res);
  else { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(\`🤖 Mizpa Agent Server v4 running on port \${PORT}\`);
  console.log(\`📁 Workspace: \${WORKSPACE}\`);
  console.log(\`🧠 OmniRoute: \${OMNIROUTE_URL}\`);
  console.log(\`🤖 Model: \${OMNIROUTE_MODEL}\`);
});

process.on('SIGTERM', () => { console.log('Shutting down...'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { console.log('Interrupted'); server.close(() => process.exit(0)); });
`;

// Agent SOUL.md template (embedded)
const SOUL_MD = `# Hermes - Mizpa Frontend Agent

You are Hermes, a senior frontend engineering agent specialized in React, Vite, and Tailwind CSS.

## Core Identity
- **Role**: Senior Frontend Engineer
- **Expertise**: React 19, Vite, Tailwind CSS, TypeScript
- **Style**: Direct, efficient, code-focused
- **Language**: Spanish or English based on user preference

## Communication Rules
- Respond CONCISELY - no verbose explanations
- Use conversational Spanish when user writes in Spanish
- Use conversational English when user writes in English
- NEVER show raw code in responses unless explicitly asked
- Say what you DID, not what you're going to do

## Code Style
- Use Tailwind CSS utility classes
- Mobile-first responsive design
- TypeScript strict mode
- Component naming: PascalCase
- File organization: atoms/molecules/organisms

## Operational Pipeline
1. Understand user intent
2. Read existing code context
3. Make atomic, precise modifications
4. Verify with \`npm run build\`
5. Respond conversationally
`;

// Agent AGENTS.md template (embedded)
const AGENTS_MD = `# Mizpa Project Context

## Tech Stack
- **Framework**: Vite + React 19 (TypeScript)
- **Styling**: Tailwind CSS (utility classes only)
- **Deployment**: Cloudflare Pages
- **Package Manager**: npm

## File Organization
\`\`\`
src/
├── components/          # Reusable UI components
│   ├── atoms/          # Basic elements (Button, Input)
│   ├── molecules/      # Combinations (FormField, Card)
│   └── organisms/      # Sections (Header, Hero, Footer)
├── pages/              # Route components
├── hooks/              # Custom React hooks
├── utils/              # Helper functions
└── types/              # TypeScript types
\`\`\`

## Conventions
- Components: PascalCase (Button.tsx)
- Hooks: camelCase with \`use\` prefix (useAuth.ts)
- One component per file
- Props interface above component

## Design System
- Primary colors: black (#000000), pink (#ffb1c4)
- Surfaces: #131313, #1f1f1f, #2a2a2a
- Font: JetBrains Mono (mono), Inter (sans)
- Mobile-first responsive (md:, lg: breakpoints)

## Build & Deploy
- \`npm run dev\` - Development server
- \`npm run build\` - Production build
- \`npm run preview\` - Preview build

## Important
- Never modify package-lock.json directly
- Always use Tailwind classes, not inline styles
- Components must be responsive
- Test on mobile viewports
`;

// Ensure OmniRoute is running on port 20128
async function ensureOmniRoute(vmId: string): Promise<void> {
  // Check if OmniRoute is already running
  try {
    const out = await execVm(vmId, `curl -sf http://localhost:20128/v1/models | head -c 50`, 5000)
    if (out.includes('object')) return // Already running
  } catch { /* not running */ }

  // Try to start OmniRoute via npm (pre-installed in snapshot)
  try {
    await execVm(vmId, `
      export PATH="/root/.nvm/versions/node/v24.16.0/bin:$PATH"
      # Check if omniroute is installed
      if command -v omniroute &>/dev/null; then
        nohup omniroute > /tmp/omniroute.log 2>&1 &
        echo "omniroute started via npm"
      else
        echo "omniroute not installed"
        exit 1
      fi
    `, 10000)
  } catch {
    console.log('[run-agent] OmniRoute not available, agent server will use fallback')
  }
}

// Wait for OmniRoute to be ready
async function waitForOmniRoute(vmId: string, timeoutMs = 20000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const out = await execVm(vmId, `curl -sf http://localhost:20128/v1/models | head -c 50`, 5000)
      if (out.includes('object')) return true
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 2000))
  }
  return false
}

// Ensure Agent Server is running on port 3000
async function ensureAgentServer(vmId: string): Promise<void> {
  // Always stop existing agent server to ensure new code is used
  try {
    await execVm(vmId, `pkill -f "node server.js" || true`, 5000)
    await new Promise(r => setTimeout(r, 1000))
  } catch { /* ignore */ }

  // Create agent server files
  await execVm(vmId, `
    export PATH="/root/.local/bin:/root/.nvm/versions/node/v24.16.0/bin:$PATH"
    mkdir -p /workspace
    
    # Create server.js
    cat > /workspace/server.js << 'ENDOFSERVER'
${AGENT_SERVER_CODE}
ENDOFSERVER
    
    # Create SOUL.md
    cat > /workspace/SOUL.md << 'ENDOFSOUL'
${SOUL_MD}
ENDOFSOUL
    
    # Create AGENTS.md
    cat > /workspace/AGENTS.md << 'ENDOFAGENTS'
${AGENTS_MD}
ENDOFAGENTS
    
    # Create package.json if not exists
    if [ ! -f /workspace/package.json ]; then
      cat > /workspace/package.json << 'ENDOFPKG'
{
  "name": "mizpa-agent-vm",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  }
}
ENDOFPKG
    fi
    
    echo "agent files created"
  `)

  // Start Agent Server
  await execVm(vmId, `
    export PATH="/root/.local/bin:/root/.nvm/versions/node/v24.16.0/bin:$PATH"
    cd /workspace
    nohup node server.js > /tmp/agent-server.log 2>&1 &
    echo "agent-server started"
  `)
}

// Wait for Agent Server to be ready
async function waitForAgentServer(vmId: string, timeoutMs = 20000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const out = await execVm(vmId, `curl -sf http://localhost:${AGENT_SERVER_PORT}/status | head -c 100`, 5000)
      if (out.includes('idle') || out.includes('processing')) return true
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 2000))
  }
  return false
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )

  try {
    const { prompt, site_id, action } = await req.json()

    // Handle site deletion
    if (action === 'delete_site' && site_id) {
      const { data: site } = await admin
        .from('sites').select('freestyle_vm_id').eq('id', site_id).single()
      if (site?.freestyle_vm_id) {
        await deleteVm(site.freestyle_vm_id)
        await admin.from('sites').update({ freestyle_vm_id: null, status: 'deleted' }).eq('id', site_id)
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!site_id) {
      return new Response(JSON.stringify({ error: 'site_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get site
    const { data: site, error: siteError } = await admin
      .from('sites').select('*').eq('id', site_id).single()
    if (siteError || !site) {
      return new Response(JSON.stringify({ error: 'Site not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let vmId = site.freestyle_vm_id

    if (!vmId) {
      // Create new VM from snapshot
      console.log('[run-agent] Creating VM from snapshot...')
      vmId = await createVm(`mizpa-${site_id.slice(0, 8)}`)
      console.log(`[run-agent] VM created: ${vmId}`)

      // Wait for VM boot
      await new Promise(r => setTimeout(r, 3000))

      // Update site with VM ID
      await admin.from('sites').update({ freestyle_vm_id: vmId, status: 'active' }).eq('id', site_id)
    } else {
      // Resume existing VM if needed
      const status = await getVmStatus(vmId)
      console.log(`[run-agent] VM status: ${status}`)
      
      if (status === 'suspended' || status === 'stopped') {
        await resumeVm(vmId)
        await new Promise(r => setTimeout(r, 5000))
      }
    }

    // Ensure OmniRoute is running (LLM backend)
    console.log('[run-agent] Ensuring OmniRoute is running...')
    await ensureOmniRoute(vmId)
    const omniReady = await waitForOmniRoute(vmId)
    console.log(`[run-agent] OmniRoute ready: ${omniReady}`)

    // Ensure Agent Server is running (personality + tools layer)
    console.log('[run-agent] Ensuring Agent Server is running...')
    await ensureAgentServer(vmId)

    // Wait for Agent Server
    const ready = await waitForAgentServer(vmId)
    console.log(`[run-agent] Agent Server ready: ${ready}`)

    // Create preview domain mapping: mizpa-{site_id_short}.style.dev → port 3000
    const previewDomain = `mizpa-${site_id.slice(0, 8)}.style.dev`
    console.log(`[run-agent] Creating domain mapping: ${previewDomain} → ${vmId}:${AGENT_SERVER_PORT}`)
    await createDomainMapping(previewDomain, vmId, AGENT_SERVER_PORT)

    // Return preview domain URL
    const apiServerUrl = `https://${previewDomain}`

    return new Response(JSON.stringify({
      vmUrl: apiServerUrl,
      vmId,
      apiKey: '',  // Agent Server doesn't need auth
      model: 'auto/best-chat',
      status: ready ? 'ready' : 'starting',
      previewDomain,
      // Frontend calls: POST https://{previewDomain}/chat
      // No auth header needed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[run-agent] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
