const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { BIN_DIR, FILES_DIR, LOGS_DIR, SHELL_ENV } = require('./binaryManager');

// PM2 is loaded dynamically since it's installed at runtime
let pm2;

function getPM2() {
  if (!pm2) {
    const pm2Path = path.join(FILES_DIR, 'lib', 'node_modules', 'pm2');
    pm2 = require(pm2Path);
  }
  return pm2;
}

// [L2] Removed dead connectPM2/disconnectPM2 standalone functions

// [H2] Persistent PM2 connection with proper connect/disconnect helper
// Ensures disconnect always runs even on error, preventing leaked handles
async function withPM2(fn) {
  return new Promise((resolve, reject) => {
    getPM2().connect((err) => {
      if (err) return reject(err);
      try {
        fn((err, result) => {
          getPM2().disconnect();
          if (err) reject(err);
          else resolve(result);
        });
      } catch (e) {
        getPM2().disconnect();
        reject(e);
      }
    });
  });
}

// [M8] Proper command parsing — split on spaces but respect the structure
function parseCommand(startCommand) {
  // Simple but safe: split on whitespace, first token is script, rest are args
  const parts = startCommand.trim().split(/\s+/);
  return {
    script: parts[0],
    args: parts.slice(1).join(' ') || undefined,
  };
}

async function startApp(appId, startCommand, port, cwd, envVars = {}) {
  // [M8] Use proper command parsing
  const { script, args } = parseCommand(startCommand);

  return withPM2((done) => {
    getPM2().start(
      {
        name: appId,
        script,
        args,
        cwd,
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
      done
    );
  });
}

async function stopApp(appId) {
  return withPM2((done) => {
    getPM2().stop(appId, done);
  });
}

async function restartApp(appId) {
  return withPM2((done) => {
    getPM2().restart(appId, done);
  });
}

async function deleteApp(appId) {
  return withPM2((done) => {
    getPM2().delete(appId, (err) => {
      // Ignore error if process doesn't exist
      done(null);
    });
  });
}

async function getStatus(appId) {
  return withPM2((done) => {
    getPM2().describe(appId, (err, desc) => {
      if (err || !desc || desc.length === 0) {
        return done(null, 'unknown');
      }
      const status = desc[0].pm2_env.status;
      const statusMap = {
        online: 'running',
        stopped: 'stopped',
        stopping: 'stopped',
        errored: 'crashed',
        launching: 'starting',
      };
      done(null, statusMap[status] || 'unknown');
    });
  });
}

// [M3] Use tail-based log reading to avoid loading entire file into memory
// [M4] Use timestamp: null for historical logs — don't fabricate timestamps
async function getLogs(appId, lines = 200) {
  const logPath = path.join(LOGS_DIR, `${appId}.log`);
  const errorPath = path.join(LOGS_DIR, `${appId}_error.log`);

  const result = [];

  for (const [filePath, type] of [[logPath, 'stdout'], [errorPath, 'stderr']]) {
    if (fs.existsSync(filePath)) {
      try {
        // [M3] Use tail to read only the last N lines, with maxBuffer safety
        const content = execSync(`tail -n ${lines} "${filePath}"`, {
          encoding: 'utf8',
          maxBuffer: 1024 * 1024, // 1MB max
        });
        const fileLines = content.split('\n').filter(Boolean);
        for (const line of fileLines) {
          result.push({
            // [M4] Don't fabricate timestamps for historical logs
            timestamp: null,
            message: line,
            type,
          });
        }
      } catch {
        // tail failed — file may be empty or inaccessible
      }
    }
  }

  // Return last N lines total
  return result.slice(-lines);
}

async function listAll() {
  return withPM2((done) => {
    getPM2().list((err, list) => {
      if (err) return done(err);
      const apps = list.map((proc) => ({
        id: proc.name,
        status: proc.pm2_env.status === 'online' ? 'running' : proc.pm2_env.status,
        uptime: proc.pm2_env.pm_uptime ? Date.now() - proc.pm2_env.pm_uptime : 0,
        memory: proc.monit ? proc.monit.memory : 0,
        cpu: proc.monit ? proc.monit.cpu : 0,
        restarts: proc.pm2_env.restart_time || 0,
      }));
      done(null, apps);
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
