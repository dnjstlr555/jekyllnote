// Regression tests for editor-origin artifacts in the markdown serializer.
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { blocksToMarkdown } from '../server/lib/blocks-to-md.js';

const P = (text) => ({ type: 'paragraph', data: { text } });
const md = (...blocks) => blocksToMarkdown({ blocks });
const list = (...items) => ({ type: 'list', data: { style: 'unordered', items: items.map((content) => ({ content, items: [] })) } });

test('Shift+Enter becomes a hard break', () => {
  assert.equal(md(P('a<br>b')), 'a  \nb\n');
});

test('trailing <br> leaves no trailing spaces', () => {
  assert.equal(md(P('hello<br>'), P('next')), 'hello\n\nnext\n');
});

test('2+ <br> become a paragraph break, never a whitespace-only line', () => {
  assert.equal(md(P('a<br><br>b')), 'a\n\nb\n');
});

test('NBSP-only and empty paragraphs are dropped', () => {
  assert.equal(md(P('a'), P('&nbsp;'), P(''), P('b')), 'a\n\nb\n');
});

test('prompt: trailing <br> does not add an empty "> " line', () => {
  assert.equal(md({ type: 'prompt', data: { type: 'tip', text: 'note<br>' } }), '> note\n{: .prompt-tip }\n');
});

test('list items: trailing <br> and empty items do not break the list', () => {
  assert.equal(md(list('x<br>', '', 'y')), '- x\n- y\n');
});

test('ordered list numbering has no gaps when empty items are skipped', () => {
  const ol = { type: 'list', data: { style: 'ordered', items: [{ content: 'a', items: [] }, { content: '', items: [] }, { content: 'b', items: [] }] } };
  assert.equal(md(ol), '1. a\n2. b\n');
});

test('multi-line list item keeps its continuation indented', () => {
  assert.equal(md(list('a<br>b', 'c')), '- a  \n  b\n- c\n');
});

test('code blocks keep their own consecutive blank lines', () => {
  const out = md({ type: 'code', data: { code: 'a\n\n\nb', language: '' } });
  assert.ok(out.includes('a\n\n\nb'), JSON.stringify(out));
});

test('empty header/checklist/quote blocks leave no trace', () => {
  assert.equal(md(P('a'), { type: 'header', data: { level: 2, text: '<br>' } }, { type: 'quote', data: { text: '' } }, P('b')), 'a\n\nb\n');
});
