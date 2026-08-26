import express from 'express';
import fs from 'node:fs/promises';
import matter from 'gray-matter';
import { getConfig } from '../lib/config-store.js';
import { safeJoin } from '../lib/safe-path.js';
import { markdownToBlocks } from '../lib/md-to-blocks.js';

export const importRouter = express.Router();

// POST /api/import { path } -> read an existing md file and convert it to blocks.
// This does NOT create a draft: a draft is only created lazily, client-side, on
// the first actual edit (so opening a file to read/skim leaves no draft behind).
importRouter.post('/import', express.json(), async (req, res) => {
  const cfg = await getConfig();
  if (!cfg.targetRoot) return res.status(409).json({ error: 'no-target' });
  try {
    const rel = String(req.body?.path || '').replace(/\\/g, '/');
    const abs = safeJoin(cfg.targetRoot, rel);
    const raw = await fs.readFile(abs, 'utf8');
    const { data: frontmatter, content } = matter(raw);
    const editorData = markdownToBlocks(content);
    res.json({ frontmatter, editorData, sourceRelPath: rel });
  } catch (err) {
    console.error('[JekyllNote] import-failed:', err.message || err);
    res.status(400).json({ error: 'import-failed' });
  }
});
