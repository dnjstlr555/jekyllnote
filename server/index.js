import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDirs, getConfig, DRAFTS_DIR } from './lib/config-store.js';
import { safeJoin } from './lib/safe-path.js';
import { configRouter } from './routes/config.js';
import { filesRouter } from './routes/files.js';
import { draftsRouter } from './routes/drafts.js';
import { imagesRouter } from './routes/images.js';
import { submitRouter } from './routes/submit.js';
import { importRouter } from './routes/import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

async function main() {
  await ensureDirs();
  const cfg = await getConfig();

  const app = express();

  // Serve draft-local images at /draft-assets/:id/:file
  app.get('/draft-assets/:id/:file', (req, res) => {
    const { id, file } = req.params;
    if (!/^[a-zA-Z0-9-]+$/.test(id) || /[\\/]|\.\./.test(file)) {
      return res.status(400).end();
    }
    res.sendFile(path.join(DRAFTS_DIR, id, 'images', file), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  // Serve the target site's /assets read-only, so posts that use root-relative
  // local image paths (/assets/img/...) render in the editor preview. Read-only
  // + safeJoin: never writes, never escapes the target root.
  app.get('/assets/*', async (req, res) => {
    const cfg = await getConfig();
    if (!cfg.targetRoot) return res.status(404).end();
    try {
      res.sendFile(safeJoin(cfg.targetRoot, decodeURIComponent(req.path.replace(/^\/+/, ''))), (err) => {
        if (err && !res.headersSent) res.status(404).end();
      });
    } catch { res.status(404).end(); }
  });

  app.use('/api', configRouter);
  app.use('/api', filesRouter);
  app.use('/api', draftsRouter);
  app.use('/api', imagesRouter);
  app.use('/api', submitRouter);
  app.use('/api', importRouter);

  app.use(express.static(PUBLIC_DIR));

  const port = process.env.PORT || cfg.port || 4173;
  app.listen(port, () => {
    console.log(`\n  JekyllNote running on http://localhost:${port}\n`);
    console.log(`  target: ${cfg.targetRoot || 'Not specified'}\n`);
  });
}

main().catch((err) => {
  console.error('Failed to start JekyllNote:', err);
  process.exit(1);
});
