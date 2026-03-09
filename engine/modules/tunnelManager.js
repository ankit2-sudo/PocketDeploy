const { spawn } = require('child_process');
const { SHELL_ENV, BIN_DIR } = require('./binaryManager');

// Store active cloudflared processes and URLs in memory
const tunnelProcesses = new Map(); // appId -> childProcess
const tunnelUrls = new Map();      // appId -> url string

async function createTunnel(appId, port, onUrlFound) {
  // Kill existing tunnel for this app if any
  destroyTunnel(appId);

  return new Promise((resolve, reject) => {
    const proc = spawn(
      'cloudflared',
      ['tunnel', '--url', `http://localhost:${port}`],
      { env: SHELL_ENV }
    );

    let resolved = false;

    // cloudflared outputs the tunnel URL to stderr
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        const url = match[0];
        tunnelUrls.set(appId, url);
        tunnelProcesses.set(appId, proc);
        if (onUrlFound) onUrlFound(url);
        resolve(url);
      }
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        const url = match[0];
        tunnelUrls.set(appId, url);
        tunnelProcesses.set(appId, proc);
        if (onUrlFound) onUrlFound(url);
        resolve(url);
      }
    });

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`cloudflared exited with code ${code}`));
      }
      // Clean up if process exits unexpectedly
      tunnelProcesses.delete(appId);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        tunnelProcesses.delete(appId);
        reject(new Error('Tunnel creation timed out after 30s'));
      }
    }, 30000);
  });
}

function destroyTunnel(appId) {
  const proc = tunnelProcesses.get(appId);
  if (proc) {
    try { proc.kill('SIGTERM'); } catch {}
    tunnelProcesses.delete(appId);
  }
  tunnelUrls.delete(appId);
}

function getTunnelUrl(appId) {
  return tunnelUrls.get(appId) || null;
}

function destroyAllTunnels() {
  for (const [appId] of tunnelProcesses) {
    destroyTunnel(appId);
  }
}

function getActiveTunnelCount() {
  return tunnelProcesses.size;
}

module.exports = {
  createTunnel,
  destroyTunnel,
  getTunnelUrl,
  destroyAllTunnels,
  getActiveTunnelCount,
};
