import express from 'express';
import fs from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { request } from 'undici';
import { getConfig } from '../lib/config-store.js';
import { safeJoin } from '../lib/safe-path.js';
import { readDraft, draftDir } from './drafts.js';
import { blocksToMarkdown } from '../lib/blocks-to-md.js';
import { slugify, dateStampInTZ, postFilename } from '../lib/slug.js';

export const submitRouter = express.Router();

/**
 * Build the full submission plan for a draft WITHOUT writing anything.
 * Returns: { targetRelPath, exists, markdown, images:[{from,toRel}], frontmatter }
 */
async function buildPlan(draft, root) {
  const fm = { ...(draft.frontmatter || {}) };

  // Resolve target path
  let targetRelPath = draft.targetRelPath;
  const stamp = dateStampInTZ(fm.date || new Date(), 'Asia/Seoul');
  const slug = slugify(draft.slug || fm.slug || draft.title || fm.title || 'untitled');
  if (!targetRelPath) {
    targetRelPath = draft.sourceRelPath || path.posix.join('_posts', postFilename(stamp, slug));
  }
  targetRelPath = targetRelPath.replace(/\\/g, '/');

  // Post asset folder name from the final filename (without extension)
  const postBase = path.posix.basename(targetRelPath).replace(/\.(md|markdown)$/i, '');
  const assetRelDir = path.posix.join('assets', 'img', 'posts', postBase);

  // Generate body markdown
  let body = blocksToMarkdown(draft.editorData || { blocks: [] });

  // Files already in the post's asset folder (e.g. from earlier submits). A new image
  // must never take one of these names — the copy would silently overwrite it.
  // Lowercased: Windows/macOS filesystems are case-insensitive.
  const existing = new Set();
  try {
    for (const f of await fs.readdir(safeJoin(root, assetRelDir))) existing.add(f.toLowerCase());
  } catch { /* folder doesn't exist yet */ }
  const taken = new Set(existing);

  // Relocate draft images referenced as /draft-assets/{id}/{file}. Names that don't
  // collide are kept as-is; colliding ones are renumbered (image.png → image-3.png).
  const draftId = draft.id;
  const escId = draftId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const urlRe = new RegExp(`/draft-assets/${escId}/([^)\\s"']+)`, 'g');
  const draftFiles = [...new Set([...body.matchAll(urlRe)].map((m) => decodeURIComponent(m[1])))];
  const finalName = new Map();
  for (const f of draftFiles) {
    if (!existing.has(f.toLowerCase())) { finalName.set(f, f); taken.add(f.toLowerCase()); }
  }
  for (const f of draftFiles) if (!finalName.has(f)) finalName.set(f, freeName(f, taken));

  const images = draftFiles.map((f) => ({
    fromAbs: path.join(draftDir(draftId), 'images', f),
    toRel: path.posix.join(assetRelDir, finalName.get(f)),
    renamedFrom: finalName.get(f) !== f ? f : null,
  }));
  body = body.replace(urlRe, (m, file) => '/' + path.posix.join(assetRelDir, finalName.get(decodeURIComponent(file))));

  // Localize any remaining external http(s) images at submit time (the original
  // spec: external URLs become files on submit). Imported posts keep their remote
  // URLs while editing; here they are downloaded into the post's asset folder.
  const externalImages = [];
  const extSeen = new Map();
  body = body.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (m, alt, url) => {
    let filename = extSeen.get(url);
    if (!filename) {
      const wanted = externalName(url);
      filename = freeName(wanted, taken);
      extSeen.set(url, filename);
      externalImages.push({ url, toRel: path.posix.join(assetRelDir, filename), renamedFrom: filename !== wanted ? wanted : null });
    }
    return `![${alt}](/${path.posix.join(assetRelDir, filename)})`;
  });

  // Auto-enable math frontmatter if math is used
  if (/\$\$[\s\S]*\$\$|(?<!\\)\$[^$\n]+\$/.test(body) && fm.math == null) {
    fm.math = true;
  }

  // Compose full file with frontmatter
  const markdown = matter.stringify('\n' + body.trimStart(), fm);

  // Existence check for overwrite awareness
  let exists = false;
  try { await fs.access(safeJoin(root, targetRelPath)); exists = true; } catch { /* new file */ }

  return { targetRelPath, assetRelDir, exists, markdown, images, externalImages, frontmatter: fm };
}

