import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { request } from 'undici';
import { draftDir, readDraft } from './drafts.js';

export const imagesRouter = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

const EXT_BY_MIME = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
  'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg',
  'image/avif': '.avif', 'image/bmp': '.bmp',
};

function sanitizeName(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '-');
}

async function ensureImagesDir(draftId) {
  const dir = path.join(draftDir(draftId), 'images');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Pick a non-colliding filename inside dir given a desired base+ext. */
async function uniqueName(dir, base, ext) {
  let existing;
  try { existing = new Set(await fs.readdir(dir)); } catch { existing = new Set(); }
  let candidate = `${base}${ext}`;
  let i = 1;
  while (existing.has(candidate)) {
    candidate = `${base}-${i}${ext}`;
    i += 1;
  }
  return candidate;
}

/** Count existing clipboard-N files to produce the next N. */
async function nextClipboardBase(dir) {
  let files = [];
  try { files = await fs.readdir(dir); } catch { /* empty */ }
  const nums = files
    .map((f) => f.match(/^clipboard-(\d+)\./))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `clipboard-${next}`;
}

function localUrl(draftId, filename) {
  return `/draft-assets/${draftId}/${encodeURIComponent(filename)}`;
}

async function assertDraft(id, res) {
  try { await readDraft(id); return true; }
  catch { res.status(404).json({ error: 'draft-not-found' }); return false; }
}

// POST /api/drafts/:id/images/upload  (multipart: file) -> { url, filename }
// Used for both file uploads and clipboard blobs (kind=clipboard|upload).
imagesRouter.post('/drafts/:id/images/upload', upload.single('file'), async (req, res) => {
  const { id } = req.params;
  if (!(await assertDraft(id, res))) return;
  if (!req.file) return res.status(400).json({ error: 'no-file' });
  try {
    const dir = await ensureImagesDir(id);
    const kind = req.body?.kind === 'clipboard' ? 'clipboard' : 'upload';
    const mimeExt = EXT_BY_MIME[req.file.mimetype] || path.extname(req.file.originalname) || '.png';
    let filename;
    if (kind === 'clipboard') {
      filename = await uniqueName(dir, await nextClipboardBase(dir), mimeExt);
    } else {
      const orig = sanitizeName(req.file.originalname || 'image');
      const ext = path.extname(orig) || mimeExt;
      const base = orig.slice(0, orig.length - path.extname(orig).length) || 'image';
      filename = await uniqueName(dir, base, ext);
    }
    await fs.writeFile(path.join(dir, filename), req.file.buffer);
    res.json({ success: 1, url: localUrl(id, filename), filename });
  } catch (err) {
    console.error('[JekyllNote] image save-failed:', err.message || err);
    res.status(500).json({ error: 'save-failed' });
  }
});

// POST /api/drafts/:id/images/fetch { url } -> download an external URL immediately.
// Per decision #1, ALL external image URLs are downloaded on paste (no deferral).
imagesRouter.post('/drafts/:id/images/fetch', express.json(), async (req, res) => {
  const { id } = req.params;
  if (!(await assertDraft(id, res))) return;
  const src = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(src)) return res.status(400).json({ error: 'bad-url' });
  try {
    const resp = await request(src, {
      maxRedirections: 5,
      headers: { 'user-agent': 'Mozilla/5.0 JekyllNote' },
    });
    if (resp.statusCode >= 400) {
      console.error(`[JekyllNote] image fetch ${resp.statusCode}: ${src}`);
      return res.status(502).json({ error: 'fetch-failed', status: resp.statusCode, url: src });
    }
    const buf = Buffer.from(await resp.body.arrayBuffer());
    const ct = String(resp.headers['content-type'] || '').split(';')[0].trim();
    let ext = EXT_BY_MIME[ct];
    let base;
    try {
      const u = new URL(src);
      const urlBase = sanitizeName(path.basename(u.pathname));
      const urlExt = path.extname(urlBase);
      if (urlExt) { ext = ext || urlExt; base = urlBase.slice(0, urlBase.length - urlExt.length); }
      else { base = urlBase || 'image'; }
    } catch { base = 'image'; }
    ext = ext || '.png';
    base = base || 'image';
    const dir = await ensureImagesDir(id);
    const filename = await uniqueName(dir, base, ext);
    await fs.writeFile(path.join(dir, filename), buf);
    res.json({ success: 1, url: localUrl(id, filename), filename, sourceUrl: src });
  } catch (err) {
    console.error(`[JekyllNote] image fetch error: ${src} -> ${err.message || err}`);
    res.status(502).json({ error: 'fetch-failed', url: src });
  }
});
