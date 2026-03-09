const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const FILES_DIR = '/data/data/com.pocketdeploy/files';
const BIN_DIR = path.join(FILES_DIR, 'bin');
const LIB_DIR = path.join(FILES_DIR, 'lib');
const APPS_DIR = path.join(FILES_DIR, 'apps');
const LOGS_DIR = path.join(FILES_DIR, 'logs');
const DB_DIR = path.join(FILES_DIR, 'db');

// SINGLE source of truth for shell environment
// Import and use this in EVERY module that runs shell commands
const SHELL_ENV = {
  ...process.env,
  PATH: `${BIN_DIR}:${process.env.PATH || ''}`,
  HOME: FILES_DIR,
  PREFIX: FILES_DIR,
  LD_LIBRARY_PATH: LIB_DIR,
  TMPDIR: path.join(FILES_DIR, 'tmp'),
  NODE_PATH: path.join(LIB_DIR, 'node_modules'),
};

function ensureDirectories() {
  const dirs = [APPS_DIR, LOGS_DIR, DB_DIR, path.join(FILES_DIR, 'tmp')];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function isSetupComplete() {
  return fs.existsSync(path.join(BIN_DIR, 'node'));
}

function verifyBinaries() {
  const binaries = ['node', 'git', 'python3', 'cloudflared'];
  const results = {};
  for (const bin of binaries) {
    try {
      const version = execSync(`${path.join(BIN_DIR, bin)} --version`, {
        env: SHELL_ENV,
        stdio: 'pipe',
        timeout: 10000,
      }).toString().trim();
      results[bin] = { installed: true, version };
    } catch (err) {
      results[bin] = { installed: false, version: null, error: err.message };
    }
  }
  return results;
}

function isPM2Installed() {
  try {
    execSync(`${path.join(BIN_DIR, 'npm')} list -g pm2`, {
      env: SHELL_ENV,
      stdio: 'pipe',
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

async function installPM2(onLog) {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['install', '-g', 'pm2'], {
      env: SHELL_ENV,
      cwd: FILES_DIR,
    });

    proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line && onLog) onLog(line);
    });

    proc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line && onLog) onLog(line);
    });

    proc.on('error', (err) => reject(err));

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PM2 install failed with exit code ${code}`));
    });
  });
}

module.exports = {
  FILES_DIR,
  BIN_DIR,
  LIB_DIR,
  APPS_DIR,
  LOGS_DIR,
  DB_DIR,
  SHELL_ENV,
  ensureDirectories,
  isSetupComplete,
  verifyBinaries,
  isPM2Installed,
  installPM2,
};
