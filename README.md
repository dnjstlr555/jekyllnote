# JekyllNote

A local, Editor.js-based writing tool for a [Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy) Jekyll blog. It fixes the image bottleneck when moving posts from Notion, edits front matter, and writes back to your site folder safely.

## What it does

- **Block editor** (Editor.js): headings, lists, checklists, quotes, code, tables, images, YouTube, and Chirpy-specific blocks — prompts, description lists, block/inline math (MathJax), and a raw-markdown escape hatch. Notion-style shortcuts: `/h1`–`/h4`, `- `/`1.` + space to start a list.
- **Images become files**: pasted, uploaded, or external-URL images are downloaded locally on the spot; on submit they land in `assets/img/posts/{date-slug}/` and the markdown paths are rewritten.
- **Front matter panel**: title, description, date, categories, tags (with autocomplete) plus `math`/`mermaid`/`pin`, and free-form raw YAML. Filename (`YYYY-MM-DD-slug.md`) and date are filled in automatically.
- **Autosave drafts**: edits are saved continuously (drafts are stored inside the app, never in your site folder until you submit).
- **Safe writes**: never runs `git`; every write is path-checked, shown in a dry-run preview first, and requires explicit confirmation before overwriting (with a backup).
- **Bilingual UI**: auto-detects Korean/English and can be toggled.

## Install & run

Requires Node.js 20+.

```bash
git clone <this-repo-url> jekyllnote
cd jekyllnote
npm install
npm start
```

Open http://localhost:4173 and enter the absolute path to your Jekyll site root (the folder containing `_config.yml`) when prompted.

## Credits
Sticky note icons created by surang - Flaticon