// File name an external image would like to have (from its URL).
function externalName(url) {
  let base = 'image', ext = '';
  try {
    const bn = path.posix.basename(new URL(url).pathname);
    ext = path.posix.extname(bn);
    base = (bn.slice(0, bn.length - ext.length) || 'image').replace(/[\\/:*?"<>|]/g, '_');
  } catch { /* keep defaults */ }
  return `${base}${ext || '.png'}`;
}

// Reserve `name` in `taken` (lowercased names). If it is already taken, return the
// next free numbered name instead: image.png → image-1.png, image-2.png → image-3.png.
function freeName(name, taken) {
  const ext = path.posix.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let out = name;
  if (taken.has(out.toLowerCase())) {
    const m = stem.match(/^(.*?)-(\d+)$/);
    const base = m ? m[1] : stem;
    let n = m ? Number(m[2]) + 1 : 1;
    while (taken.has(`${base}-${n}${ext}`.toLowerCase())) n += 1;
    out = `${base}-${n}${ext}`;
  }
  taken.add(out.toLowerCase());
  return out;
}

// POST /api/submit/plan { draftId } -> dry-run plan
submitRouter.post('/submit/plan', express.json(), async (req, res) => {
  const cfg = await getConfig();
  if (!cfg.targetRoot) return res.status(409).json({ error: 'no-target' });
  try {
    const draft = await readDraft(req.body.draftId);
    const plan = await buildPlan(draft, cfg.targetRoot);
    // Verify each image source exists
    for (const img of plan.images) {
      try { await fs.access(img.fromAbs); img.ok = true; }
      catch { img.ok = false; }
    }
    res.json({ plan });
  } catch (err) {
    console.error('[JekyllNote] plan-failed:', err.message || err);
    res.status(400).json({ error: 'plan-failed' });
  }
});

// POST /api/submit/commit { draftId, confirmOverwrite } -> actually write
submitRouter.post('/submit/commit', express.json(), async (req, res) => {
  const cfg = await getConfig();
  if (!cfg.targetRoot) return res.status(409).json({ error: 'no-target' });
  const root = cfg.targetRoot;
  try {
    const draft = await readDraft(req.body.draftId);
    const plan = await buildPlan(draft, root);

    // Safety: never silently overwrite. Require explicit confirmation.
    if (plan.exists && !req.body.confirmOverwrite) {
      return res.status(409).json({ error: 'exists', plan });
    }

    const written = [];

    // 1) Copy draft-local images into the target asset folder.
    for (const img of plan.images) {
      const destAbs = safeJoin(root, img.toRel);
      await fs.mkdir(path.dirname(destAbs), { recursive: true });
      try {
        // EXCL: last line of defense — fail rather than overwrite an existing file.
        await fs.copyFile(img.fromAbs, destAbs, FS.COPYFILE_EXCL);
        written.push(img.toRel);
      } catch (e) {
        console.error(`[JekyllNote] image-copy-failed ${img.toRel}: ${e.message}`);
        return res.status(500).json({ error: 'image-copy-failed' });
      }
    }

    // 1b) Download external images into the target asset folder.
    for (const img of plan.externalImages || []) {
      const destAbs = safeJoin(root, img.toRel);
      await fs.mkdir(path.dirname(destAbs), { recursive: true });
      try {
        const resp = await request(img.url, { maxRedirections: 5, headers: { 'user-agent': 'Mozilla/5.0 JekyllNote' } });
        if (resp.statusCode >= 400) throw new Error(`HTTP ${resp.statusCode}`);
        await fs.writeFile(destAbs, Buffer.from(await resp.body.arrayBuffer()), { flag: 'wx' }); // wx: never overwrite
        written.push(img.toRel);
      } catch (e) {
        console.error(`[JekyllNote] external-image-failed ${img.url} → ${img.toRel}: ${e.message}`);
        return res.status(502).json({ error: 'external-image-failed' });
      }
    }

    // 2) Back up existing markdown before overwrite.
    const mdAbs = safeJoin(root, plan.targetRelPath);
    if (plan.exists) {
      const bakDir = path.join(draftDir(draft.id), 'backups');
      await fs.mkdir(bakDir, { recursive: true });
      const bakName = `${path.basename(plan.targetRelPath)}.${Date.now()}.bak`;
      await fs.copyFile(mdAbs, path.join(bakDir, bakName));
    }

    // 3) Write the markdown file.
    await fs.mkdir(path.dirname(mdAbs), { recursive: true });
    await fs.writeFile(mdAbs, plan.markdown, 'utf8');
    written.push(plan.targetRelPath);

    res.json({ ok: true, targetRelPath: plan.targetRelPath, written });
  } catch (err) {
    console.error('[JekyllNote] commit-failed:', err.message || err);
    res.status(500).json({ error: 'commit-failed' });
  }
});
