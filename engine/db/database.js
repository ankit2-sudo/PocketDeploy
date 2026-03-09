const path = require('path');
const Database = require('better-sqlite3');
const { DB_DIR } = require('../modules/binaryManager');

const DB_PATH = path.join(DB_DIR, 'pocketdeploy.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initialize() {
  const conn = getDb();

  conn.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      repo_url       TEXT NOT NULL,
      branch         TEXT DEFAULT 'main',
      project_type   TEXT,
      install_cmd    TEXT,
      build_cmd      TEXT,
      start_cmd      TEXT,
      port           INTEGER,
      tunnel_url     TEXT,
      webhook_secret TEXT,
      status         TEXT DEFAULT 'idle',
      created_at     TEXT,
      last_deploy    TEXT
    );

    CREATE TABLE IF NOT EXISTS deploys (
      id          TEXT PRIMARY KEY,
      app_id      TEXT NOT NULL,
      trigger     TEXT,
      status      TEXT,
      log         TEXT,
      started_at  TEXT,
      finished_at TEXT,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS env_vars (
      id      TEXT PRIMARY KEY,
      app_id  TEXT NOT NULL,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL,
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    );
  `);
}

// ── Apps CRUD ──────────────────────────────────────────────────

function createApp(app) {
  const stmt = getDb().prepare(`
    INSERT INTO apps (id, name, repo_url, branch, project_type, install_cmd, build_cmd, start_cmd, port, tunnel_url, webhook_secret, status, created_at, last_deploy)
    VALUES (@id, @name, @repo_url, @branch, @project_type, @install_cmd, @build_cmd, @start_cmd, @port, @tunnel_url, @webhook_secret, @status, @created_at, @last_deploy)
  `);
  return stmt.run(app);
}

function getApp(id) {
  return getDb().prepare('SELECT * FROM apps WHERE id = ?').get(id);
}

function getAllApps() {
  return getDb().prepare('SELECT * FROM apps ORDER BY created_at DESC').all();
}

function updateApp(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  const stmt = getDb().prepare(`UPDATE apps SET ${sets} WHERE id = @id`);
  return stmt.run({ id, ...fields });
}

function deleteApp(id) {
  return getDb().prepare('DELETE FROM apps WHERE id = ?').run(id);
}

function getAppCount() {
  const row = getDb().prepare('SELECT COUNT(*) as count FROM apps').get();
  return row.count;
}

// ── Deploys CRUD ───────────────────────────────────────────────

function createDeploy(deploy) {
  const stmt = getDb().prepare(`
    INSERT INTO deploys (id, app_id, trigger, status, log, started_at, finished_at)
    VALUES (@id, @app_id, @trigger, @status, @log, @started_at, @finished_at)
  `);
  return stmt.run(deploy);
}

function getDeploy(id) {
  return getDb().prepare('SELECT * FROM deploys WHERE id = ?').get(id);
}

function getDeploysByApp(appId, limit = 20) {
  return getDb().prepare('SELECT * FROM deploys WHERE app_id = ? ORDER BY started_at DESC LIMIT ?').all(appId, limit);
}

function updateDeploy(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  const stmt = getDb().prepare(`UPDATE deploys SET ${sets} WHERE id = @id`);
  return stmt.run({ id, ...fields });
}

// ── Env Vars CRUD ──────────────────────────────────────────────

function setEnvVars(appId, vars) {
  const deleteStmt = getDb().prepare('DELETE FROM env_vars WHERE app_id = ?');
  const insertStmt = getDb().prepare('INSERT INTO env_vars (id, app_id, key, value) VALUES (@id, @app_id, @key, @value)');

  const transaction = getDb().transaction(() => {
    deleteStmt.run(appId);
    for (const v of vars) {
      insertStmt.run({ id: v.id, app_id: appId, key: v.key, value: v.value });
    }
  });

  transaction();
}

function getEnvVars(appId) {
  return getDb().prepare('SELECT * FROM env_vars WHERE app_id = ?').all(appId);
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initialize,
  createApp,
  getApp,
  getAllApps,
  updateApp,
  deleteApp,
  getAppCount,
  createDeploy,
  getDeploy,
  getDeploysByApp,
  updateDeploy,
  setEnvVars,
  getEnvVars,
  close,
};
