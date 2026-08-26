// Main orchestration.
window.JN = { draftId: null };

const state = {
  editor: null,
  undo: null,
  fm: null,
  files: [],
  drafts: [],
  openFile: null,   // relPath of the file currently open (null = new post)
  taxonomy: { tags: [], categories: [] },
  currentDraft: null,
  dirty: false,
  loading: false,
  saveTimer: null,
};

const $ = (id) => document.getElementById(id);

init().catch((e) => toast(e.message, 'err'));

const T = (k, p) => window.i18n.t(k, p);

async function init() {
  i18n.applyStatic();
  wireLang();
  await ensureTarget();
  state.taxonomy = await API.taxonomy().catch(() => ({ tags: [], categories: [] }));
  state.fm = new FrontmatterPanel($('frontmatter-panel'), { onChange: markDirty, taxonomy: state.taxonomy });

  wireTopbar();
  wireSidebarTabs();
  await refreshFiles();
  await refreshDrafts();

  // Start on a blank new post (no draft is created until the first edit).
  await newPost();

  // Paste diagnostic (observe only): logs what the clipboard actually contains,
  // so we can tell whether Notion included real image bytes or only refs.
  document.addEventListener('paste', (e) => {
    const cd = e.clipboardData; if (!cd) return;
    const types = [...(cd.types || [])];
    const items = [...(cd.items || [])].map((it) => `${it.kind}:${it.type}`);
    const files = [...(cd.files || [])].map((f) => `${f.name || '(no-name)'} ${f.type} ${f.size}b`);
    console.log('[JekyllNote] paste types:', types.join(', '));
    console.log('[JekyllNote] paste items:', items.join(' | ') || '(none)');
    console.log('[JekyllNote] paste files:', files.join(' | ') || '(none)');
    const html = cd.getData('text/html');
    if (html) {
      const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1].slice(0, 60));
      console.log('[JekyllNote] paste html <img> srcs:', imgs.length ? imgs.join(' | ') : '(none)');
    }
  }, true);
}

// Language toggle: persist choice and reload so editor internals re-localize too.
function wireLang() {
  const b = $('btn-lang');
  b.textContent = i18n.getLang() === 'ko' ? 'EN' : '한국어';
  b.onclick = () => { i18n.setLang(i18n.getLang() === 'ko' ? 'en' : 'ko'); location.reload(); };
}

// ---- Target folder ----
async function ensureTarget() {
  const cfg = await API.getConfig();
  if (cfg.targetRoot) { $('target-path').textContent = cfg.targetRoot; return; }
  $('target-path').textContent = T('target.unset');
  await promptTarget();
}
async function promptTarget() {
  const val = prompt(T('prompt.enterTarget'), '');
  if (!val) return;
  try {
    const r = await API.setTarget(val);
    $('target-path').textContent = r.targetRoot;
    toast(T('toast.workpathSet'), 'ok');
    await refreshFiles();
    state.taxonomy = await API.taxonomy();
    state.fm.setTaxonomy(state.taxonomy);
  } catch (e) { toast(e.message, 'err'); await promptTarget(); }
}

function wireTopbar() {
  $('btn-change-target').onclick = promptTarget;
  $('btn-new').onclick = () => newPost();
  $('btn-save').onclick = () => saveDraft(true);
  $('btn-submit').onclick = () => openSubmitModal();
}

function wireSidebarTabs() {
  document.querySelectorAll('.side-tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('.side-tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      $('panel-files').classList.toggle('hidden', t.dataset.tab !== 'files');
      $('panel-drafts').classList.toggle('hidden', t.dataset.tab !== 'drafts');
    };
  });
  $('file-filter').oninput = renderFileTree;
}

