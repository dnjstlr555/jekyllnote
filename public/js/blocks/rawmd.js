// Raw markdown escape hatch: verbatim passthrough (used by the importer for
// constructs the rich blocks can't represent, and available manually).
class RawMdBlock {
  static get toolbox() {
    return { title: 'Raw markdown', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16"/></svg>' };
  }
  static get sanitize() { return { text: false }; }

  constructor({ data }) { this.data = { text: data.text || '' }; }

  render() {
    const wrap = document.createElement('div');
    wrap.className = 'jn-rawmd';
    const label = document.createElement('div');
    label.className = 'jn-rawmd-label';
    label.textContent = window.i18n ? i18n.t('block.rawWarn') : '⚠ Raw markdown (emitted as-is)';
    const ta = document.createElement('textarea');
    ta.value = this.data.text;
    ta.spellcheck = false;
    ta.addEventListener('input', () => { this.data.text = ta.value; });
    wrap.appendChild(label);
    wrap.appendChild(ta);
    this._ta = ta;
    return wrap;
  }

  save() { return { text: this._ta ? this._ta.value : this.data.text }; }
}
window.RawMdBlock = RawMdBlock;
