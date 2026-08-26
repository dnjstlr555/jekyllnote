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
    if (md != null) parts.push(md);
  }

  let body = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();

  if (footnoteDefs.length) {
    body += '\n\n' + footnoteDefs.join('\n');
  }
  return body + '\n';
}

function serializeBlock(block, footnoteDefs) {
  const d = block.data || {};
  switch (block.type) {
    case 'paragraph':
      return inlineHtmlToMd(d.text || '');

    case 'header': {
      const level = Math.min(Math.max(Number(d.level) || 2, 1), 6);
      return `${'#'.repeat(level)} ${inlineHtmlToMd(d.text || '')}`;
    }

    case 'list':
      return serializeList(d, 0);

    case 'checklist':
      return (d.items || [])
        .map((it) => `- [${it.checked ? 'x' : ' '}] ${inlineHtmlToMd(it.text || '')}`)
        .join('\n');

    case 'quote': {
      const text = inlineHtmlToMd(d.text || '').split('\n').map((l) => `> ${l}`).join('\n');
      const cap = d.caption ? `\n> \n> — ${inlineHtmlToMd(d.caption)}` : '';
      return text + cap;
    }

    case 'prompt': {
      const type = ['tip', 'info', 'warning', 'danger'].includes(d.type) ? d.type : 'tip';
      const text = inlineHtmlToMd(d.text || '').split('\n').map((l) => `> ${l}`).join('\n');
      return `${text}\n{: .prompt-${type} }`;
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
          const term = inlineHtmlToMd(it.term || '');
          const defs = (it.definitions || []).map((x) => `: ${inlineHtmlToMd(x)}`).join('\n');
          return `${term}\n${defs}`;
        })
        .join('\n\n');

    case 'math':
      return `$$\n${(d.latex || '').trim()}\n$$`;

    case 'footnotes': {
      // { items: [{id, text}] } -> collected, emitted at end
      for (const it of d.items || []) {
        footnoteDefs.push(`[^${it.id}]: ${inlineHtmlToMd(it.text || '')}`);
      }
      return null;
    }

    case 'rawmd':
      return d.text != null ? String(d.text) : null;

    default:
      // Unknown block: preserve text if present, else drop.
      return d.text ? inlineHtmlToMd(d.text) : null;
  }
}

function serializeList(d, depth) {
  const ordered = d.style === 'ordered';
  const items = d.items || [];
  const indent = '  '.repeat(depth);
  const lines = [];
  items.forEach((item, i) => {
    // @editorjs/list may give string items or {content, items} (nested)
    const content = typeof item === 'string' ? item : (item.content || '');
    const marker = ordered ? `${i + 1}.` : '-';
    lines.push(`${indent}${marker} ${inlineHtmlToMd(content)}`);
    const nested = typeof item === 'object' && item.items && item.items.length
      ? serializeList({ style: d.style, items: item.items }, depth + 1)
      : '';
    if (nested) lines.push(nested);
  });
  return lines.join('\n');
}

function serializeTable(d) {
  const rows = d.content || [];
  if (!rows.length) return '';
  const withHeadings = d.withHeadings;
  const cell = (c) => inlineHtmlToMd(c || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
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
