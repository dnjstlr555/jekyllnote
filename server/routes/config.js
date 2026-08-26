import express from 'express';
import { getConfig, updateConfig, validateTargetRoot } from '../lib/config-store.js';

export const configRouter = express.Router();

// GET /api/config -> current config (targetRoot etc.)
configRouter.get('/config', async (req, res) => {
  const cfg = await getConfig();
  res.json({ targetRoot: cfg.targetRoot });
});

// POST /api/config/target { targetRoot } -> validate & persist
configRouter.post('/config/target', express.json(), async (req, res) => {
  const candidate = String(req.body?.targetRoot || '').trim();
  const check = await validateTargetRoot(candidate);
  if (!check.ok) {
    return res.status(400).json({ error: 'invalid-target' });
  }
  await updateConfig({ targetRoot: candidate });
  res.json({ ok: true, targetRoot: candidate });
});
