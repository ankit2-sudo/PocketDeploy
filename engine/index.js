const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const url = require('url');

// Import modules
const binaryManager = require('./modules/binaryManager');
const db = require('./db/database');
const gitManager = require('./modules/gitManager');
const scanner = require('./modules/scanner');
const processManager = require('./modules/processManager');
const tunnelManager = require('./modules/tunnelManager');
const buildRunner = require('./modules/buildRunner');
const webhookServer = require('./modules/webhookServer');

const API_PORT = 4000;
const WS_PORT = 4001;
const WEBHOOK_PORT = 9000;
const MAX_APPS = 10;
const PORT_RANGE_START = 3001;
const PORT_RANGE_END = 3010;

// ── [C3] Auth Token ──────────────────────────────────────
const ENGINE_SECRET = crypto.randomBytes(32).toString('hex');
console.log(`[Engine] Auth token: ${ENGINE_SECRET}`);

// ── [M11] Simple Rate Limiter ────────────────────────────
const rateLimitMap = new Map();
function rateLimit(windowMs, maxRequests) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    if (!entry || now - entry.start > windowMs) {
      rateLimitMap.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count++;
    if (entry.count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    next();
  };
}

// ── Express App ──────────────────────────────────────────
const app = express();
app.use(express.json());

// [M11] Global rate limit: 30 requests per minute
app.use(rateLimit(60000, 30));

// ── [C3] Auth Middleware ─────────────────────────────────
function authMiddleware(req, res, next) {
  if (req.path === '/health') return next();
  const token = req.headers['x-engine-token'];
  if (!token || token.length !== ENGINE_SECRET.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ENGINE_SECRET))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
app.use(authMiddleware);

