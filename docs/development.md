# Development and QA

## Setup

```sh
npm install
npm run verify
```

`npm run verify` runs TypeScript, ESLint, Vitest, and all browser builds.

## Common Scripts

- `npm run icons`: regenerate icon PNGs from `assets/icons/icon.svg`.
- `npm run build`: build Chrome, Edge, and Firefox unpacked extensions.
- `npm run build:chrome`: build only the Chrome target.
- `npm run package`: build all targets and create release zip files.
- `npm run typecheck`: run TypeScript checks.
- `npm run lint`: run ESLint.
- `npm test`: run unit tests.
- `npm run e2e`: run Playwright extension tests.

## Local Install

### Chrome

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `dist/chrome`.

### Edge

1. Open `edge://extensions/`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `dist/edge`.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `dist/firefox/manifest.json`.

## Manual QA Checklist

Use `tests/fixtures/sample.md` or any Markdown page served with `text/plain` or a Markdown content type.

Check Markdown reader behavior:

- automatic render for raw Markdown;
- preview/source toggle;
- table of contents navigation;
- code block copy button;
- theme toggle;
- exit back to the original browser view;
- Markdown download;
- HTML export;
- print-to-PDF entry;
- offline zip export.

Check advanced syntax:

- GFM tables;
- task lists;
- code highlighting;
- Mermaid diagrams;
- KaTeX formulas;
- YAML frontmatter;
- callouts;
- wiki links;
- footnotes.

Check ordinary webpage behavior:

- HTML pages are not replaced automatically;
- Mermaid snippets can render in place;
- webpage-to-Markdown conversion opens the full reader only after user action.

## Release Checklist

1. Run `npm run verify`.
2. Run `npm run package`.
3. Inspect `release/*.zip` with `unzip -t`.
4. Load the unpacked Chrome build and test a raw Markdown page manually.
5. Confirm no generated artifacts are staged unless intentionally publishing release assets elsewhere.
