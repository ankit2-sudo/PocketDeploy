const path = require('path');
const { BIN_DIR, FILES_DIR, LOGS_DIR, SHELL_ENV } = require('./binaryManager');

// PM2 is loaded dynamically since it's installed at runtime
let pm2;

function getPM2() {
  if (!pm2) {
    // PM2 is installed globally via bundled npm, so it lives in the lib/node_modules path
    const pm2Path = path.join(FILES_DIR, 'lib', 'node_modules', 'pm2');
    pm2 = require(pm2Path);
  }
  return pm2;
}

function connectPM2() {
  return new Promise((resolve, reject) => {
    getPM2().connect((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function disconnectPM2() {
  try { getPM2().disconnect(); } catch {}
}

async function startApp(appId, startCommand, port, cwd, envVars = {}) {
  // Parse startCommand into script + args
  const parts = startCommand.split(' ');
  const script = parts[0];
  const args = parts.slice(1).join(' ');

  return new Promise((resolve, reject) => {
    getPM2().connect((err) => {
      if (err) return reject(err);
      getPM2().start(
        {
          name: appId,
          script: script,
          args: args || undefined,
          cwd: cwd,
          env: {
            PORT: port.toString(),
            NODE_ENV: 'production',
            PATH: `${BIN_DIR}:${process.env.PATH || ''}`,
            HOME: FILES_DIR,
            LD_LIBRARY_PATH: path.join(FILES_DIR, 'lib'),
            ...envVars,
          },
          autorestart: true,
          max_restarts: 5,
          min_uptime: '5s',
          output: path.join(LOGS_DIR, `${appId}.log`),
          error: path.join(LOGS_DIR, `${appId}_error.log`),
          merge_logs: true,
        },
        (err) => {
          getPM2().disconnect();
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });
}

async function stopApp(appId) {
  return new Promise((resolve, reject) => {
    getPM2().connect((err) => {
      if (err) return reject(err);
      getPM2().stop(appId, (err) => {
        getPM2().disconnect();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

async function restartApp(appId) {
  return new Promise((resolve, reject) => {
    getPM2().connect((err) => {
      if (err) return reject(err);
      getPM2().restart(appId, (err) => {
        getPM2().disconnect();
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

async function deleteApp(appId) {
  return new Promise((resolve, reject) => {
    getPM2().connect((err) => {
      if (err) return reject(err);
      getPM2().delete(appId, (err) => {
        getPM2().disconnect();
        // Ignore error if process doesn't exist
        resolve();
      });
    });
  });
}

async function getStatus(appId) {
  return new Promise((resolve, reject) => {
    getPM2().connect((err) => {
      if (err) return reject(err);
      getPM2().describe(appId, (err, desc) => {
        getPM2().disconnect();
        if (err || !desc || desc.length === 0) {
          resolve('unknown');
          return;
        }
        const status = desc[0].pm2_env.status;
        // PM2 statuses: online, stopping, stopped, launching, errored
        const statusMap = {
          online: 'running',
          stopped: 'stopped',
          stopping: 'stopped',
          errored: 'crashed',
          launching: 'starting',
        };
        resolve(statusMap[status] || 'unknown');
      });
    });
  });
}

async function getLogs(appId, lines = 200) {
  const fs = require('fs');
  const logPath = path.join(LOGS_DIR, `${appId}.log`);
  const errorPath = path.join(LOGS_DIR, `${appId}_error.log`);

  const result = [];

  for (const [filePath, type] of [[logPath, 'stdout'], [errorPath, 'stderr']]) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileLines = content.split('\n').filter(Boolean).slice(-lines);
      for (const line of fileLines) {
        result.push({
          timestamp: new Date().toISOString(),
          message: line,
          type,
        });
      }
    }
  }

  // Sort by timestamp and return last N lines
  return result.slice(-lines);
}

async function listAll() {
  return new Promise((resolve, reject) => {
    getPM2().connect((err) => {
      if (err) return reject(err);
      getPM2().list((err, list) => {
        getPM2().disconnect();
        if (err) return reject(err);
        const apps = list.map((proc) => ({
          id: proc.name,
          status: proc.pm2_env.status === 'online' ? 'running' : proc.pm2_env.status,
          uptime: proc.pm2_env.pm_uptime ? Date.now() - proc.pm2_env.pm_uptime : 0,
          memory: proc.monit ? proc.monit.memory : 0,
          cpu: proc.monit ? proc.monit.cpu : 0,
          restarts: proc.pm2_env.restart_time || 0,
        }));
        resolve(apps);
      });
    });
  });
}

module.exports = {
  startApp,
  stopApp,
  restartApp,
  deleteApp,
  getStatus,
  getLogs,
  listAll,
};