// ── [L6] Error Handler ──────────────────────────────────
function errorHandler(err, req, res, _next) {
  console.error(`[API Error] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: 'Internal server error' });
}

// ── [M6] WebSocket Server with Auth ─────────────────────
const wsServer = new WebSocket.Server({ port: WS_PORT, verifyClient: (info) => {
  const parsed = url.parse(info.req.url, true);
  const token = parsed.query.token;
  if (!token || token.length !== ENGINE_SECRET.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ENGINE_SECRET));
  } catch {
    return false;
  }
}});
const wsClients = new Set();

wsServer.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

// [M2] Removed dead emit() function — only wsEmit is used

function wsEmit(event, appId, dataOrStatus, extra) {
  let payload;
  if (event === 'log') {
    payload = { event, appId, line: dataOrStatus };
  } else if (event === 'status_change') {
    payload = { event, appId, status: dataOrStatus };
  } else if (event === 'deploy_complete') {
    payload = { event, appId, success: dataOrStatus, error: extra || null };
  } else if (event === 'tunnel_ready') {
    payload = { event, appId, url: dataOrStatus };
  } else {
    payload = { event, appId, data: dataOrStatus };
  }

  const message = JSON.stringify(payload);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(message); } catch {}
    }
  }
}

// ── Input Validators ─────────────────────────────────────

// [C4/H6] Validate repo URL — HTTPS only
function validateRepoUrl(repoUrl) {
  try {
    const parsed = new URL(repoUrl);
    if (parsed.protocol !== 'https:') {
      return 'Only HTTPS repository URLs are allowed';
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
        host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('172.')) {
      return 'Private/local repository URLs are not allowed';
    }
    return null;
  } catch {
    return 'Invalid repository URL';
  }
}

// [H9] Validate app name
function validateAppName(name) {
  if (!name || typeof name !== 'string') return 'App name is required';
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) return 'App name must be 1-100 characters';
  if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) return 'App name can only contain letters, numbers, spaces, hyphens, and underscores';
  return null;
}

// [H10] Validate env var keys
const BLOCKED_ENV_KEYS = new Set([
  'PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'NODE_OPTIONS',
  'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'PYTHONPATH',
  'RUBYLIB', 'PERL5LIB', 'CLASSPATH'
]);

function validateEnvVarKey(key) {
  if (!key || typeof key !== 'string') return 'Env var key is required';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `Invalid env var key format: ${key}`;
  if (BLOCKED_ENV_KEYS.has(key.toUpperCase())) return `Blocked env var key: ${key}`;
  return null;
}

// ── Port Registry ────────────────────────────────────────
function getNextAvailablePort() {
  const usedPorts = db.getAllApps().map((a) => a.port).filter(Boolean);
  for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) {
    if (!usedPorts.includes(p)) return p;
  }
  return null;
}

// [L4] Strip sensitive fields from app responses
function sanitizeAppResponse(appRecord) {
  if (!appRecord) return appRecord;
  const { webhook_secret, ...safe } = appRecord;
  return safe;
}

// ── REST API Routes ──────────────────────────────────────

app.get('/health', async (req, res) => {
  const apps = db.getAllApps();
  const running = apps.filter((a) => a.status === 'running').length;
  res.json({ status: 'ok', appsRunning: running, totalApps: apps.length, maxApps: MAX_APPS });
});

// [M11] Stricter rate limit for expensive operations
app.post('/apps', rateLimit(60000, 5), async (req, res) => {
  try {
    const { repoUrl, name, branch = 'main' } = req.body;

    if (!repoUrl || !name) {
      return res.status(400).json({ error: 'repoUrl and name are required' });
    }

    // [H9] Validate app name
    const nameErr = validateAppName(name);
    if (nameErr) return res.status(400).json({ error: nameErr });

    // [C4/H6] Validate repo URL
    const urlErr = validateRepoUrl(repoUrl);
    if (urlErr) return res.status(400).json({ error: urlErr });

    if (db.getAppCount() >= MAX_APPS) {
      return res.status(400).json({ error: `Maximum ${MAX_APPS} apps allowed` });
    }

    const port = getNextAvailablePort();
    if (!port) {
      return res.status(400).json({ error: 'No available ports. Delete an app first.' });
    }

    // [L1] Use full UUID for better uniqueness
    const appId = `app_${uuidv4()}`;
    const webhookSecret = uuidv4();

    const appRecord = {
      id: appId,
      name: name.trim(),
      repo_url: repoUrl,
      branch,
      project_type: null,
      install_cmd: null,
      build_cmd: null,
      start_cmd: null,
      port,
      tunnel_url: null,
      webhook_secret: webhookSecret,
      status: 'idle',
      created_at: new Date().toISOString(),
      last_deploy: null,
    };

    db.createApp(appRecord);
    // [L4] Strip webhook_secret from response
    res.status(201).json(sanitizeAppResponse(appRecord));

    buildRunner.runDeploy(appId, repoUrl, branch, null, port, {}, true, wsEmit).catch((err) => {
      console.error(`[Deploy] Failed for ${appId}:`, err.message);
    });
  } catch (err) {
    console.error(`[API] POST /apps error:`, err.message);
    res.status(500).json({ error: 'Failed to create app' });
  }
});

app.get('/apps', (req, res) => {
  try {
    const apps = db.getAllApps().map(sanitizeAppResponse);
    res.json(apps);
  } catch (err) {
    console.error(`[API] GET /apps error:`, err.message);
    res.status(500).json({ error: 'Failed to list apps' });
  }
});

// [H4] Stop all apps — registered BEFORE parameterized /:id routes
app.post('/apps/stop-all', async (req, res) => {
  try {
    const apps = db.getAllApps().filter(a => a.status === 'running');
    for (const appRecord of apps) {
      await processManager.stopApp(appRecord.id).catch(() => {});
      tunnelManager.destroyTunnel(appRecord.id);
      db.updateApp(appRecord.id, { status: 'stopped', tunnel_url: null });
      wsEmit('status_change', appRecord.id, 'stopped');
    }
    res.json({ message: `Stopped ${apps.length} app(s)` });
  } catch (err) {
    console.error(`[API] POST /apps/stop-all error:`, err.message);
    res.status(500).json({ error: 'Failed to stop apps' });
  }
});

app.get('/apps/:id', (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });
    res.json(sanitizeAppResponse(appRecord));
  } catch (err) {
    console.error(`[API] GET /apps/:id error:`, err.message);
    res.status(500).json({ error: 'Failed to get app' });
  }
});

app.delete('/apps/:id', async (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    await processManager.stopApp(req.params.id).catch(() => {});
    await processManager.deleteApp(req.params.id).catch(() => {});
    tunnelManager.destroyTunnel(req.params.id);
    await gitManager.deleteRepo(req.params.id);
    db.deleteApp(req.params.id);

    wsEmit('status_change', req.params.id, 'deleted');
    res.json({ message: 'App deleted' });
  } catch (err) {
    console.error(`[API] DELETE /apps/:id error:`, err.message);
    res.status(500).json({ error: 'Failed to delete app' });
  }
});

app.post('/apps/:id/deploy', async (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    res.json({ message: 'Deploy triggered' });

    const envVarsRaw = db.getEnvVars(req.params.id);
    const envVars = {};
    for (const v of envVarsRaw) { envVars[v.key] = v.value; }

    const config = {
      installCommand: appRecord.install_cmd,
      buildCommand: appRecord.build_cmd,
      startCommand: appRecord.start_cmd,
    };

    buildRunner.runDeploy(
      req.params.id, appRecord.repo_url, appRecord.branch,
      config, appRecord.port, envVars, false, wsEmit
    ).catch((err) => {
      console.error(`[Redeploy] Failed for ${req.params.id}:`, err.message);
    });
  } catch (err) {
    console.error(`[API] POST /apps/:id/deploy error:`, err.message);
    res.status(500).json({ error: 'Failed to trigger deploy' });
  }
});

app.post('/apps/:id/stop', async (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    await processManager.stopApp(req.params.id);
    tunnelManager.destroyTunnel(req.params.id);
    db.updateApp(req.params.id, { status: 'stopped', tunnel_url: null });
    wsEmit('status_change', req.params.id, 'stopped');
    res.json({ message: 'App stopped' });
  } catch (err) {
    console.error(`[API] POST /apps/:id/stop error:`, err.message);
    res.status(500).json({ error: 'Failed to stop app' });
  }
});

app.post('/apps/:id/start', async (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    const envVarsRaw = db.getEnvVars(req.params.id);
    const envVars = {};
    for (const v of envVarsRaw) { envVars[v.key] = v.value; }

    const startCmd = (appRecord.start_cmd || 'node index.js').replace('$PORT', appRecord.port.toString());
    const appPath = gitManager.getAppPath(req.params.id);

    await processManager.startApp(req.params.id, startCmd, appRecord.port, appPath, envVars);
    db.updateApp(req.params.id, { status: 'running' });
    wsEmit('status_change', req.params.id, 'running');

    tunnelManager.createTunnel(req.params.id, appRecord.port, (tunnelUrl) => {
      db.updateApp(req.params.id, { tunnel_url: tunnelUrl });
      wsEmit('tunnel_ready', req.params.id, tunnelUrl);
    }).catch((err) => {
      console.error(`[Tunnel] Failed for ${req.params.id}:`, err.message);
    });

    res.json({ message: 'App started' });
  } catch (err) {
    console.error(`[API] POST /apps/:id/start error:`, err.message);
    res.status(500).json({ error: 'Failed to start app' });
  }
});

app.post('/apps/:id/restart', async (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    await processManager.restartApp(req.params.id);
    db.updateApp(req.params.id, { status: 'running' });
    wsEmit('status_change', req.params.id, 'running');
    res.json({ message: 'App restarted' });
  } catch (err) {
    console.error(`[API] POST /apps/:id/restart error:`, err.message);
    res.status(500).json({ error: 'Failed to restart app' });
  }
});

app.get('/apps/:id/logs', async (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    const logs = await processManager.getLogs(req.params.id, 200);
    res.json(logs);
  } catch (err) {
    console.error(`[API] GET /apps/:id/logs error:`, err.message);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

app.get('/apps/:id/deploys', (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    const deploys = db.getDeploysByApp(req.params.id);
    res.json(deploys);
  } catch (err) {
    console.error(`[API] GET /apps/:id/deploys error:`, err.message);
    res.status(500).json({ error: 'Failed to get deploys' });
  }
});

// [H10] Validate env var keys
app.post('/apps/:id/env', (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    const { vars } = req.body;
    if (!Array.isArray(vars)) return res.status(400).json({ error: 'vars must be an array' });

    for (const v of vars) {
      const keyErr = validateEnvVarKey(v.key);
      if (keyErr) return res.status(400).json({ error: keyErr });
      if (typeof v.value !== 'string') {
        return res.status(400).json({ error: `Env var value for '${v.key}' must be a string` });
      }
    }

    const envVars = vars.map((v) => ({
      id: v.id || uuidv4(),
      app_id: req.params.id,
      key: v.key,
      value: v.value,
    }));

    db.setEnvVars(req.params.id, envVars);
    res.json({ message: 'Environment variables updated', count: envVars.length });
  } catch (err) {
    console.error(`[API] POST /apps/:id/env error:`, err.message);
    res.status(500).json({ error: 'Failed to update environment variables' });
  }
});

app.get('/apps/:id/tunnel', (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    const tunnelUrl = tunnelManager.getTunnelUrl(req.params.id) || appRecord.tunnel_url;
    res.json({ url: tunnelUrl });
  } catch (err) {
    console.error(`[API] GET /apps/:id/tunnel error:`, err.message);
    res.status(500).json({ error: 'Failed to get tunnel URL' });
  }
});

// [M5] Scan with finally cleanup + [M11] strict rate limit
app.post('/scan', rateLimit(60000, 5), async (req, res) => {
  const tempId = `scan_${Date.now()}`;
  try {
    const { repoUrl, branch = 'main' } = req.body;
    if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });

    const urlErr = validateRepoUrl(repoUrl);
    if (urlErr) return res.status(400).json({ error: urlErr });

    await gitManager.cloneRepo(repoUrl, tempId, branch);
    const appPath = gitManager.getAppPath(tempId);
    const result = scanner.detectProject(appPath);
    res.json(result);
  } catch (err) {
    console.error(`[API] POST /scan error:`, err.message);
    res.status(500).json({ error: 'Failed to scan repository' });
  } finally {
    await gitManager.deleteRepo(tempId).catch(() => {});
  }
});

// ── [C5] GitHub token — encrypted storage ────────────────
let encryptedGithubToken = null;
const TOKEN_KEY = crypto.randomBytes(32);
const TOKEN_IV_LEN = 16;

function encryptToken(plaintext) {
  const iv = crypto.randomBytes(TOKEN_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-cbc', TOKEN_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptToken(stored) {
  const [ivHex, encrypted] = stored.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', TOKEN_KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

app.post('/settings/github-token', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });
    encryptedGithubToken = encryptToken(token);
    res.json({ message: 'Token saved securely' });
  } catch (err) {
    console.error(`[API] POST /settings/github-token error:`, err.message);
    res.status(500).json({ error: 'Failed to save token' });
  }
});

app.get('/settings/github-token', (req, res) => {
  res.json({ configured: encryptedGithubToken !== null });
});

// ── [H7] Engine restart — rate limited ───────────────────
let lastRestartTime = 0;
app.post('/engine/restart', (req, res) => {
  const now = Date.now();
  if (now - lastRestartTime < 60000) {
    return res.status(429).json({ error: 'Engine restart rate limited. Try again in 60s.' });
  }
  lastRestartTime = now;
  res.json({ message: 'Engine restarting...' });
  setTimeout(() => { process.exit(0); }, 500);
});

// [L6] Global error handler
app.use(errorHandler);

// ── Webhook Server ───────────────────────────────────────
const webhookApp = express();
webhookServer.init(db, buildRunner, wsEmit);
webhookApp.use('/webhook', webhookServer.router);

// ── Startup ──────────────────────────────────────────────
async function startup() {
  console.log('[Engine] Starting PocketDeploy engine...');

  binaryManager.ensureDirectories();
  db.initialize();
  console.log('[Engine] Database initialized');

  if (!binaryManager.isPM2Installed()) {
    console.log('[Engine] Installing PM2...');
    await binaryManager.installPM2((line) => console.log('[PM2]', line));
    console.log('[Engine] PM2 installed');
  }

  const apps = db.getAllApps();
  const runningApps = apps.filter((a) => a.status === 'running');

  if (runningApps.length > 0) {
    console.log(`[Engine] Restoring ${runningApps.length} previously running app(s)...`);
    for (const appRecord of runningApps) {
      try {
        const startCmd = (appRecord.start_cmd || 'node index.js').replace('$PORT', appRecord.port.toString());
        const appPath = gitManager.getAppPath(appRecord.id);

        const envVarsRaw = db.getEnvVars(appRecord.id);
        const envVars = {};
        for (const v of envVarsRaw) { envVars[v.key] = v.value; }

        await processManager.startApp(appRecord.id, startCmd, appRecord.port, appPath, envVars);

        tunnelManager.createTunnel(appRecord.id, appRecord.port, (tunnelUrl) => {
          db.updateApp(appRecord.id, { tunnel_url: tunnelUrl });
          wsEmit('tunnel_ready', appRecord.id, tunnelUrl);
        }).catch((err) => {
          console.error(`[Engine] Tunnel restore failed for ${appRecord.id}:`, err.message);
        });

        console.log(`[Engine] Restored: ${appRecord.name} on port ${appRecord.port}`);
      } catch (err) {
        console.error(`[Engine] Failed to restore ${appRecord.name}:`, err.message);
        db.updateApp(appRecord.id, { status: 'error' });
      }
    }
  }

  app.listen(API_PORT, '127.0.0.1', () => {
    console.log(`[Engine] REST API listening on http://localhost:${API_PORT}`);
  });

  webhookApp.listen(WEBHOOK_PORT, '0.0.0.0', () => {
    console.log(`[Engine] Webhook server listening on port ${WEBHOOK_PORT}`);
  });

  console.log(`[Engine] WebSocket server on ws://localhost:${WS_PORT}`);
  console.log('[Engine] PocketDeploy engine started successfully!');
}

// ── [H8] Graceful shutdown — stop PM2 apps ───────────────
async function gracefulShutdown() {
  console.log('[Engine] Shutting down...');
  const apps = db.getAllApps().filter(a => a.status === 'running');
  for (const appRecord of apps) {
    try {
      await processManager.stopApp(appRecord.id);
    } catch (err) {
      console.error(`[Engine] Failed to stop ${appRecord.id}:`, err.message);
    }
  }
  tunnelManager.destroyAllTunnels();
  db.close();
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { ENGINE_SECRET };

startup().catch((err) => {
  console.error('[Engine] Startup failed:', err);
  process.exit(1);
});
