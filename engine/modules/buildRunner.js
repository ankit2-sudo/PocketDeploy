const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { SHELL_ENV, FILES_DIR, APPS_DIR } = require('./binaryManager');
const gitManager = require('./gitManager');
const scanner = require('./scanner');
const processManager = require('./processManager');
const tunnelManager = require('./tunnelManager');
const db = require('../db/database');

// [C1] Command allowlist — only these binaries can be executed
const ALLOWED_COMMANDS = new Set([
  'npm', 'node', 'npx', 'pip', 'pip3', 'python', 'python3',
  'go', 'cargo', 'composer', 'bundle', 'flask', 'uvicorn',
  'rails', 'php', 'ruby', 'serve',
]);

// [H1] Deploy lock map — prevents concurrent deploys on same app
const deployLocks = new Map();

/**
 * Runs a shell command with SHELL_ENV, streams output to emit callback.
 * [C1] Validates command against allowlist and uses shell: false.
 */
async function runCommand(command, cwd, appId, emit) {
  const parts = command.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);

  // [C1] Validate command against allowlist
  if (!ALLOWED_COMMANDS.has(cmd)) {
    throw new Error(`Command '${cmd}' is not in the allowlist. Allowed: ${[...ALLOWED_COMMANDS].join(', ')}`);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      env: SHELL_ENV,
      shell: false,  // [C1] FIXED: shell: false prevents shell injection
    });

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        emit('log', appId, {
          timestamp: new Date().toISOString(),
          message: line.trim(),
          type: 'stdout',
        });
      }
    });

    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        emit('log', appId, {
          timestamp: new Date().toISOString(),
          message: line.trim(),
          type: 'stderr',
        });
      }
    });

    proc.on('error', (err) => reject(err));

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command "${command}" exited with code ${code}`));
    });
  });
}

/**
 * Orchestrates the full deploy pipeline for an app.
 * [H1] Uses deploy locking to prevent concurrent deploys on the same app.
 */
async function runDeploy(appId, repoUrl, branch, config, port, envVars, isFirstDeploy, emit) {
  // [H1] Wait for any existing deploy on this app to finish
  if (deployLocks.has(appId)) {
    try {
      await deployLocks.get(appId);
    } catch {
      // Previous deploy failed — continue with new deploy
    }
  }

  const deployPromise = _runDeployInternal(appId, repoUrl, branch, config, port, envVars, isFirstDeploy, emit);
  deployLocks.set(appId, deployPromise);

  try {
    await deployPromise;
  } finally {
    deployLocks.delete(appId);
  }
}

async function _runDeployInternal(appId, repoUrl, branch, config, port, envVars, isFirstDeploy, emit) {
  const appPath = path.join(APPS_DIR, appId);
  const deployId = uuidv4();
  const startedAt = new Date().toISOString();

  db.createDeploy({
    id: deployId,
    app_id: appId,
    trigger: isFirstDeploy ? 'manual' : (config ? 'webhook' : 'manual'),
    status: 'running',
    log: '',
    started_at: startedAt,
    finished_at: null,
  });

  try {
    // ── Step 1: Clone or Pull ─────────────────────────────
    emit('status_change', appId, 'cloning');
    db.updateApp(appId, { status: 'cloning' });

    emit('log', appId, {
      timestamp: new Date().toISOString(),
      message: isFirstDeploy
        ? `Cloning ${repoUrl} (branch: ${branch})...`
        : `Pulling latest from ${branch}...`,
      type: 'system',
    });

    if (isFirstDeploy) {
      await gitManager.cloneRepo(repoUrl, appId, branch, (line) => {
        emit('log', appId, {
          timestamp: new Date().toISOString(),
          message: line,
          type: 'stdout',
        });
      });
    } else {
      await gitManager.pullLatest(appId, branch, (line) => {
        emit('log', appId, {
          timestamp: new Date().toISOString(),
          message: line,
          type: 'stdout',
        });
      });
    }

    // ── Step 2: Scan (first deploy only) ──────────────────
    if (isFirstDeploy || !config) {
      emit('log', appId, {
        timestamp: new Date().toISOString(),
        message: 'Scanning repository...',
        type: 'system',
      });

      const detected = scanner.detectProject(appPath);
      config = detected;

      emit('log', appId, {
        timestamp: new Date().toISOString(),
        message: `Detected: ${detected.projectType} (${detected.language}) — confidence: ${detected.confidence}`,
        type: 'system',
      });

      db.updateApp(appId, {
        project_type: detected.projectType,
        install_cmd: detected.installCommand,
        build_cmd: detected.buildCommand,
        start_cmd: detected.startCommand,
      });
    }

    // ── Step 3: Install ───────────────────────────────────
    const installCmd = config.installCommand || config.install;
    if (installCmd) {
      emit('status_change', appId, 'installing');
      db.updateApp(appId, { status: 'installing' });

      emit('log', appId, {
        timestamp: new Date().toISOString(),
        message: `Running: ${installCmd}`,
        type: 'system',
      });

      await runCommand(installCmd, appPath, appId, emit);
    }

    // ── Step 4: Build ─────────────────────────────────────
    const buildCmd = config.buildCommand || config.build;
    if (buildCmd) {
      emit('status_change', appId, 'building');
      db.updateApp(appId, { status: 'building' });

      emit('log', appId, {
        timestamp: new Date().toISOString(),
        message: `Running: ${buildCmd}`,
        type: 'system',
      });

      await runCommand(buildCmd, appPath, appId, emit);
    }

    // ── Step 5: Start ─────────────────────────────────────
    emit('status_change', appId, 'starting');
    db.updateApp(appId, { status: 'starting' });

    await processManager.stopApp(appId).catch(() => {});
    await processManager.deleteApp(appId).catch(() => {});

    const startCmd = (config.startCommand || config.start || 'node index.js').replace('$PORT', port.toString());

    emit('log', appId, {
      timestamp: new Date().toISOString(),
      message: `Starting app on port ${port}: ${startCmd}`,
      type: 'system',
    });

    await processManager.startApp(appId, startCmd, port, appPath, envVars);

    // ── Step 6: Tunnel ────────────────────────────────────
    emit('status_change', appId, 'running');
    db.updateApp(appId, { status: 'running', last_deploy: new Date().toISOString() });

    emit('log', appId, {
      timestamp: new Date().toISOString(),
      message: 'Starting Cloudflare tunnel...',
      type: 'system',
    });

    const tunnelUrl = await tunnelManager.createTunnel(appId, port, (url) => {
      emit('tunnel_ready', appId, url);
      db.updateApp(appId, { tunnel_url: url });

      emit('log', appId, {
        timestamp: new Date().toISOString(),
        message: `Tunnel live at: ${url}`,
        type: 'system',
      });
    });

    // ── Success ───────────────────────────────────────────
    db.updateDeploy(deployId, {
      status: 'success',
      finished_at: new Date().toISOString(),
    });

    emit('deploy_complete', appId, true);

    emit('log', appId, {
      timestamp: new Date().toISOString(),
      message: 'Deploy complete! App is live.',
      type: 'system',
    });

  } catch (err) {
    emit('status_change', appId, 'error');
    db.updateApp(appId, { status: 'error' });

    emit('log', appId, {
      timestamp: new Date().toISOString(),
      message: `ERROR: ${err.message}`,
      type: 'stderr',
    });

    emit('deploy_complete', appId, false, err.message);

    db.updateDeploy(deployId, {
      status: 'failed',
      log: err.message,
      finished_at: new Date().toISOString(),
    });
  }
}

module.exports = { runDeploy, runCommand };
