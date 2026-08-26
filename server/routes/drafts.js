import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DRAFTS_DIR } from '../lib/config-store.js';

export const draftsRouter = express.Router();

/**
 * A draft is a self-contained folder under data/drafts/{id}/:
 *   draft.json   -> { id, title, editorData, frontmatter, targetRelPath, sourceRelPath, updatedAt }
 *   images/      -> localized image files (clipboard-N.png, uploaded originals, downloaded URLs)
 *
 * The draft is the canonical editing format (Editor.js JSON). Markdown is only
 * generated at submit time. Nothing here ever touches the target folder.
 */

function draftDir(id) {
  return path.join(DRAFTS_DIR, id);
}

async function readDraft(id) {
  const raw = await fs.readFile(path.join(draftDir(id), 'draft.json'), 'utf8');
  return JSON.parse(raw);
}

async function writeDraft(draft) {
  const dir = draftDir(draft.id);
  await fs.mkdir(path.join(dir, 'images'), { recursive: true });
  draft.updatedAt = new Date().toISOString();
  await fs.writeFile(path.join(dir, 'draft.json'), JSON.stringify(draft, null, 2), 'utf8');
  return draft;
}

// GET /api/drafts -> list
draftsRouter.get('/drafts', async (req, res) => {
  let ids = [];
  try {
    ids = await fs.readdir(DRAFTS_DIR);
  } catch { /* none yet */ }
  const drafts = [];
  for (const id of ids) {
    try {
      const d = await readDraft(id);
      drafts.push({
        id: d.id,
        title: d.title || '(제목 없음)',
        date: (d.frontmatter && d.frontmatter.date) ? String(d.frontmatter.date).slice(0, 10) : null,
        targetRelPath: d.targetRelPath || null,
        sourceRelPath: d.sourceRelPath || null,
        updatedAt: d.updatedAt,
      });
    } catch { /* skip malformed */ }
  }
  drafts.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  res.json({ drafts });
});

// POST /api/drafts { title?, editorData?, frontmatter?, sourceRelPath? } -> create
draftsRouter.post('/drafts', express.json({ limit: '25mb' }), async (req, res) => {
  const id = crypto.randomUUID();
  const draft = {
    id,
    title: req.body?.title || '',
    slug: req.body?.slug || null,
    editorData: req.body?.editorData || { blocks: [] },
    frontmatter: req.body?.frontmatter || {},
    sourceRelPath: req.body?.sourceRelPath || null, // set when imported from an existing file
    targetRelPath: req.body?.targetRelPath || null, // where submit will write
    createdAt: new Date().toISOString(),
  };
  await writeDraft(draft);
  res.json({ draft });
});

// GET /api/drafts/:id -> full draft
draftsRouter.get('/drafts/:id', async (req, res) => {
  try {
    res.json({ draft: await readDraft(req.params.id) });
  } catch {
    res.status(404).json({ error: 'not-found' });
  }
});

// PUT /api/drafts/:id -> update fields
draftsRouter.put('/drafts/:id', express.json({ limit: '25mb' }), async (req, res) => {
  try {
    const draft = await readDraft(req.params.id);
    for (const k of ['title', 'slug', 'editorData', 'frontmatter', 'targetRelPath', 'sourceRelPath']) {
      if (k in req.body) draft[k] = req.body[k];
    }
    await writeDraft(draft);
    res.json({ draft });
  } catch {
    res.status(404).json({ error: 'not-found' });
  }
});

// DELETE /api/drafts/:id -> remove the draft folder (app-local only, safe)
draftsRouter.delete('/drafts/:id', async (req, res) => {
  const id = req.params.id;
  // guard: id must be a plain uuid-ish token, never a path
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return res.status(400).json({ error: 'bad-id' });
  try {
    await fs.rm(draftDir(id), { recursive: true, force: true });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'not-found' });
  }
});

export { readDraft, writeDraft, draftDir };