// ---- File tree ----
async function refreshFiles() {
  try { const r = await API.listFiles(); state.files = r.files || []; renderFileTree(); }
  catch (e) { /* no target yet */ }
}
function renderFileTree() {
  const q = ($('file-filter').value || '').toLowerCase();
  const tree = $('file-tree');
  tree.innerHTML = '';

  // Draft indexing: a draft maps to a file iff its targetRelPath is an existing file.
  const fileset = new Set(state.files.map((f) => f.relPath));
  const draftByTarget = new Map();
  for (const d of state.drafts) if (d.targetRelPath) draftByTarget.set(d.targetRelPath, d);

  const groups = {};
  for (const f of state.files) {
    if (q && !f.relPath.toLowerCase().includes(q)) continue;
    (groups[f.dir] = groups[f.dir] || []).push(f);
  }
  const dirs = Object.keys(groups).sort((a, b) => (a === '_posts' ? -1 : b === '_posts' ? 1 : a.localeCompare(b)));
  for (const dir of dirs) {
    const g = document.createElement('div'); g.className = 'tree-group';
    const label = document.createElement('div'); label.className = 'tree-group-label'; label.textContent = dir;
    g.appendChild(label);
    for (const f of groups[dir]) {
      const item = document.createElement('div'); item.className = 'tree-item';
      if (f.relPath === state.openFile) item.classList.add('active');
      const name = document.createElement('span'); name.textContent = f.name; item.appendChild(name);
      if (draftByTarget.has(f.relPath)) {
        const dot = document.createElement('span'); dot.className = 'tree-dot'; dot.title = T('draft.hasDraft');
        item.appendChild(dot);
      }
      item.title = f.relPath;
      item.onclick = () => openFile(f.relPath);
      g.appendChild(item);
    }
    tree.appendChild(g);
  }

  // Fileless drafts (new posts not yet written) below a dashed divider.
  const fileless = state.drafts.filter((d) => !d.targetRelPath || !fileset.has(d.targetRelPath));
  if (fileless.length) {
    const div = document.createElement('div'); div.className = 'tree-divider'; tree.appendChild(div);
    const label = document.createElement('div'); label.className = 'tree-group-label'; label.textContent = T('tree.newDrafts');
    tree.appendChild(label);
    for (const d of fileless) tree.appendChild(fileslessItem(d));
  }
}

function fileslessItem(d) {
  const item = document.createElement('div'); item.className = 'tree-item draft-item';
  if (window.JN.draftId === d.id) item.classList.add('active');
  const left = document.createElement('div'); left.style.overflow = 'hidden';
  left.innerHTML = `<div>${escapeHtml(d.title || T('draft.untitled'))}</div><div class="meta">${escapeHtml(d.date || T('draft.noDate'))}</div>`;
  left.onclick = () => loadDraft(d.id);
  const del = deleteDraftBtn(d.id);
  item.appendChild(left); item.appendChild(del);
  return item;
}

function deleteDraftBtn(id) {
  const del = document.createElement('button'); del.className = 'jn-add'; del.textContent = '🗑';
  del.onclick = async (e) => {
    e.stopPropagation();
    if (!confirm(T('confirm.deleteDraft'))) return;
    await API.deleteDraft(id);
    if (window.JN.draftId === id) { window.JN.draftId = null; state.currentDraft = null; }
    refreshDrafts();
  };
  return del;
}

// ---- Drafts ----
// A draft is created lazily on the first edit (see ensureDraftExists). Its
// targetRelPath decides where it shows: on an existing file (gray dot) or in the
// fileless "Drafts (새 글)" section. The Drafts tab is scoped to the open file.
async function refreshDrafts() {
  try {
    const r = await API.listDrafts();
    state.drafts = r.drafts || [];
  } catch { state.drafts = []; }
  renderFileTree();
  renderDraftsTab();
}

// Drafts tab: only the draft(s) relevant to what is currently open (rule 3).
function renderDraftsTab() {
  const list = $('draft-list'); list.innerHTML = '';
  const cur = state.openFile;
  const items = cur
    ? state.drafts.filter((d) => d.targetRelPath === cur || d.sourceRelPath === cur)
    : state.drafts.filter((d) => d.id === window.JN.draftId);
  if (!items.length) {
    list.innerHTML = `<div class="meta" style="padding:10px">${escapeHtml(T('draft.none'))}</div>`;
    return;
  }
  for (const d of items) {
    const item = document.createElement('div'); item.className = 'tree-item draft-item';
    if (window.JN.draftId === d.id) item.classList.add('active');
    const left = document.createElement('div'); left.style.overflow = 'hidden';
    left.innerHTML = `<div>${escapeHtml(d.title || T('draft.untitled'))}</div><div class="meta">${fmtTime(d.updatedAt)}</div>`;
    left.onclick = () => loadDraft(d.id);
    item.appendChild(left); item.appendChild(deleteDraftBtn(d.id));
    list.appendChild(item);
  }
}

