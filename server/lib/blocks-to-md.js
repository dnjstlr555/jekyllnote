/**
 * Serialize Editor.js block data -> Kramdown markdown (Chirpy flavored).
 *
 * Custom block/tune conventions produced by our front-end:
 *   image.data.chirpy = { classes:[], width, height, caption, align }
 *   prompt.data       = { type:'tip'|'info'|'warning'|'danger', text }
 *   deflist.data      = { items:[{term, definitions:[]}] }
 *   math.data         = { latex }
 *   rawmd.data        = { text }   (verbatim passthrough — the escape hatch)
 *   code.data         = { code, language }
 *
 * Footnote *definitions* are collected from a trailing footnotes block, or from
 * rawmd, and appended at the end.
 */
import { inlineHtmlToMd } from './inline-html.js';

export function blocksToMarkdown(editorData) {
  const blocks = editorData?.blocks || [];
  const parts = [];
  const footnoteDefs = [];

  for (const block of blocks) {
    const md = serializeBlock(block, footnoteDefs);
    if (md != null && md.trim() !== '') parts.push(md); // empty blocks leave no trace
  }

  // No global blank-line collapsing here: each text block is already normalized by
  // tidy(), and a blanket collapse would also rewrite code/raw blocks' own content.
  let body = parts.join('\n\n').trim();

  if (footnoteDefs.length) {
    body += '\n\n' + footnoteDefs.join('\n');
  }
  return body + '\n';
}

/**
 * Normalize the markdown of one text block so editor artifacts never reach the file
 * as blank-looking lines (they render as stray empty paragraphs in Chirpy):
 *  - whitespace-/NBSP-only lines become real blank lines
 *  - a hard-break marker ("  ") is kept only when more text follows on the next line
 *  - leading/trailing blank lines are dropped and repeated ones collapse to one
 */
