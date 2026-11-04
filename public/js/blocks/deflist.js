// Kramdown description list:  term \n : definition
//
// Editing model: Enter in a definition adds another one; Backspace in an EMPTY
// field removes it (a term with no content left removes the whole item); every
// row also has a hover "×". There is always at least one item with one definition.
class DefListBlock {
  static get toolbox() {
    return { title: 'Description list', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M8 12h12M8 18h12M4 12h.01M4 18h.01"/></svg>' };
  }
  static get sanitize() { return { items: false }; }

  constructor({ data, block }) {
    this.block = block;
    this.data = { items: (data.items && data.items.length) ? data.items : [{ term: '', definitions: [''] }] };
  }

  render() {
    this.wrap = document.createElement('div');
    this.wrap.className = 'jn-deflist';
    this._renderItems();
    return this.wrap;
  }

  // Structural edits (add/remove rows) tell Editor.js explicitly, for autosave/undo.
  _changed() { this.block && this.block.dispatchChange(); }

  // Remove definition `di` of item `ii`; returns where the caret should go next.
  _removeDef(ii, di) {
    const item = this.data.items[ii];
    if (item.definitions.length > 1) {
      item.definitions.splice(di, 1);
      return { item: ii, def: Math.max(di - 1, 0) };
    }
    return this._removeItem(ii); // it was the item's last definition
  }

  _removeItem(ii) {
    if (this.data.items.length > 1) {
      this.data.items.splice(ii, 1);
      const p = Math.max(ii - 1, 0);
      return { item: p, def: this.data.items[p].definitions.length - 1 };
    }
    this.data.items[0] = { term: '', definitions: [''] }; // keep one empty entry
    return { item: 0, term: true };
  }

  _apply(focus) { this._renderItems(focus); this._changed(); }

  _isBlank(html) { return !String(html || '').replace(/<[^>]*>|&nbsp;/g, '').trim(); }

  // One editable row: contenteditable field + a hover "×" button.
  _row(cls, html, placeholder, { onInput, onKeydown, onRemove }) {
    const row = document.createElement('div');
    row.className = 'jn-def-row';
    const field = document.createElement('div');
    field.className = cls;
    field.contentEditable = 'true';
    field.innerHTML = html || '';
    field.dataset.placeholder = placeholder;
    field.addEventListener('input', () => onInput(field.innerHTML));
    field.addEventListener('keydown', (e) => onKeydown(e, field));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'jn-del';
    del.textContent = '×';
    del.title = window.i18n ? i18n.t('block.remove') : 'Remove';
    del.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus; avoid blur before click
    del.addEventListener('click', onRemove);
    row.appendChild(field);
    row.appendChild(del);
    return row;
  }

  _renderItems(focus) {
    const t = (k, fb) => (window.i18n ? i18n.t(k) : fb);
    this.wrap.innerHTML = '';
    this.data.items.forEach((item, ii) => {
      const box = document.createElement('div');
      box.className = 'jn-def-item';

      box.appendChild(this._row('jn-def-term', item.term, t('block.term', 'Term'), {
        onInput: (html) => { item.term = html; },
        onRemove: () => this._apply(this._removeItem(ii)),
        onKeydown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            this._focus({ item: ii, def: 0 });
          } else if (e.key === 'Backspace' && this._isBlank(item.term) && item.definitions.every((d) => this._isBlank(d))) {
            // Nothing left in this item. If it is the only one, let Editor.js handle
            // Backspace so an empty block can be deleted as a whole.
            if (this.data.items.length === 1) return;
            e.preventDefault(); e.stopPropagation();
            this._apply(this._removeItem(ii));
          }
        },
      }));

      item.definitions.forEach((def, di) => {
        box.appendChild(this._row('jn-def-def', def, t('block.def', 'Definition'), {
          onInput: (html) => { item.definitions[di] = html; },
          onRemove: () => this._apply(this._removeDef(ii, di)),
          onKeydown: (e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); e.stopPropagation();
              item.definitions.splice(di + 1, 0, '');
              this._apply({ item: ii, def: di + 1 });
            } else if (e.key === 'Backspace' && this._isBlank(item.definitions[di])) {
              const onlyEmptyEntry = this.data.items.length === 1 && item.definitions.length === 1 && this._isBlank(item.term);
              if (onlyEmptyEntry) return; // let Editor.js delete the empty block
              e.preventDefault(); e.stopPropagation();
              this._apply(this._removeDef(ii, di));
            }
          },
        }));
      });
      this.wrap.appendChild(box);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'jn-add';
    add.textContent = t('block.addItem', '+ Add item');
    add.addEventListener('click', () => {
      this.data.items.push({ term: '', definitions: [''] });
      this._apply({ item: this.data.items.length - 1, term: true });
    });
    this.wrap.appendChild(add);

    this._focus(focus);
  }

  // Put the caret at the end of {item, term:true} or {item, def}.
  _focus(spec) {
    if (!spec) return;
    const box = this.wrap.querySelectorAll('.jn-def-item')[spec.item];
    const target = box && (spec.term ? box.querySelector('.jn-def-term') : box.querySelectorAll('.jn-def-def')[spec.def]);
    if (!target) return;
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
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
