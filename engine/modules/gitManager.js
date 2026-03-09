const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { SHELL_ENV, APPS_DIR, FILES_DIR } = require('./binaryManager');

/**
 * Spawns a process and streams output line by line to onLog callback.
 * Resolves on exit code 0, rejects otherwise.
 */
function spawnWithLogs(cmd, args, options, onLog) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, options);

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        if (onLog) onLog(line.trim());
      }
    });

    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        if (onLog) onLog(line.trim());
      }
    });

    proc.on('error', (err) => reject(err));

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command "${cmd} ${args.join(' ')}" exited with code ${code}`));
    });
  });
}

async function cloneRepo(repoUrl, appId, branch = 'main', onLog) {
  const appPath = path.join(APPS_DIR, appId);

  // Ensure apps directory exists
  if (!fs.existsSync(APPS_DIR)) {
    fs.mkdirSync(APPS_DIR, { recursive: true });
  }

  return spawnWithLogs(
    'git',
    ['clone', '--branch', branch, '--depth', '1', repoUrl, appPath],
    { env: SHELL_ENV, cwd: FILES_DIR },
    onLog
  );
}

async function pullLatest(appId, branch = 'main', onLog) {
  const appPath = path.join(APPS_DIR, appId);
  return spawnWithLogs(
    'git',
    ['-C', appPath, 'pull', 'origin', branch],
    { env: SHELL_ENV },
    onLog
  );
}

function getCommitInfo(appId) {
  const appPath = path.join(APPS_DIR, appId);
  try {
    const raw = execSync(
      'git log -1 --pretty=format:"%H|%h|%s|%an|%ai"',
      { cwd: appPath, env: SHELL_ENV, stdio: 'pipe' }
    ).toString().replace(/^"|"$/g, '');

    const [hash, shortHash, message, author, date] = raw.split('|');
    return { hash, shortHash, message, author, date };
  } catch (err) {
    return null;
  }
}

function repoExists(appId) {
  return fs.existsSync(path.join(APPS_DIR, appId, '.git'));
}

async function deleteRepo(appId) {
  const appPath = path.join(APPS_DIR, appId);
  if (fs.existsSync(appPath)) {
    fs.rmSync(appPath, { recursive: true, force: true });
  }
}

function getAppPath(appId) {
  return path.join(APPS_DIR, appId);
}

module.exports = {
  cloneRepo,
  pullLatest,
  getCommitInfo,
  repoExists,
  deleteRepo,
  getAppPath,
  spawnWithLogs,
};
