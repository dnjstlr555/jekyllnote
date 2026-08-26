// Inline math tool: wraps selection in <span data-inline-math="…">.
// Stores the LaTeX in the attribute; displays a KaTeX-rendered span.
class InlineMath {
  static get isInline() { return true; }
  static get title() { return 'Inline math'; }
  static get sanitize() { return { span: { 'data-inline-math': true, class: true } }; }

  constructor() {
    this.button = null;
    this.tag = 'SPAN';
  }

  render() {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.innerHTML = '$x$';
    this.button.classList.add('ce-inline-tool');
    return this.button;
  }

  surround(range) {
    if (!range) return;
    const selectedText = range.toString();
    const latex = prompt(window.i18n ? i18n.t('block.inlineMath') : 'Enter inline LaTeX:', selectedText || '');
    if (latex == null) return;
    const span = document.createElement('span');
    span.setAttribute('data-inline-math', latex);
    try {
      if (window.katex) window.katex.render(latex || '\\,', span, { throwOnError: false });
      else span.textContent = `$${latex}$`;
    } catch { span.textContent = `$${latex}$`; }
    range.deleteContents();
    range.insertNode(span);
  }

  checkState() { return false; }
}
window.InlineMath = InlineMath;
