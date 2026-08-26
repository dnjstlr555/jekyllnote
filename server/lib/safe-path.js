import path from 'node:path';

/**
 * Resolve a user-supplied relative path against a trusted root, guaranteeing the
 * result stays inside the root. Throws on any traversal attempt.
 *
 * This is the single choke point that protects the git-tracked target folder:
 * every read/write in the app must resolve its path through here.
 *
 * @param {string} root  absolute, already-trusted base directory
 * @param {string} rel   relative path from the client (may contain / or \)
 * @returns {string} absolute path guaranteed to be within root
 */
export function safeJoin(root, rel) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new Error(`safeJoin: root must be an absolute path (got: ${root})`);
  }
  const cleanRel = String(rel ?? '').replace(/\\/g, '/');
  // Reject absolute paths and Windows drive-letter paths outright.
  if (path.isAbsolute(cleanRel) || /^[a-zA-Z]:/.test(cleanRel)) {
    throw new Error(`safeJoin: absolute paths are not allowed (got: ${rel})`);
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, cleanRel);
  const rootWithSep = resolvedRoot.endsWith(path.sep)
    ? resolvedRoot
    : resolvedRoot + path.sep;
  if (target !== resolvedRoot && !target.startsWith(rootWithSep)) {
    throw new Error(`safeJoin: path escapes root (rel: ${rel})`);
  }
  return target;
}

/**
 * Return true if `child` is inside (or equal to) `parent`. Both must be absolute.
 */
export function isInside(parent, child) {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  const pSep = p.endsWith(path.sep) ? p : p + path.sep;
  return c === p || c.startsWith(pSep);
}
