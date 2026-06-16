# Architecture

Nolia Reader is a Manifest V3 browser extension built with TypeScript, React, Vite, unified/remark/rehype, Mermaid, KaTeX, Readability, and Turndown.

## Runtime Surfaces

- **Content loader**: a small generated script listed in the manifest. It decides whether the full runtime should be loaded.
- **Content runtime**: mounts the inline reader, full reader, or Mermaid enhancement UI into the active page.
- **Reader UI**: React components for preview/source mode, table of contents, exports, theme controls, and exit-to-original-page behavior.
- **Popup**: current-page status, render/exit actions, quick conversion, and domain controls.
- **Options page**: persistent reader and Markdown feature settings.
- **Background service worker**: context menus, downloads, export packaging, settings persistence, and dynamic content script registration.

## Markdown Flow

1. `src/content/detector.ts` identifies Markdown-like pages from URL, content type, browser plain-text `<pre>` pages, and Markdown heuristics.
2. `src/renderer/documentFactory.ts` builds a normalized document model with title, source, content, and reading stats.
3. `src/renderer/markdownPipeline.ts` parses Markdown with remark and renders sanitized HTML with rehype.
4. Mermaid code blocks become safe placeholders and are rendered after React mounts the document.
5. The reader can switch between rendered preview and original Markdown source.

## Hosted Markdown Flow

Hosted repository pages can preserve the surrounding site chrome while replacing only the document body:

- GitHub
- GitLab
- Gitee
- Bitbucket

Adapters live in `src/content/hostAdapters.ts` and raw source resolution lives in `src/content/hostedMarkdown.ts`.

## Ordinary Webpage Flow

For normal HTML pages, Nolia Reader does not replace the page automatically. It can:

- render Mermaid snippets in place;
- convert the main article content to Markdown through Readability and Turndown when the user asks.

## Security Model

- Markdown HTML is sanitized before rendering.
- Extension code is bundled locally; no remote code is loaded.
- Document content is processed locally in the browser.
- Host permissions are optional and domain-scoped.
- Links and images are normalized and unsafe URLs are removed.

## Build Outputs

Vite builds separate extension targets:

- `dist/chrome`
- `dist/edge`
- `dist/firefox`

Packaged zip files are generated under `release/` by `npm run package`. These directories are build artifacts and are not intended to be committed.
