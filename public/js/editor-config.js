// Builds the Editor.js instance with common + custom tools.
// The image uploader targets the *current* draft (window.JN.draftId), so a draft
// must exist before images are added (app.js guarantees this).
window.createEditor = function createEditor(holder, data) {
  // @editorjs/image requires the uploader to resolve to { success:1, file:{ url } }.
  // Our API returns { success:1, url, filename }, so reshape it here (single point).
  const toImg = (r) => ({ success: 1, file: { url: r.url, filename: r.filename } });

  const imageUploader = {
    async uploadByFile(file) {
      try {
        ensureDraft();
        const r = await API.uploadImage(window.JN.draftId, file, 'upload');
        console.log('[JekyllNote] uploadByFile ok:', r.url);
        return toImg(r);
      } catch (e) {
        console.error('[JekyllNote] uploadByFile 실패:', e.message, '| file:', file && file.name, file && file.type, e.data || '');
        window.toast && window.toast('이미지 업로드 실패: ' + e.message, 'err');
        return { success: 0 };
      }
    },
    async uploadByUrl(url) {
      // Decision #1: localize every external URL immediately on insert.
      try {
        ensureDraft();
        // data: URI — decode client-side and upload the bytes (server can't fetch it).
        if (/^data:image\//i.test(url)) {
          const r = await API.uploadImage(window.JN.draftId, dataUrlToFile(url), 'clipboard');
          console.log('[JekyllNote] uploadByUrl(data:) ok ->', r.url);
          return toImg(r);
        }
        // Notion internal refs / blobs whose bytes are NOT in the clipboard.
        if (!/^https?:\/\//i.test(url)) {
          throw new Error(nonHttpHint(url));
        }
        const r = await API.fetchImage(window.JN.draftId, url);
        console.log('[JekyllNote] uploadByUrl ok:', url, '->', r.url);
        return toImg(r);
      } catch (e) {
        console.error('[JekyllNote] uploadByUrl 실패:', e.message, '| url:', url, '| status:', e.status, e.data || '');
        window.toast && window.toast(e.message, 'err');
        return { success: 0 };
      }
    },
  };

  // Build tools defensively: if a CDN global failed to load, skip that one tool
  // rather than letting Editor.js throw and blank the whole editor.
  const candidates = {
    header: G('Header') && { class: Header, inlineToolbar: true, config: { levels: [1, 2, 3, 4], defaultLevel: 2 } },
    list: G('NestedList') && { class: NestedList, inlineToolbar: true, config: { defaultStyle: 'unordered' } },
    checklist: G('Checklist') && { class: Checklist, inlineToolbar: true },
    quote: G('Quote') && { class: Quote, inlineToolbar: true },
    code: G('CodeTool') && { class: CodeTool },
    table: G('Table') && { class: Table, inlineToolbar: true },
    delimiter: G('Delimiter') && { class: Delimiter },
    embed: G('Embed') && { class: Embed, config: { services: { youtube: true } } },
    image: G('ImageTool') && {
      class: ImageTool,
      config: {
        uploader: imageUploader,
        captionPlaceholder: i18n.t('ed.caption'),
        actions: [
          { name: 'alignLeft', icon: 'L', title: i18n.t('img.left'), toggle: true },
          { name: 'alignRight', icon: 'R', title: i18n.t('img.right'), toggle: true },
          { name: 'w75', icon: '75', title: i18n.t('img.w75'), toggle: true },
          { name: 'w50', icon: '50', title: i18n.t('img.w50'), toggle: true },
          { name: 'shadow', icon: '▨', title: i18n.t('img.shadow'), toggle: true },
          { name: 'rounded', icon: '◗', title: i18n.t('img.rounded'), toggle: true },
        ],
      },
    },
    prompt: G('PromptBlock') && { class: PromptBlock, inlineToolbar: true },
    math: G('MathBlock') && { class: MathBlock },
    deflist: G('DefListBlock') && { class: DefListBlock, inlineToolbar: true },
    rawmd: G('RawMdBlock') && { class: RawMdBlock },
    inlineCode: G('InlineCode') && { class: InlineCode },
    underline: G('Underline') && { class: Underline },
    marker: G('Marker') && { class: Marker },
    inlineMath: G('InlineMath') && { class: InlineMath },
  };
  const tools = {};
  for (const [k, v] of Object.entries(candidates)) if (v) tools[k] = v;
  const missing = Object.keys(candidates).filter((k) => !candidates[k]);
  if (missing.length) console.warn('[JekyllNote] 로드되지 않은 툴 건너뜀:', missing.join(', '));

  const editor = new EditorJS({
    holder,
    data: data || { blocks: [] },
    autofocus: true,
    placeholder: i18n.t('ed.placeholder'),
    tools,
  });
  return editor;
};

function G(name) { return typeof window[name] === 'function'; }

// Expose per-level heading entries (/h1../h4) and bulleted/numbered list entries
// in the "+"/"/" menus by redefining each tool's static toolbox as an array.
// Native Editor.js feature — no subclassing, done once at load.
(function expandToolboxes() {
  if (G('Header') && !Header.__jnToolbox) {
    Object.defineProperty(Header, 'toolbox', {
      configurable: true,
      get() {
        return [1, 2, 3, 4].map((level) => ({
          icon: `<b style="font-size:14px">H${level}</b>`,
          title: `H${level}`,
          data: { level },
        }));
      },
    });
    Header.__jnToolbox = true;
  }
  if (G('NestedList') && !NestedList.__jnToolbox) {
    const base = Object.getOwnPropertyDescriptor(NestedList, 'toolbox').get.call(NestedList);
    Object.defineProperty(NestedList, 'toolbox', {
      configurable: true,
      get() {
        return [
          { icon: base.icon, title: 'Bulleted list', data: { style: 'unordered' } },
          { icon: '<b style="font-size:13px">1.</b>', title: 'Numbered list', data: { style: 'ordered' } },
        ];
      },
    });
    NestedList.__jnToolbox = true;
  }
})();

// Markdown-style list start: typing "-", "*", or "1." then Space converts the
// current empty paragraph into a list (like Notion). Attached once per editor.
window.initMarkdownShortcuts = function initMarkdownShortcuts(editor, holderEl) {
  holderEl.addEventListener('keydown', async (e) => {
    if (e.key !== ' ' && e.keyCode !== 32) return;
    let idx;
    try { idx = editor.blocks.getCurrentBlockIndex(); } catch { return; }
    const block = editor.blocks.getBlockByIndex(idx);
    if (!block || block.name !== 'paragraph') return;
    const ce = block.holder && block.holder.querySelector('[contenteditable]');
    const text = ce ? ce.textContent.trim() : '';
    let style = null;
    if (text === '-' || text === '*') style = 'unordered';
    else if (/^\d+\.$/.test(text)) style = 'ordered';
    if (!style) return;
    e.preventDefault();
    try {
      const nb = await editor.blocks.convert(block.id, 'list', { style });
      await editor.blocks.update(nb.id, { style, items: [{ content: '', items: [] }] });
      editor.caret.setToBlock(editor.blocks.getCurrentBlockIndex(), 'start');
    } catch (err) { console.warn('[JekyllNote] list shortcut 실패:', err.message); }
  });
};

function dataUrlToFile(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
  return new File([arr], `pasted.${ext}`, { type: mime });
}

function nonHttpHint(url) {
  return /^attachment:/i.test(url) ? i18n.t('err.notionAttachment') : i18n.t('err.badImageUrl');
}

function ensureDraft() {
  if (!window.JN || !window.JN.draftId) throw new Error(i18n.t('err.noDraft'));
}
