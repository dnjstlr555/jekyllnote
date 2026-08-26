// Chirpy Prompt block: blockquote + {: .prompt-TYPE }
class PromptBlock {
  static get toolbox() {
    return { title: 'Prompt', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 8v5M12 16h.01"/></svg>' };
  }
  static get sanitize() { return { text: { br: true, b: {}, i: {}, a: { href: true }, code: {}, mark: {}, u: {} }, type: false }; }

  constructor({ data }) {
    this.data = { type: data.type || 'tip', text: data.text || '' };
  }

  render() {
    const wrap = document.createElement('div');
    wrap.className = 'jn-prompt';
    wrap.dataset.type = this.data.type;

    const head = document.createElement('div');
    head.className = 'jn-prompt-type';
    const sel = document.createElement('select');
    sel.className = 'jn-prompt-select';
    ['tip', 'info', 'warning', 'danger'].forEach((t) => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      if (t === this.data.type) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => { this.data.type = sel.value; wrap.dataset.type = sel.value; });
    head.textContent = '';
    head.appendChild(sel);

    const body = document.createElement('div');
    body.className = 'jn-prompt-text';
    body.contentEditable = 'true';
    body.innerHTML = this.data.text;
    body.dataset.placeholder = window.i18n ? i18n.t('block.promptText') : 'Prompt text…';

    wrap.appendChild(head);
    wrap.appendChild(body);
    this._body = body;
    return wrap;
  }

  save() {
    return { type: this.data.type, text: this._body ? this._body.innerHTML.trim() : this.data.text };
  }
}
window.PromptBlock = PromptBlock;