function tidy(md) {
  const lines = String(md).split('\n').map((l) => (l.trim() === '' ? '' : l));
  for (let i = 0; i < lines.length; i++) {
    const hardBreak = / {2,}$/.test(lines[i]) && lines[i + 1] !== undefined && lines[i + 1] !== '';
    lines[i] = lines[i].replace(/\s+$/, '') + (hardBreak ? '  ' : '');
  }
  const out = [];
  for (const l of lines) {
    if (l === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(l);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

// tidy() for places that must stay on one line (headers, table cells, list text…).
const oneLine = (md) => tidy(md).replace(/\s*\n\s*/g, ' ').trim();

const quoteLines = (text) => text.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');

function serializeBlock(block, footnoteDefs) {
  const d = block.data || {};
  switch (block.type) {
    case 'paragraph':
      return tidy(inlineHtmlToMd(d.text || ''));

    case 'header': {
      const level = Math.min(Math.max(Number(d.level) || 2, 1), 6);
      const text = oneLine(inlineHtmlToMd(d.text || ''));
      return text ? `${'#'.repeat(level)} ${text}` : null;
    }

    case 'list':
      return serializeList(d, 0);

    case 'checklist':
      return (d.items || [])
        .map((it) => ({ checked: it.checked, text: oneLine(inlineHtmlToMd(it.text || '')) }))
        .filter((it) => it.text)
        .map((it) => `- [${it.checked ? 'x' : ' '}] ${it.text}`)
        .join('\n');

    case 'quote': {
      const text = tidy(inlineHtmlToMd(d.text || ''));
      if (!text) return null;
      const cap = oneLine(inlineHtmlToMd(d.caption || ''));
      return quoteLines(text) + (cap ? `\n>\n> — ${cap}` : '');
    }

    case 'prompt': {
      const type = ['tip', 'info', 'warning', 'danger'].includes(d.type) ? d.type : 'tip';
      const text = tidy(inlineHtmlToMd(d.text || ''));
      return text ? `${quoteLines(text)}\n{: .prompt-${type} }` : null;
    }

    case 'code': {
      const lang = d.language ? String(d.language).trim() : '';
      const code = (d.code || '').replace(/\n$/, '');
      return '```' + lang + '\n' + code + '\n```';
    }

    case 'delimiter':
      return '---';

    case 'table':
      return serializeTable(d);

    case 'image':
      return serializeImage(d);

    case 'embed':
      return serializeEmbed(d);

    case 'deflist':
      return (d.items || [])
        .map((it) => {
          const term = oneLine(inlineHtmlToMd(it.term || ''));
          const defs = (it.definitions || []).map((x) => oneLine(inlineHtmlToMd(x))).filter(Boolean);
          return term || defs.length ? [term, ...defs.map((x) => `: ${x}`)].join('\n') : null;
        })
        .filter(Boolean)
        .join('\n\n');

    case 'math':
      return `$$\n${(d.latex || '').trim()}\n$$`;

    case 'footnotes': {
      // { items: [{id, text}] } -> collected, emitted at end
      for (const it of d.items || []) {
        footnoteDefs.push(`[^${it.id}]: ${oneLine(inlineHtmlToMd(it.text || ''))}`);
      }
      return null;
    }

    case 'rawmd':
      return d.text != null ? String(d.text) : null;

    default:
      // Unknown block: preserve text if present, else drop.
      return d.text ? tidy(inlineHtmlToMd(d.text)) : null;
  }
}

function serializeList(d, depth) {
  const ordered = d.style === 'ordered';
  const items = d.items || [];
  const indent = '  '.repeat(depth);
  const lines = [];
  let n = 0; // counts emitted items so numbering has no gaps when empty ones are skipped
  for (const item of items) {
    // @editorjs/list may give string items or {content, items} (nested)
    const content = typeof item === 'string' ? item : (item.content || '');
    const nestedItems = typeof item === 'object' && item.items ? item.items : [];
    // An item is one list entry: a blank line (from 2+ <br>) would end it, so an
    // item's lines are joined with hard breaks instead.
    const text = tidy(inlineHtmlToMd(content)).split('\n').filter((l) => l.trim());
    const nested = nestedItems.length ? serializeList({ style: d.style, items: nestedItems }, depth + 1) : '';
    if (text.length) {
      n += 1;
      const marker = ordered ? `${n}.` : '-';
      const pad = indent + ' '.repeat(marker.length + 1);
      lines.push(text.map((l, k) => (k === 0 ? `${indent}${marker} ` : pad) + l.replace(/\s+$/, '') + (k < text.length - 1 ? '  ' : '')).join('\n'));
    }
    if (nested) lines.push(nested);
  }
  return lines.join('\n');
}

function serializeTable(d) {
  const rows = d.content || [];
  if (!rows.length) return '';
  const withHeadings = d.withHeadings;
  const cell = (c) => oneLine(inlineHtmlToMd(c || '')).replace(/\|/g, '\\|');
  const out = [];
  const headerRow = rows[0].map(cell);
  out.push(`| ${headerRow.join(' | ')} |`);
  out.push(`| ${headerRow.map(() => '---').join(' | ')} |`);
  const bodyRows = withHeadings ? rows.slice(1) : rows.slice(1);
  for (const r of bodyRows) out.push(`| ${r.map(cell).join(' | ')} |`);
  // If no headings, we still emit first row as header (Kramdown tables require one).
  return out.join('\n');
}

function serializeImage(d) {
  const url = d.file?.url || d.url || '';
  const alt = d.caption ? stripTags(d.caption) : (d.alt || '');
  const classes = [];
  // Flat Editor.js action flags -> Chirpy classes
  if (d.alignLeft) classes.push('left');
  if (d.alignRight) classes.push('right');
  if (d.normal) classes.push('normal');
  if (d.shadow || d.withBorder) classes.push('shadow');
  if (d.rounded) classes.push('rounded-10');
  if (d.w75) classes.push('w-75');
  if (d.w50) classes.push('w-50');

  const attrParts = [];
  if (d.width) attrParts.push(`width="${d.width}"`);
  if (d.height) attrParts.push(`height="${d.height}"`);
  const uniqueClasses = [...new Set(classes)].map((c) => `.${c}`);
  const ial = (attrParts.length || uniqueClasses.length)
    ? `{: ${[...attrParts, ...uniqueClasses].join(' ')} }`
    : '';

  let out = `![${alt}](${url})${ial ? ' ' + ial : ''}`;
  if (d.caption) {
    out += `\n_${stripTags(d.caption)}_`;
  }
  return out;
}

function serializeEmbed(d) {
  // Chirpy supports {% include embed/youtube.html id='ID' %}
  const source = d.source || d.embed || '';
  const ytId = extractYouTubeId(source);
  if (ytId) return `{% include embed/youtube.html id='${ytId}' %}`;
  // Fallback: plain link
  return source ? `[${d.caption || source}](${source})` : null;
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').trim();
}
