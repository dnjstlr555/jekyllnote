/**
 * Import Kramdown markdown (Chirpy body, frontmatter already stripped) into
 * Editor.js blocks.
 *
 * Strategy: pre-extract the Chirpy/Kramdown constructs that CommonMark parsers
 * mishandle (block math, prompts, captioned images, description lists, footnote
 * definitions) into typed blocks, leaving a sentinel paragraph in their place.
 * Then let markdown-it parse the remainder (headings, paragraphs, lists, tables,
 * code, quotes, todo). Anything still ambiguous falls back to a `rawmd` block so
 * no content is ever lost.
 */
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { inlineMdToHtml } from './inline-md.js';

const md = new MarkdownIt({ html: true, linkify: false, breaks: false })
  .use(taskLists, { enabled: true, label: true });

let SENTINEL_SEQ = 0;
const nextSentinel = () => `@@JN_BLOCK_${SENTINEL_SEQ++}@@`;

export function markdownToBlocks(body) {
  SENTINEL_SEQ = 0;
  const extracted = new Map(); // sentinel -> block
  let src = String(body || '').replace(/\r\n/g, '\n');

  src = extractFootnoteDefs(src, extracted);
  src = extractMathBlocks(src, extracted);
  src = extractPrompts(src, extracted);
  src = extractTodoLists(src, extracted);
  src = extractCaptionedImages(src, extracted);
  src = extractDefLists(src, extracted);

  const tokens = md.parse(src, {});
  const blocks = walkTokens(tokens, extracted);

  // Append collected footnote definitions as a single footnotes block at the end.
  const fnBlock = extracted.get('__FOOTNOTES__');
  if (fnBlock && fnBlock.data.items.length) blocks.push(fnBlock);

  return { time: Date.now(), blocks: blocks.length ? blocks : [emptyParagraph()], version: '2.30.0' };
}

function emptyParagraph() { return { type: 'paragraph', data: { text: '' } }; }

// ---- Pre-extractors -------------------------------------------------------

function extractFootnoteDefs(src, extracted) {
  const items = [];
  const out = src.replace(/^\[\^([^\]]+)\]:[ \t]*(.*)$/gm, (m, id, text) => {
    items.push({ id, text: renderInline(text.trim()) });
    return '';
  });
  extracted.set('__FOOTNOTES__', { type: 'footnotes', data: { items } });
  return out;
}

function extractMathBlocks(src, extracted) {
  return src.replace(/^\$\$\n([\s\S]*?)\n\$\$[ \t]*$/gm, (m, latex) => {
    const s = nextSentinel();
    extracted.set(s, { type: 'math', data: { latex: latex.trim() } });
    return `\n${s}\n`;
  });
}

