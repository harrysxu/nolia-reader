# Nolia Reader

Nolia Reader is a local-first browser extension for reading, converting, and exporting Markdown webpages. It renders raw Markdown pages, local Markdown files, hosted repository documents, and Mermaid snippets without sending document content to a remote service.

## Features

- Automatic Markdown detection for raw URLs, `.md` files, Markdown content types, and browser plain-text documents.
- Inline rendering for hosted README or blob pages on common source platforms.
- Full reader mode with table of contents, preview/source toggle, theme switch, content width, code copy, scroll progress, and exit back to the original browser view.
- GitHub Flavored Markdown, tables, task lists, footnotes, frontmatter, callouts, wiki links, syntax highlighting, Mermaid, and KaTeX.
- Export workflows for Markdown download, HTML export, print-to-PDF, and offline zip packages.
- Webpage-to-Markdown conversion using Readability and Turndown.
- Local processing by default, with no telemetry.

## Install From Source

```sh
npm install
npm run build
```

Load the unpacked extension:

- Chrome: open `chrome://extensions/`, enable Developer mode, and load `dist/chrome`.
- Edge: open `edge://extensions/`, enable Developer mode, and load `dist/edge`.
- Firefox: open `about:debugging#/runtime/this-firefox` and load `dist/firefox/manifest.json`.

For packaged artifacts:

```sh
npm run package
```

## Development

```sh
npm run typecheck
npm run lint
npm test
npm run build:chrome
```

Full verification:

```sh
npm run verify
```

End-to-end tests run against a real unpacked extension through Playwright:

```sh
npm run e2e
```

## Repository Layout

- `src/background`: extension service worker, downloads, and dynamic content script registration.
- `src/content`: content script runtime, Markdown detection, hosted-page adapters, Mermaid enhancement, and webpage extraction.
- `src/reader`: reader UI and document rendering controls.
- `src/renderer`: Markdown pipeline, export HTML generation, frontmatter, and table of contents helpers.
- `src/popup`: extension popup.
- `src/options`: options page.
- `src/shared`: message types, settings, browser wrappers, URLs, filenames, and i18n.
- `tests`: unit and extension E2E tests.
- `docs`: architecture and development notes.

## Privacy

Nolia Reader renders and converts documents locally in the browser. The extension does not upload Markdown content, converted HTML, or page text to external services.

Host permissions are optional and used to enable automatic rendering for sites that the user allows. File access for local Markdown documents must be enabled in the browser extension details page.

## Documentation

- [Architecture](docs/architecture.md)
- [Development and QA](docs/development.md)

## License

MIT