// "+ 새 글": blank slate. No draft is created until the first edit.
async function newPost() {
  state.openFile = null;
  window.JN.draftId = null;
  state.currentDraft = null;
  state.fm.load({}, null);
  await mountEditor({ blocks: [] });
  setSaveStatus(T('status.newPost'));
  renderFileTree(); renderDraftsTab();
}

async function loadDraft(id) {
  const r = await API.getDraft(id);
  const d = r.draft;
  state.currentDraft = d;
  window.JN.draftId = d.id;
  state.openFile = d.sourceRelPath || null;
  state.fm.load(d.frontmatter || {}, d.targetRelPath || d.sourceRelPath);
  if (d.slug) state.fm.slug = d.slug;
  await mountEditor(d.editorData || { blocks: [] });
  setSaveStatus(T('status.draftLoaded'));
  renderFileTree(); renderDraftsTab();
}

async function openFile(relPath) {
  // Answer #2: if a draft targets this file, open that draft instead.
  const existing = state.drafts.find((d) => d.targetRelPath === relPath);
  if (existing) return loadDraft(existing.id);
  try {
    setSaveStatus(T('status.opening'));
    const r = await API.importFile(relPath); // convert only — creates no draft
    state.openFile = relPath;
    window.JN.draftId = null;
    state.currentDraft = null;
    state.fm.load(r.frontmatter || {}, relPath);
    await mountEditor(r.editorData || { blocks: [] });
    setSaveStatus(T('status.opened'));
    renderFileTree(); renderDraftsTab();
  } catch (e) { toast(e.message, 'err'); }
}

// Where this content will be written — single source of truth shared by the
// client's file/draft categorization and the server's submit path.
function computeTarget() {
  if (state.openFile && !state.openFile.startsWith('_posts/')) return state.openFile; // _tabs/*, README, …
  return state.fm.getPostPath(); // new post, or a _posts file (reflects slug/date changes)
}

// Create a draft on demand — on the first edit or first image. Idempotent.
window.ensureDraftExists = async function ensureDraftExists() {
  if (window.JN.draftId) return window.JN.draftId;
  const editorData = state.editor ? await state.editor.save() : { blocks: [] };
  const fm = state.fm.getData();
  const r = await API.createDraft({
    title: fm.title || '', slug: state.fm.getSlug(), editorData, frontmatter: fm,
    sourceRelPath: state.openFile, targetRelPath: computeTarget(),
  });
  window.JN.draftId = r.draft.id;
  state.currentDraft = r.draft;
  return r.draft.id;
};

// ---- Editor lifecycle ----
// Create the editor ONCE and swap content with editor.render() when switching
// files. Destroying/recreating on every open wiped undo history and focus and
// stacked listeners; a single persistent instance fixes all three.
async function mountEditor(data) {
  const clean = data && data.blocks ? data : { blocks: [] };
  state.loading = true;
  if (!state.editor) {
    state.editor = createEditor('editorjs', clean);
    await state.editor.isReady;
    state.editor.on('change', markDirty);
    initMarkdownShortcuts(state.editor, $('editorjs'));
    if (window.Undo) state.undo = new Undo({ editor: state.editor });
  } else {
    await state.editor.render(clean);
  }
  if (state.undo) { try { state.undo.initialize(clean); } catch {} }
  setTimeout(() => { state.loading = false; }, 60); // ignore change events from load
}

async function markDirty() {
  if (state.loading) return; // programmatic load/render, not a real edit
  state.dirty = true;
  setSaveStatus(T('status.editing'));
  try { await window.ensureDraftExists(); } catch (e) { console.error('[JekyllNote] draft create failed:', e.message); }
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveDraft(false), 500); // near-continuous autosave (Google Drive 느낌)
}

async function getEditorData() {
  if (!state.editor) return { blocks: [] };
  const out = await state.editor.save();
  return out;
}

async function saveDraft(explicit) {
  if (explicit) { try { await window.ensureDraftExists(); } catch {} }
  if (!window.JN.draftId) return;
  try {
    const editorData = await getEditorData();
    const frontmatter = state.fm.getData();
    await API.updateDraft(window.JN.draftId, {
      editorData, frontmatter, title: frontmatter.title || '',
      slug: state.fm.getSlug(), targetRelPath: computeTarget(),
    });
    state.dirty = false;
    setSaveStatus(T('status.saved'));
    if (explicit) toast(T('toast.saved'), 'ok');
    refreshDrafts();
  } catch (e) { setSaveStatus(T('status.saveFailed')); if (explicit) toast(e.message, 'err'); }
}

