const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { SHELL_ENV, APPS_DIR, FILES_DIR } = require('./binaryManager');

// [C4] Validate appId to prevent path traversal
function sanitizeAppId(appId) {
  if (!appId || typeof appId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(appId)) {
    throw new Error(`Invalid appId: ${appId}`);
  }
  return appId;
}

// [H6] Validate repo URL — HTTPS only, no private IPs
function validateRepoUrl(repoUrl) {
  try {
    const parsed = new URL(repoUrl);
    if (parsed.protocol !== 'https:') {
      throw new Error('Only HTTPS repository URLs are allowed');
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
        host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('172.')) {
      throw new Error('Private/local repository URLs are not allowed');
    }
  } catch (err) {
    if (err.message.includes('HTTPS') || err.message.includes('Private')) throw err;
    throw new Error(`Invalid repository URL: ${repoUrl}`);
  }
}

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
  sanitizeAppId(appId);       // [C4]
  validateRepoUrl(repoUrl);   // [H6]

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

// [L3] Use fetch+reset instead of pull for shallow clones
async function pullLatest(appId, branch = 'main', onLog) {
  sanitizeAppId(appId);  // [C4]
  const appPath = path.join(APPS_DIR, appId);

  // fetch --depth 1 works correctly with shallow clones (unlike pull)
  await spawnWithLogs(
    'git',
    ['-C', appPath, 'fetch', '--depth', '1', 'origin', branch],
    { env: SHELL_ENV },
    onLog
  );

  // Reset working tree to match fetched HEAD
  await spawnWithLogs(
    'git',
    ['-C', appPath, 'reset', '--hard', `origin/${branch}`],
    { env: SHELL_ENV },
    onLog
  );
}

// [M7] Use null byte delimiter to safely parse commit messages containing pipes
function getCommitInfo(appId) {
  sanitizeAppId(appId);  // [C4]
  const appPath = path.join(APPS_DIR, appId);
  try {
    const raw = execSync(
      'git log -1 --pretty=format:"%H%x00%h%x00%s%x00%an%x00%ai"',
      { cwd: appPath, env: SHELL_ENV, stdio: 'pipe' }
    ).toString().replace(/^"|"$/g, '');

    const [hash, shortHash, message, author, date] = raw.split('\0');
    return { hash, shortHash, message, author, date };
  } catch (err) {
    return null;
  }
}

function repoExists(appId) {
  sanitizeAppId(appId);  // [C4]
  return fs.existsSync(path.join(APPS_DIR, appId, '.git'));
}

async function deleteRepo(appId) {
  sanitizeAppId(appId);  // [C4]
  const appPath = path.join(APPS_DIR, appId);
  if (fs.existsSync(appPath)) {
    fs.rmSync(appPath, { recursive: true, force: true });
  }
}

function getAppPath(appId) {
  sanitizeAppId(appId);  // [C4]
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
