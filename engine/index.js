const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

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

// ── Express App ──────────────────────────────────────────
const app = express();
app.use(express.json());

// ── WebSocket Server ─────────────────────────────────────
const wsServer = new WebSocket.Server({ port: WS_PORT });
const wsClients = new Set();

wsServer.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

function emit(event, appId, data, extra) {
  const message = JSON.stringify({ event, appId, ...( typeof data === 'object' ? data : { data }), ...(extra ? { extra } : {}) });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(message); } catch {}
    }
  }
}

// Overload emit for specific event patterns
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

// ── Port Registry ────────────────────────────────────────
function getNextAvailablePort() {
  const usedPorts = db.getAllApps().map((a) => a.port).filter(Boolean);
  for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) {
    if (!usedPorts.includes(p)) return p;
  }
  return null;
}

// ── REST API Routes ──────────────────────────────────────

// Health check
app.get('/health', async (req, res) => {
  const apps = db.getAllApps();
  const running = apps.filter((a) => a.status === 'running').length;
  res.json({ status: 'ok', appsRunning: running, totalApps: apps.length, maxApps: MAX_APPS });
});

// Create app and start deploy
app.post('/apps', async (req, res) => {
  try {
    const { repoUrl, name, branch = 'main' } = req.body;

    if (!repoUrl || !name) {
      return res.status(400).json({ error: 'repoUrl and name are required' });
    }

    if (db.getAppCount() >= MAX_APPS) {
      return res.status(400).json({ error: `Maximum ${MAX_APPS} apps allowed` });
    }

    const port = getNextAvailablePort();
    if (!port) {
      return res.status(400).json({ error: 'No available ports. Delete an app first.' });
    }

    const appId = `app_${uuidv4().split('-')[0]}`;
    const webhookSecret = uuidv4();

    const appRecord = {
      id: appId,
      name,
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
    res.status(201).json(appRecord);

    // Start deploy async
    buildRunner.runDeploy(appId, repoUrl, branch, null, port, {}, true, wsEmit).catch((err) => {
      console.error(`[Deploy] Failed for ${appId}:`, err.message);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all apps
app.get('/apps', (req, res) => {
  try {
    const apps = db.getAllApps();
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single app
app.get('/apps/:id', (req, res) => {
  try {
    const app = db.getApp(req.params.id);
    if (!app) return res.status(404).json({ error: 'App not found' });
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete app
app.delete('/apps/:id', async (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    // Stop process, destroy tunnel, delete repo
    await processManager.stopApp(req.params.id).catch(() => {});
    await processManager.deleteApp(req.params.id).catch(() => {});
    tunnelManager.destroyTunnel(req.params.id);
    await gitManager.deleteRepo(req.params.id);
    db.deleteApp(req.params.id);

    wsEmit('status_change', req.params.id, 'deleted');
    res.json({ message: 'App deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger manual redeploy
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
    res.status(500).json({ error: err.message });
  }
});

// Stop app
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
    res.status(500).json({ error: err.message });
  }
});

// Start app
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

    // Re-establish tunnel
    tunnelManager.createTunnel(req.params.id, appRecord.port, (url) => {
      db.updateApp(req.params.id, { tunnel_url: url });
      wsEmit('tunnel_ready', req.params.id, url);
    }).catch((err) => {
      console.error(`[Tunnel] Failed for ${req.params.id}:`, err.message);
    });

    res.json({ message: 'App started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restart app
app.post('/apps/:id/restart', async (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    await processManager.restartApp(req.params.id);
    db.updateApp(req.params.id, { status: 'running' });
    wsEmit('status_change', req.params.id, 'running');
    res.json({ message: 'App restarted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get logs
app.get('/apps/:id/logs', async (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    const logs = await processManager.getLogs(req.params.id, 200);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get deploy history
app.get('/apps/:id/deploys', (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    const deploys = db.getDeploysByApp(req.params.id);
    res.json(deploys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set environment variables
app.post('/apps/:id/env', (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    const { vars } = req.body;
    if (!Array.isArray(vars)) return res.status(400).json({ error: 'vars must be an array' });

    const envVars = vars.map((v) => ({
      id: v.id || uuidv4(),
      app_id: req.params.id,
      key: v.key,
      value: v.value,
    }));

    db.setEnvVars(req.params.id, envVars);
    res.json({ message: 'Environment variables updated', count: envVars.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get tunnel URL
app.get('/apps/:id/tunnel', (req, res) => {
  try {
    const appRecord = db.getApp(req.params.id);
    if (!appRecord) return res.status(404).json({ error: 'App not found' });

    const url = tunnelManager.getTunnelUrl(req.params.id) || appRecord.tunnel_url;
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Scan Repo (without deploying) ────────────────────────
app.post('/scan', async (req, res) => {
  try {
    const { repoUrl, branch = 'main' } = req.body;
    if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });

    // Clone to a temp directory, scan, then clean up
    const tempId = `scan_${Date.now()}`;
    await gitManager.cloneRepo(repoUrl, tempId, branch);
    const appPath = gitManager.getAppPath(tempId);
    const result = scanner.detectProject(appPath);
    await gitManager.deleteRepo(tempId);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stop all apps ────────────────────────────────────────
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
    res.status(500).json({ error: err.message });
  }
});

// ── GitHub token ─────────────────────────────────────────
let githubToken = null;
app.post('/settings/github-token', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });
    githubToken = token;
    // In production, store this in Android Keystore via a native module
    res.json({ message: 'Token saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Engine restart ───────────────────────────────────────
app.post('/engine/restart', (req, res) => {
  res.json({ message: 'Engine restarting...' });
  // Graceful shutdown then restart — in production the foreground service handles this
  setTimeout(() => {
    process.exit(0); // Foreground service will restart the engine
  }, 500);
});

// ── Webhook Server ───────────────────────────────────────
const webhookApp = express();
webhookServer.init(db, buildRunner, wsEmit);
webhookApp.use('/webhook', webhookServer.router);

// ── Startup ──────────────────────────────────────────────
async function startup() {
  console.log('[Engine] Starting PocketDeploy engine...');

  // Ensure directories exist
  binaryManager.ensureDirectories();

  // Initialize database
  db.initialize();
  console.log('[Engine] Database initialized');

  // Check and install PM2 if needed
  if (!binaryManager.isPM2Installed()) {
    console.log('[Engine] Installing PM2...');
    await binaryManager.installPM2((line) => console.log('[PM2]', line));
    console.log('[Engine] PM2 installed');
  }

  // Restore previously running apps
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

        // Re-establish tunnel
        tunnelManager.createTunnel(appRecord.id, appRecord.port, (url) => {
          db.updateApp(appRecord.id, { tunnel_url: url });
          wsEmit('tunnel_ready', appRecord.id, url);
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

  // Start API server
  app.listen(API_PORT, '127.0.0.1', () => {
    console.log(`[Engine] REST API listening on http://localhost:${API_PORT}`);
  });

  // Start webhook server
  webhookApp.listen(WEBHOOK_PORT, '0.0.0.0', () => {
    console.log(`[Engine] Webhook server listening on port ${WEBHOOK_PORT}`);
  });

  console.log(`[Engine] WebSocket server on ws://localhost:${WS_PORT}`);
  console.log('[Engine] PocketDeploy engine started successfully!');
}

// ── Graceful shutdown ────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('[Engine] Shutting down...');
  tunnelManager.destroyAllTunnels();
  db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Engine] Shutting down...');
  tunnelManager.destroyAllTunnels();
  db.close();
  process.exit(0);
});

// Start the engine
startup().catch((err) => {
  console.error('[Engine] Startup failed:', err);
  process.exit(1);
});