// ---- Submit ----
async function openSubmitModal() {
  try { await window.ensureDraftExists(); } catch (e) { return toast(e.message, 'err'); }
  await saveDraft(false);
  let plan;
  try { plan = (await API.submitPlan(window.JN.draftId)).plan; }
  catch (e) { return toast(e.message, 'err'); }
  renderSubmitModal(plan);
}

function renderSubmitModal(plan) {
  const badImgs = plan.images.filter((i) => i.ok === false);
  const overwrite = plan.exists;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="plan-section-label">${T('submit.fileToWrite')}</div>
    <div class="plan-file">${escapeHtml(plan.targetRelPath)}
      <span class="plan-badge ${overwrite ? 'overwrite' : 'new'}">${overwrite ? T('submit.overwrite') : T('submit.newFile')}</span>
    </div>
    ${plan.images.length ? `<div class="plan-section-label">${escapeHtml(T('submit.images', { n: plan.images.length, dir: plan.assetRelDir }))}</div>` : ''}
    ${plan.images.map((i) => `<div class="plan-file">${escapeHtml(i.toRel)} ${i.ok === false ? `<span class="plan-badge bad">${T('submit.sourceMissing')}</span>` : ''}</div>`).join('')}
    ${(plan.externalImages && plan.externalImages.length) ? `<div class="plan-section-label">${escapeHtml(T('submit.extImages', { n: plan.externalImages.length }))}</div>` : ''}
    ${(plan.externalImages || []).map((i) => `<div class="plan-file">${escapeHtml(i.toRel)} <span class="plan-badge new">↓ ${escapeHtml(i.url.slice(0, 40))}…</span></div>`).join('')}
    <div class="plan-section-label">${T('submit.mdPreview')}</div>
    <div class="md-preview">${escapeHtml(plan.markdown)}</div>
  `;
  const foot = document.createElement('div');
  const cancel = btn(T('btn.cancel'), 'btn', () => closeModal());
  const confirm = btn(overwrite ? T('btn.overwriteSubmit') : T('btn.submit'), 'btn btn-primary', async () => {
    if (badImgs.length && !window.confirm(T('confirm.missingImages'))) return;
    try {
      const r = await API.submitCommit(window.JN.draftId, overwrite);
      // Answer #1: the file is now the source of truth — delete the draft.
      try { await API.deleteDraft(window.JN.draftId); } catch {}
      window.JN.draftId = null;
      state.currentDraft = null;
      state.openFile = r.targetRelPath; // further edits map to the written file
      closeModal();
      toast(T('toast.savedTo', { path: r.targetRelPath }), 'ok');
      await refreshFiles();
      await refreshDrafts();
    } catch (e) { toast(e.message, 'err'); }
  });
  if (overwrite) confirm.classList.add('btn-danger');
  foot.appendChild(cancel); foot.appendChild(confirm);
  showModal(overwrite ? T('modal.overwriteTitle') : T('modal.submitTitle'), body, foot);
}

// ---- Modal / toast helpers ----
function showModal(title, bodyNode, footNode) {
  const root = $('modal-root');
  root.innerHTML = '';
  const back = document.createElement('div'); back.className = 'modal-backdrop';
  back.onclick = (e) => { if (e.target === back) closeModal(); };
  const modal = document.createElement('div'); modal.className = 'modal';
  const head = document.createElement('div'); head.className = 'modal-head'; head.textContent = title;
  const bodyWrap = document.createElement('div'); bodyWrap.className = 'modal-body'; bodyWrap.appendChild(bodyNode);
  const footWrap = document.createElement('div'); footWrap.className = 'modal-foot'; if (footNode) footWrap.appendChild(footNode);
  modal.appendChild(head); modal.appendChild(bodyWrap); modal.appendChild(footWrap);
  back.appendChild(modal); root.appendChild(back);
}
function closeModal() { $('modal-root').innerHTML = ''; }
function btn(label, cls, onclick) { const b = document.createElement('button'); b.className = cls; b.textContent = label; b.onclick = onclick; return b; }
function toast(msg, kind) {
  const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
function setSaveStatus(s) { $('save-status').textContent = s; }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtTime(iso) { try { return new Date(iso).toLocaleString(i18n.locale(), { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