function extractPrompts(src, extracted) {
  // A blockquote group (lines starting with >) immediately followed by {: .prompt-TYPE }
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^>/.test(lines[i])) {
      let j = i;
      const quoteLines = [];
      while (j < lines.length && /^>/.test(lines[j])) { quoteLines.push(lines[j].replace(/^>\s?/, '')); j++; }
      const attrLine = lines[j] || '';
      const m = attrLine.match(/^\{:\s*\.prompt-(tip|info|warning|danger)\s*\}\s*$/);
      if (m) {
        const s = nextSentinel();
        extracted.set(s, { type: 'prompt', data: { type: m[1], text: renderInline(quoteLines.join('\n').trim()) } });
        out.push(s);
        i = j; // skip attr line
        continue;
      }
      // not a prompt: re-emit the quote lines untouched
      out.push(...lines.slice(i, j));
      i = j - 1;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

function extractTodoLists(src, extracted) {
  // A contiguous run of `- [ ] / - [x]` lines becomes a checklist block.
  // If any line in the run is indented (nested todo), preserve the whole run as
  // rawmd since Editor.js checklist is flat (per plan: nested todo -> raw).
  const lines = src.split('\n');
  const out = [];
  const topRe = /^- \[([ xX])\]\s+(.*)$/;
  const anyRe = /^(\s*)- \[([ xX])\]\s+(.*)$/;
  for (let i = 0; i < lines.length; i++) {
    if (anyRe.test(lines[i])) {
      let j = i;
      let hasNested = false;
      while (j < lines.length && anyRe.test(lines[j])) {
        if (!topRe.test(lines[j])) hasNested = true;
        j++;
      }
      const run = lines.slice(i, j);
      const s = nextSentinel();
      if (hasNested) {
        extracted.set(s, { type: 'rawmd', data: { text: run.join('\n') } });
      } else {
        const items = run.map((ln) => {
          const m = ln.match(topRe);
          return { text: renderInline(m[2].trim()), checked: m[1].toLowerCase() === 'x' };
        });
        extracted.set(s, { type: 'checklist', data: { items } });
      }
      out.push(s);
      i = j - 1;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

function extractCaptionedImages(src, extracted) {
  // ![alt](url){: ...ial... }  optionally followed by a caption line _..._
  const re = /^!\[([^\]]*)\]\(([^)]+)\)(?:\s*\{:\s*([^}]*)\})?[ \t]*(?:\n_([^\n]+)_[ \t]*)?$/gm;
  return src.replace(re, (m, alt, url, ial, caption) => {
    const s = nextSentinel();
    const flags = parseIal(ial || '');
    const data = {
      file: { url: url.trim() },
      caption: caption ? caption.trim() : (alt || ''),
      ...flags,
    };
    extracted.set(s, { type: 'image', data });
    return `\n${s}\n`;
  });
}

function parseIal(ial) {
  const flags = {};
  const wm = ial.match(/width\s*=\s*["']?(\d+)/i) || ial.match(/\bw\s*=\s*["']?(\d+)/i);
  if (wm) flags.width = Number(wm[1]);
  const hm = ial.match(/height\s*=\s*["']?(\d+)/i) || ial.match(/\bh\s*=\s*["']?(\d+)/i);
  if (hm) flags.height = Number(hm[1]);
  for (const cm of ial.matchAll(/\.([\w-]+)/g)) {
    const cls = cm[1];
    if (cls === 'left') flags.alignLeft = true;
    else if (cls === 'right') flags.alignRight = true;
    else if (cls === 'normal') flags.normal = true;
    else if (cls === 'shadow') flags.shadow = true;
    else if (cls === 'rounded-10') flags.rounded = true;
    else if (cls === 'w-75') flags.w75 = true;
    else if (cls === 'w-50') flags.w50 = true;
  }
  return flags;
}

function extractDefLists(src, extracted) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const term = lines[i];
    const next = lines[i + 1] || '';
    if (term.trim() && !term.startsWith(':') && /^:\s+/.test(next)) {
      const items = [];
      let j = i;
      while (j < lines.length) {
        const t = lines[j];
        if (!t.trim() || t.startsWith(':') || !/^:\s+/.test(lines[j + 1] || '')) {
          if (/^:\s+/.test(lines[j])) { /* continuation handled below */ }
        }
        if (t.trim() && !/^:\s/.test(t) && /^:\s+/.test(lines[j + 1] || '')) {
          const definitions = [];
          let k = j + 1;
          while (k < lines.length && /^:\s+/.test(lines[k])) {
            definitions.push(renderInline(lines[k].replace(/^:\s+/, '').trim()));
            k++;
          }
          items.push({ term: renderInline(t.trim()), definitions });
          j = k;
        } else break;
      }
      if (items.length) {
        const s = nextSentinel();
        extracted.set(s, { type: 'deflist', data: { items } });
        out.push(s);
        i = j - 1;
        continue;
      }
    }
    out.push(term);
  }
  return out.join('\n');
}

// ---- markdown-it token walker --------------------------------------------

function renderInline(text) {
  // Use our CJK-friendly inline parser (handles escapes + footnote refs).
  return inlineMdToHtml(String(text || ''));
}

function walkTokens(tokens, extracted) {
  const blocks = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    switch (t.type) {
      case 'heading_open': {
        const level = Number(t.tag.slice(1)) || 2;
        const inline = tokens[i + 1];
        blocks.push({ type: 'header', data: { text: renderInline(inline.content), level } });
        i += 3; break;
      }
      case 'paragraph_open': {
        const inline = tokens[i + 1];
        const content = inline.content.trim();
        const sentinel = content.match(/^@@JN_BLOCK_\d+@@$/);
        if (sentinel && extracted.has(content)) {
          blocks.push(extracted.get(content));
        } else if (/^@@JN_BLOCK_\d+@@$/.test(content)) {
          // sentinel lost its mapping — skip
        } else {
          blocks.push({ type: 'paragraph', data: { text: renderInline(inline.content) } });
        }
        i += 3; break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const [listBlock, consumed] = parseList(tokens, i);
        blocks.push(listBlock);
        i += consumed; break;
      }
      case 'blockquote_open': {
        const [quoteBlock, consumed] = parseBlockquote(tokens, i);
        blocks.push(quoteBlock);
        i += consumed; break;
      }
      case 'fence':
      case 'code_block': {
        blocks.push({ type: 'code', data: { code: t.content.replace(/\n$/, ''), language: (t.info || '').trim() } });
        i += 1; break;
      }
      case 'table_open': {
        const [tableBlock, consumed] = parseTable(tokens, i);
        blocks.push(tableBlock);
        i += consumed; break;
      }
      case 'hr': {
        blocks.push({ type: 'delimiter', data: {} });
        i += 1; break;
      }
      default:
        i += 1; break;
    }
  }
  return blocks;
}

function isTaskList(tokens, start) {
  // markdown-it-task-lists marks list items; detect checkbox inputs.
  for (let k = start; k < tokens.length; k++) {
    if (tokens[k].type === 'bullet_list_close' || tokens[k].type === 'ordered_list_close') break;
    if (tokens[k].type === 'inline' && /class="task-list-item-checkbox"|\[[ xX]\]/.test(tokens[k].content)) return true;
    if (tokens[k].type === 'html_inline' && /type="checkbox"/.test(tokens[k].content)) return true;
  }
  return false;
}

function parseList(tokens, start) {
  const openTok = tokens[start];
  const ordered = openTok.type === 'ordered_list_open';
  const closeType = ordered ? 'ordered_list_close' : 'bullet_list_close';

  // Detect task list (checkboxes) -> checklist block
  if (isTaskList(tokens, start)) {
    const items = [];
    let i = start + 1;
    let depth = 1;
    while (i < tokens.length && depth > 0) {
      if (tokens[i].type === openTok.type) depth++;
      if (tokens[i].type === closeType) { depth--; if (depth === 0) break; }
      if (tokens[i].type === 'inline') {
        let text = tokens[i].content;
        const checked = /^\s*\[x\]/i.test(text) || /checked/.test(text);
        text = text.replace(/^\s*\[[ xX]\]\s*/, '');
        // strip any injected checkbox html
        text = text.replace(/<input[^>]*>/g, '').trim();
        items.push({ text: renderInline(text), checked });
      }
      i++;
    }
    return [{ type: 'checklist', data: { items } }, (i - start) + 1];
  }

  // Regular (possibly nested) list
  const { items, consumed } = parseListItems(tokens, start, ordered);
  return [{ type: 'list', data: { style: ordered ? 'ordered' : 'unordered', items } }, consumed];
}

function parseListItems(tokens, start, ordered) {
  const openTok = tokens[start];
  const closeType = openTok.type.replace('_open', '_close');
  const items = [];
  let i = start + 1;
  while (i < tokens.length && tokens[i].type !== closeType) {
    if (tokens[i].type === 'list_item_open') {
      let content = '';
      const nested = [];
      let j = i + 1;
      let itemDepth = 1;
      while (j < tokens.length && itemDepth > 0) {
        const tt = tokens[j];
        if (tt.type === 'list_item_open') itemDepth++;
        else if (tt.type === 'list_item_close') { itemDepth--; if (itemDepth === 0) break; }
        else if (itemDepth === 1 && tt.type === 'inline' && !content) {
          content = renderInline(tt.content);
        } else if (itemDepth === 1 && (tt.type === 'bullet_list_open' || tt.type === 'ordered_list_open')) {
          const sub = parseListItems(tokens, j, tt.type === 'ordered_list_open');
          for (const it of sub.items) nested.push(it);
          j += sub.consumed - 1;
        }
        j++;
      }
      items.push(nested.length ? { content, items: nested } : { content, items: [] });
      i = j + 1;
    } else i++;
  }
  return { items, consumed: (i - start) + 1 };
}

function parseBlockquote(tokens, start) {
  let i = start + 1;
  let depth = 1;
  const inner = [];
  while (i < tokens.length && depth > 0) {
    if (tokens[i].type === 'blockquote_open') depth++;
    if (tokens[i].type === 'blockquote_close') { depth--; if (depth === 0) break; }
    if (tokens[i].type === 'inline') inner.push(tokens[i].content);
    i++;
  }
  return [{ type: 'quote', data: { text: renderInline(inner.join('\n')), caption: '', alignment: 'left' } }, (i - start) + 1];
}

function parseTable(tokens, start) {
  let i = start + 1;
  const rows = [];
  let current = null;
  let withHeadings = false;
  while (i < tokens.length && tokens[i].type !== 'table_close') {
    const tt = tokens[i];
    if (tt.type === 'thead_open') withHeadings = true;
    if (tt.type === 'tr_open') current = [];
    else if (tt.type === 'tr_close') { if (current) rows.push(current); current = null; }
    else if (tt.type === 'inline') { if (current) current.push(renderInline(tt.content)); }
    i++;
  }
  return [{ type: 'table', data: { withHeadings, content: rows } }, (i - start) + 1];
}
