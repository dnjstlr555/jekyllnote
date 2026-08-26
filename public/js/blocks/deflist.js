// Kramdown description list:  term \n : definition
class DefListBlock {
  static get toolbox() {
    return { title: 'Description list', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M8 12h12M8 18h12M4 12h.01M4 18h.01"/></svg>' };
  }
  static get sanitize() { return { items: false }; }

  constructor({ data }) {
    this.data = { items: (data.items && data.items.length) ? data.items : [{ term: '', definitions: [''] }] };
  }

  render() {
    this.wrap = document.createElement('div');
    this.wrap.className = 'jn-deflist';
    this._renderItems();
    return this.wrap;
  }

  _renderItems() {
    this.wrap.innerHTML = '';
    this.data.items.forEach((item, idx) => {
      const box = document.createElement('div');
      box.className = 'jn-def-item';
      const term = document.createElement('div');
      term.className = 'jn-def-term';
      term.contentEditable = 'true';
      term.innerHTML = item.term || '';
      term.dataset.placeholder = window.i18n ? i18n.t('block.term') : 'Term';
      term.addEventListener('input', () => { item.term = term.innerHTML; });
      box.appendChild(term);

      item.definitions.forEach((def, di) => {
        const d = document.createElement('div');
        d.className = 'jn-def-def';
        d.contentEditable = 'true';
        d.innerHTML = def || '';
        d.dataset.placeholder = window.i18n ? i18n.t('block.def') : 'Definition';
        d.addEventListener('input', () => { item.definitions[di] = d.innerHTML; });
        d.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); item.definitions.splice(di + 1, 0, ''); this._renderItems(); }
        });
        box.appendChild(d);
      });
      this.wrap.appendChild(box);
    });
    const add = document.createElement('button');
    add.className = 'jn-add';
    add.textContent = window.i18n ? i18n.t('block.addItem') : '+ Add item';
    add.addEventListener('click', () => { this.data.items.push({ term: '', definitions: [''] }); this._renderItems(); });
    this.wrap.appendChild(add);
  }

  save() {
    // prune empties
    const items = this.data.items
      .map((it) => ({ term: (it.term || '').trim(), definitions: (it.definitions || []).map((d) => (d || '').trim()).filter(Boolean) }))
      .filter((it) => it.term || it.definitions.length);
    return { items };
  }
}
window.DefListBlock = DefListBlock;
