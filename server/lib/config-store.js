import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// App data lives entirely inside the jekyllnote project, never in the target.
export const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
export const DRAFTS_DIR = path.join(DATA_DIR, 'drafts');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  targetRoot: null, // absolute path to the Jekyll site root (e.g. dnjstlr555.github.io)
  port: 4173,
};

let cache = null;

export async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(DRAFTS_DIR, { recursive: true });
}

export async function getConfig() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    cache = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    cache = { ...DEFAULT_CONFIG };
  }
  return cache;
}

export async function updateConfig(patch) {
  const cfg = await getConfig();
  cache = { ...cfg, ...patch };
  await ensureDirs();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(cache, null, 2), 'utf8');
  return cache;
}

/**
 * Validate that a candidate target root looks like a Jekyll site (has _config.yml).
 * Returns { ok, reason }.
 */
export async function validateTargetRoot(candidate) {
  if (!candidate || !path.isAbsolute(candidate)) {
    return { ok: false, reason: '절대 경로를 입력해 주세요.' };
  }
  try {
    const stat = await fs.stat(candidate);
    if (!stat.isDirectory()) return { ok: false, reason: '폴더가 아닙니다.' };
  } catch {
    return { ok: false, reason: '경로가 존재하지 않습니다.' };
  }
  try {
    await fs.access(path.join(candidate, '_config.yml'));
  } catch {
    return {
      ok: false,
      reason: '_config.yml 이 없습니다. Jekyll 사이트 루트가 맞는지 확인하세요.',
    };
  }
  return { ok: true };
}
