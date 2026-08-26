// MathJax block ($$ ... $$) with live KaTeX preview.
class MathBlock {
  static get toolbox() {
    return { title: 'Math (블록)', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16M4 12h10M4 20h16"/><path d="M18 9l3 6-3 6" transform="translate(-1 -8)"/></svg>' };
  }
  static get sanitize() { return { latex: false }; }

  constructor({ data }) {
    this.data = { latex: data.latex || '' };
  }

  render() {
    const wrap = document.createElement('div');
    wrap.className = 'jn-math';
    const input = document.createElement('textarea');
    input.className = 'jn-math-input';
    input.value = this.data.latex;
    input.placeholder = '\\sum_{n=1}^\\infty 1/n^2 = \\frac{\\pi^2}{6}';
    const preview = document.createElement('div');
    preview.className = 'jn-math-preview';

    const renderPreview = () => {
      this.data.latex = input.value;
      try {
        if (window.katex) {
          window.katex.render(input.value || '\\,', preview, { displayMode: true, throwOnError: true });
          preview.classList.remove('error');
        }
      } catch (e) {
        preview.classList.add('error');
        preview.textContent = 'LaTeX 오류: ' + e.message;
      }
    };
    input.addEventListener('input', renderPreview);
    wrap.appendChild(input);
    wrap.appendChild(preview);
    setTimeout(renderPreview, 0);
    this._input = input;
    return wrap;
  }

  save() { return { latex: this._input ? this._input.value.trim() : this.data.latex }; }
}
window.MathBlock = MathBlock;
