// Frontmatter panel: structured fields (title/description/date/categories/tags)
// + advanced (raw YAML, math/pin/mermaid). Emits changes via onChange.
window.FrontmatterPanel = class FrontmatterPanel {
  constructor(root, { onChange, taxonomy }) {
    this.root = root;
    this.onChange = onChange || (() => {});
    this.taxonomy = taxonomy || { tags: [], categories: [] };
    this.data = {};
    this.slug = '';
    this.showRaw = false;
  }

  setTaxonomy(tax) { this.taxonomy = tax; }

  // Load frontmatter object + optional filename to derive slug/date.
  load(frontmatter, targetRelPath) {
    this.data = { ...frontmatter };
    if (!Array.isArray(this.data.categories)) this.data.categories = this.data.categories ? [this.data.categories] : [];
    if (!Array.isArray(this.data.tags)) this.data.tags = this.data.tags ? [this.data.tags] : [];
    this.slug = ''; // reset; re-derived from the filename below (empty for new posts)
    if (targetRelPath) {
      const base = targetRelPath.split('/').pop().replace(/\.(md|markdown)$/i, '');
      const m = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
      if (m) { this.slug = m[2]; if (!this.data.date) this.data.date = m[1]; }
      else this.slug = base;
    }
    this.render();
  }

  getData() { return this.data; }
  getSlug() { return this.slug; }

  // The _posts filename this content would produce (date + slug). Used to decide
  // whether a draft maps to an existing file (dot) or a new one (fileless).
  getPostPath() {
    const stamp = (this.data.date && String(this.data.date).slice(0, 10)) || todayStamp();
    return `_posts/${stamp}-${slugify(this.slug || this.data.title || 'untitled')}.md`;
  }

  _emit() { this.onChange(); }

  render() {
    const d = this.data;
    this.root.innerHTML = '';
    const wrap = el('div', 'fm');

    // header: filename preview + raw toggle
    const header = el('div', 'fm-header');
    const stamp = (d.date && String(d.date).slice(0, 10)) || todayStamp();
    const fname = el('span', 'fname');
    fname.textContent = `_posts/${stamp}-${slugify(this.slug || d.title || 'untitled')}.md`;
    this._fname = fname;
    header.appendChild(labeledInline(i18n.t('fm.filename'), fname));
    const toggle = el('button', 'btn btn-ghost fm-toggle');
    toggle.textContent = this.showRaw ? i18n.t('fm.structured') : i18n.t('fm.rawYaml');
    toggle.onclick = () => { this._syncBeforeToggle(); this.showRaw = !this.showRaw; this.render(); };
    header.appendChild(toggle);
    wrap.appendChild(header);

    if (this.showRaw) {
      wrap.appendChild(this._renderRaw());
      this.root.appendChild(wrap);
      return;
    }

    // Title
    const titleRow = el('div', 'fm-row');
    const titleField = field('title', 'grow');
    const titleInput = input(d.title || '', 'fm-title-input');
    titleInput.placeholder = i18n.t('ph.title');
    titleInput.oninput = () => { d.title = titleInput.value; this._updateFname(); this._emit(); };
    titleField.appendChild(titleInput);
    titleRow.appendChild(titleField);
    wrap.appendChild(titleRow);

    // slug + date
    const row2 = el('div', 'fm-row');
    const slugField = field('url suffix', 'grow');
    const slugInput = input(this.slug || '');
    slugInput.placeholder = i18n.t('ph.slug');
    slugInput.oninput = () => { this.slug = slugInput.value; this._updateFname(); this._emit(); };
    slugField.appendChild(slugInput);
    row2.appendChild(slugField);

    const dateField = field('date');
    const dateInput = input(d.date ? String(d.date) : todayStamp());
    dateInput.style.width = '210px';
    dateInput.oninput = () => { d.date = dateInput.value; this._updateFname(); this._emit(); };
    dateField.appendChild(dateInput);
    row2.appendChild(dateField);
    wrap.appendChild(row2);

    // description
    const descRow = el('div', 'fm-row');
    const descField = field('description', 'grow');
    const descTa = document.createElement('textarea');
    descTa.value = d.description || '';
    descTa.placeholder = i18n.t('ph.desc');
    descTa.oninput = () => { d.description = descTa.value; this._emit(); };
    descField.appendChild(descTa);
    descRow.appendChild(descField);
    wrap.appendChild(descRow);

    // categories + tags
    const row3 = el('div', 'fm-row');
    row3.appendChild(this._chipsField('categories', d.categories, this.taxonomy.categories));
    row3.appendChild(this._chipsField('tags', d.tags, this.taxonomy.tags));
    wrap.appendChild(row3);

    // advanced checks
    const adv = el('div', 'fm-advanced');
    const checks = el('div', 'fm-checks');
    checks.appendChild(this._check('math', d.math));
    checks.appendChild(this._check('mermaid', d.mermaid));
    checks.appendChild(this._check('pin', d.pin));
    adv.appendChild(checks);
    wrap.appendChild(adv);

    this.root.appendChild(wrap);
  }

  _renderRaw() {
    const field = el('div', 'fm-field grow');
    const label = el('label'); label.textContent = i18n.t('fm.rawLabel');
    const ta = document.createElement('textarea');
    ta.className = 'raw-yaml';
    try { ta.value = jsyaml.dump(this.data, { lineWidth: -1 }); } catch { ta.value = ''; }
    ta.oninput = () => {
      try {
        const parsed = jsyaml.load(ta.value) || {};
        this.data = parsed;
        if (!Array.isArray(this.data.categories)) this.data.categories = this.data.categories ? [this.data.categories] : [];
        if (!Array.isArray(this.data.tags)) this.data.tags = this.data.tags ? [this.data.tags] : [];
        ta.style.borderColor = '';
        this._emit();
      } catch (e) { ta.style.borderColor = 'var(--danger)'; }
    };
    field.appendChild(label); field.appendChild(ta);
    this._rawTa = ta;
    return field;
  }

  _syncBeforeToggle() { /* structured data is the source of truth; nothing to do */ }

  _updateFname() {
    if (!this._fname) return;
    const stamp = (this.data.date && String(this.data.date).slice(0, 10)) || todayStamp();
    this._fname.textContent = `_posts/${stamp}-${slugify(this.slug || this.data.title || 'untitled')}.md`;
  }

  _check(key, val) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!val;
    cb.onchange = () => { this.data[key] = cb.checked; this._emit(); };
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + key));
    return label;
  }

  _chipsField(key, values, suggestions) {
    const f = field(key, 'grow');
    const wrapC = el('div', 'chips-wrap');
    const chips = el('div', 'chips');
    const renderChips = () => {
      chips.querySelectorAll('.chip').forEach((c) => c.remove());
      values.forEach((v, i) => {
        const chip = el('span', 'chip');
        chip.textContent = v;
        const x = document.createElement('button'); x.textContent = '×';
        x.onclick = () => { values.splice(i, 1); renderChips(); this._emit(); };
        chip.appendChild(x);
        chips.insertBefore(chip, inp);
      });
    };
    const inp = document.createElement('input');
    inp.placeholder = i18n.t('ph.chip');
    const ac = el('div', 'autocomplete'); ac.style.display = 'none';
    let selIdx = -1;

    const closeAc = () => { ac.style.display = 'none'; ac.innerHTML = ''; selIdx = -1; };
    const showAc = () => {
      const q = inp.value.trim().toLowerCase();
      const matches = (suggestions || []).filter((s) => s.toLowerCase().includes(q) && !values.includes(s)).slice(0, 8);
      ac.innerHTML = '';
      if (!matches.length || !q) { closeAc(); return; }
      matches.forEach((mn) => {
        const item = document.createElement('div'); item.textContent = mn;
        item.onmousedown = (e) => { e.preventDefault(); addVal(mn); };
        ac.appendChild(item);
      });
      ac.style.display = 'block';
    };
    const addVal = (v) => { v = v.trim(); if (v && !values.includes(v)) { values.push(v); renderChips(); this._emit(); } inp.value = ''; closeAc(); };
    inp.oninput = showAc;
    inp.onkeydown = (e) => {
      const items = [...ac.querySelectorAll('div')];
      if (e.key === 'Enter') { e.preventDefault(); if (selIdx >= 0 && items[selIdx]) addVal(items[selIdx].textContent); else addVal(inp.value); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); selIdx = Math.min(selIdx + 1, items.length - 1); items.forEach((it, i) => it.classList.toggle('sel', i === selIdx)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selIdx = Math.max(selIdx - 1, 0); items.forEach((it, i) => it.classList.toggle('sel', i === selIdx)); }
      else if (e.key === 'Backspace' && !inp.value && values.length) { values.pop(); renderChips(); this._emit(); }
      else if (e.key === 'Escape') closeAc();
    };
    inp.onblur = () => setTimeout(closeAc, 150);
    chips.appendChild(inp);
    renderChips();
    wrapC.appendChild(chips); wrapC.appendChild(ac);
    f.appendChild(wrapC);
    return f;
  }
};

// --- small DOM helpers ---
function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function field(labelText, extra) { const f = el('div', 'fm-field ' + (extra || '')); const l = el('label'); l.textContent = labelText; f.appendChild(l); return f; }
function input(val, cls) { const i = document.createElement('input'); i.value = val || ''; if (cls) i.className = cls; return i; }
function labeledInline(label, node) { const s = el('span'); s.appendChild(node); return s; }
function todayStamp() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function slugify(s) {
  return String(s || '').trim().toLowerCase().replace(/['"]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'untitled';
}
