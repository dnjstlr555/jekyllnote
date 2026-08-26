/**
 * Convert Editor.js inline HTML <-> Kramdown inline markdown.
 *
 * Editor.js stores inline formatting as HTML strings. We support the tags the
 * configured inline tools emit:
 *   <b>/<strong>, <i>/<em>, <u>, <s>/<del>, <code>, <a href>, <mark>
 *   custom: <span data-inline-math="…"> (inline math), <sup data-footnote="id">
 *
 * The HTML parser here is intentionally small: inline content only, no block
 * elements, tolerant of unknown tags (their text is kept, tag dropped).
 */

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ',
};

export function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code] ?? m;
  });
}

export function encodeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Escape markdown-significant characters in plain text runs.
function escapeMd(s) {
  return s.replace(/([\\`*_{}\[\]()#+\-!])/g, (m, ch, off, str) => {
    // don't over-escape hyphens/plus/hash inside words; only escape when risky at run level
    return '\\' + ch;
  });
}

// Escape markdown-significant characters in plain text runs so literal glyphs
// (e.g. the author's `*` / `**` reference markers, or a stray `[`) never get
// reinterpreted as formatting. Real formatting arrives as HTML tags, not text,
// so escaping here is always safe.
function escapeInlineText(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/([`*_\[\]])/g, '\\$1');
}

/**
 * Tokenize a limited inline-HTML string into a flat token stream.
 * Tokens: {type:'text', value} | {type:'open'|'close'|'void', tag, attrs}
 */
function tokenize(html) {
  const tokens = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m.index > last) {
      tokens.push({ type: 'text', value: html.slice(last, m.index) });
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = parseAttrs(m[3] || '');
    const selfClose = m[4] === '/';
    tokens.push({ type: closing ? 'close' : (selfClose ? 'void' : 'open'), tag, attrs });
    last = re.lastIndex;
  }
  if (last < html.length) tokens.push({ type: 'text', value: html.slice(last) });
  return tokens;
}

function parseAttrs(str) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(str))) {
    const name = m[1].toLowerCase();
    const val = m[3] ?? m[4] ?? m[5] ?? '';
    attrs[name] = decodeEntities(val);
  }
  return attrs;
}

/**
 * Convert an inline-HTML string to Kramdown inline markdown.
 */
export function inlineHtmlToMd(html) {
  if (!html) return '';
  const tokens = tokenize(html);
  let out = '';
  const stack = [];
  let suppress = 0; // >0 means inner text is swallowed (math/footnote marker content)

  for (const tok of tokens) {
    if (tok.type === 'text') {
      if (suppress === 0) out += escapeInlineText(decodeEntities(tok.value));
      continue;
    }
    if (tok.type === 'open' || tok.type === 'void') {
      let frame = { close: 'noop', suppress: false };
      switch (tok.tag) {
        case 'b': case 'strong': if (!suppress) out += '**'; frame = { close: 'lit', text: '**' }; break;
        case 'i': case 'em': if (!suppress) out += '*'; frame = { close: 'lit', text: '*' }; break;
        case 'u': if (!suppress) out += '<u>'; frame = { close: 'lit', text: '</u>' }; break; // raw HTML passthrough
        case 's': case 'del': case 'strike': if (!suppress) out += '~~'; frame = { close: 'lit', text: '~~' }; break;
        case 'code': if (!suppress) out += '`'; frame = { close: 'lit', text: '`' }; break;
        case 'mark': if (!suppress) out += '<mark>'; frame = { close: 'lit', text: '</mark>' }; break;
        case 'a': if (!suppress) out += '['; frame = { close: 'a', href: tok.attrs.href || '' }; break;
        case 'br': if (!suppress) out += '  \n'; frame = { close: 'noop' }; break;
        case 'sup':
          if (tok.attrs['data-footnote']) {
            if (!suppress) out += `[^${tok.attrs['data-footnote']}]`;
            frame = { close: 'swallow', suppress: true };
          }
          break;
        case 'span':
          if ('data-inline-math' in tok.attrs) {
            if (!suppress) out += `$${tok.attrs['data-inline-math']}$`;
            frame = { close: 'swallow', suppress: true };
          }
          break;
        default: frame = { close: 'noop' }; break;
      }
      if (frame.suppress) suppress += 1;
      if (tok.type === 'void') { if (frame.suppress) suppress -= 1; }
      else stack.push(frame);
      continue;
    }
    if (tok.type === 'close') {
      const top = stack.pop() || { close: 'noop' };
      if (top.suppress) suppress = Math.max(0, suppress - 1);
      if (suppress > 0) continue;
      if (top.close === 'lit') out += top.text;
      else if (top.close === 'a') out += `](${top.href})`;
      // swallow / noop -> nothing
    }
  }
  return out;
}
