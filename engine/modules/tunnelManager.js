const { spawn } = require('child_process');
const { SHELL_ENV, BIN_DIR } = require('./binaryManager');

// Store active cloudflared processes and URLs in memory
const tunnelProcesses = new Map(); // appId -> childProcess
const tunnelUrls = new Map();      // appId -> url string

async function createTunnel(appId, port, onUrlFound) {
  // Kill existing tunnel for this app if any
  await destroyTunnel(appId);

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

    // [M1] Timeout after 30 seconds — use SIGKILL to ensure process dies
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { proc.kill('SIGKILL'); } catch {}
        tunnelProcesses.delete(appId);
        reject(new Error('Tunnel creation timed out after 30s'));
      }
    }, 30000);
  });
}

// [M12] Wait for process to actually die before cleaning up
function destroyTunnel(appId) {
  const proc = tunnelProcesses.get(appId);
  if (proc) {
    return new Promise((resolve) => {
      // Listen for close event to confirm process is dead
      proc.once('close', () => {
        tunnelProcesses.delete(appId);
        tunnelUrls.delete(appId);
        resolve();
      });

      try { proc.kill('SIGTERM'); } catch {}

      // Fallback: SIGKILL after 5s if SIGTERM doesn't work
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        // Force cleanup after another second
        setTimeout(() => {
          tunnelProcesses.delete(appId);
          tunnelUrls.delete(appId);
          resolve();
        }, 1000);
      }, 5000);
    });
  }
  tunnelUrls.delete(appId);
  return Promise.resolve();
}

function getTunnelUrl(appId) {
  return tunnelUrls.get(appId) || null;
}

function destroyAllTunnels() {
  const promises = [];
  for (const [appId] of tunnelProcesses) {
    promises.push(destroyTunnel(appId));
  }
  return Promise.all(promises);
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
