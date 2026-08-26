import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { getConfig } from '../lib/config-store.js';
import { safeJoin } from '../lib/safe-path.js';

export const filesRouter = express.Router();

// Directories we never traverse when listing markdown files.
const IGNORE_DIRS = new Set(['.git', '_site', 'node_modules', '.jekyll-cache', '.github', '.vscode', '.devcontainer']);

async function requireTarget(res) {
  const cfg = await getConfig();
  if (!cfg.targetRoot) {
    res.status(409).json({ error: 'no-target' });
    return null;
  }
  return cfg.targetRoot;
}

/**
 * Recursively collect every .md/.markdown file under root (minus IGNORE_DIRS).
 * Returns a flat list of { relPath, name, dir, isPost }.
 */
async function walkMarkdown(root, dir = '') {
  const abs = dir ? path.join(root, dir) : root;
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.') && e.isDirectory()) continue;
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      out.push(...(await walkMarkdown(root, path.posix.join(dir, e.name))));
    } else if (/\.(md|markdown)$/i.test(e.name)) {
      const relPath = path.posix.join(dir, e.name);
      out.push({
        relPath,
        name: e.name,
        dir: dir || '.',
        isPost: dir === '_posts' || dir.startsWith('_posts/'),
      });
    }
  }
  return out;
}

// GET /api/files -> flat list of all markdown files in the target
filesRouter.get('/files', async (req, res) => {
  const root = await requireTarget(res);
  if (!root) return;
  const files = await walkMarkdown(root);
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  res.json({ files });
});

// GET /api/files/read?path=relPath -> { frontmatter, body, raw }
filesRouter.get('/files/read', async (req, res) => {
  const root = await requireTarget(res);
  if (!root) return;
  try {
    const abs = safeJoin(root, req.query.path);
    const raw = await fs.readFile(abs, 'utf8');
    const parsed = matter(raw);
    res.json({ frontmatter: parsed.data, body: parsed.content, raw });
  } catch (err) {
    console.error('[JekyllNote] read-failed:', err.message || err);
    res.status(400).json({ error: 'read-failed' });
  }
});

// GET /api/meta/taxonomy -> aggregated tags & categories across all posts (for autocomplete)
filesRouter.get('/meta/taxonomy', async (req, res) => {
  const root = await requireTarget(res);
  if (!root) return;
  const files = await walkMarkdown(root);
  const tags = new Set();
  const categories = new Set();
  for (const f of files) {
    try {
      const raw = await fs.readFile(safeJoin(root, f.relPath), 'utf8');
      const { data } = matter(raw);
      for (const t of toArray(data.tags)) tags.add(String(t));
      for (const c of toArray(data.categories)) categories.add(String(c));
    } catch { /* skip unreadable */ }
  }
  res.json({ tags: [...tags].sort(), categories: [...categories].sort() });
});

function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
