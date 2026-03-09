const express = require('express');
const crypto = require('crypto');
const router = express.Router();

let dbRef = null;
let buildRunnerRef = null;
let emitRef = null;

function init(db, buildRunner, emit) {
  dbRef = db;
  buildRunnerRef = buildRunner;
  emitRef = emit;
}

// Use express.raw() so we get the raw body for HMAC verification
router.post('/:appId', express.raw({ type: 'application/json' }), async (req, res) => {
  const { appId } = req.params;

  if (!dbRef) {
    return res.status(500).json({ error: 'Webhook server not initialized' });
  }

  const app = dbRef.getApp(appId);
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }

  if (!app.webhook_secret) {
    return res.status(400).json({ error: 'No webhook secret configured for this app' });
  }

  // ── Validate GitHub HMAC-SHA256 signature ──────────────────────
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) {
    return res.status(401).json({ error: 'No signature header' });
  }

  const rawBody = typeof req.body === 'string' ? req.body : req.body;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', app.webhook_secret)
    .update(rawBody)
    .digest('hex');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch {
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  // ── Check event type ─────────────────────────────────────────
  const event = req.headers['x-github-event'];
  if (event === 'ping') {
    return res.status(200).json({ message: 'Pong! Webhook configured successfully.' });
  }

  if (event !== 'push') {
    return res.status(200).json({ message: `Ignored event: ${event}` });
  }

  // ── Check branch ─────────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const pushedBranch = (payload.ref || '').replace('refs/heads/', '');
  if (pushedBranch !== app.branch) {
    return res.status(200).json({ message: `Ignored push to ${pushedBranch}, watching ${app.branch}` });
  }

  // ── Respond immediately, deploy async ────────────────────────
  res.status(200).json({ message: 'Deploy triggered', appId });

  // Get env vars for this app
  const envVarsRaw = dbRef.getEnvVars(appId);
  const envVars = {};
  for (const v of envVarsRaw) {
    envVars[v.key] = v.value;
  }

  // Trigger async redeploy
  const config = {
    installCommand: app.install_cmd,
    buildCommand: app.build_cmd,
    startCommand: app.start_cmd,
  };

  if (emitRef) {
    emitRef('log', appId, {
      timestamp: new Date().toISOString(),
      message: `Webhook received: push to ${pushedBranch} by ${payload.pusher?.name || 'unknown'}`,
      type: 'system',
    });
  }

  buildRunnerRef.runDeploy(
    appId, app.repo_url, app.branch, config, app.port, envVars, false, emitRef
  ).catch((err) => {
    console.error(`[Webhook] Deploy failed for ${appId}:`, err.message);
  });
});

module.exports = { router, init };
