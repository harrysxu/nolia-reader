import type { MarkdownPageDocument } from "../shared/documentModel";

export function createExportHtml(documentModel: MarkdownPageDocument, html: string, css: string, includeSource = false): string {
  const sourceComment = includeSource ? `\n<!--\n${escapeHtmlComment(documentModel.markdown)}\n-->\n` : "";
  return `<!doctype html>
<html class="nolia-export-page">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="Nolia Reader">
  <meta name="source" content="${escapeHtml(documentModel.sourceUrl)}">
  <title>${escapeHtml(documentModel.title)}</title>
  <style>${exportBaseCss()}</style>
  <style>${css}</style>
</head>
<body>
  <main class="nolia-export-shell">
    <article class="nolia-export markdown-body">
${html}
    </article>
  </main>${sourceComment}
</body>
</html>`;
}

export function markdownToFrontmatterExport(documentModel: MarkdownPageDocument): string {
  return [
    "---",
    `title: ${JSON.stringify(documentModel.title)}`,
    `source: ${JSON.stringify(documentModel.sourceUrl)}`,
    `savedAt: ${JSON.stringify(new Date().toISOString())}`,
    "---",
    "",
    documentModel.markdown
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeHtmlComment(value: string): string {
  return value.replace(/-->/g, "--&gt;");
}

function exportBaseCss(): string {
  return `
:root {
  color-scheme: light dark;
  --bg: #f7f8fa;
  --surface: #ffffff;
  --text: #1f2328;
  --muted: #656d76;
  --border: #d8dee4;
  --accent: #0969da;
  --success: #1a7f37;
  --warning: #9a6700;
  --danger: #cf222e;
  --code-bg: #f6f8fa;
  --code-text: #24292f;
  --code-keyword: #cf222e;
  --code-entity: #8250df;
  --code-constant: #0550ae;
  --code-string: #0a3069;
  --code-variable: #953800;
  --code-comment: #6e7781;
  --code-tag: #116329;
  --code-list: #3b2300;
  --code-addition-text: #116329;
  --code-addition-bg: #dafbe1;
  --code-deletion-text: #82071e;
  --code-deletion-bg: #ffebe9;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --text: #e6edf3;
    --muted: #8b949e;
    --border: #30363d;
    --accent: #58a6ff;
    --success: #3fb950;
    --warning: #d29922;
    --danger: #f85149;
    --code-bg: #111820;
    --code-text: #d6deeb;
    --code-keyword: #ff7b72;
    --code-entity: #d2a8ff;
    --code-constant: #79c0ff;
    --code-string: #a5d6ff;
    --code-variable: #ffa657;
    --code-comment: #8b949e;
    --code-tag: #7ee787;
    --code-list: #f2cc60;
    --code-addition-text: #aff5b4;
    --code-addition-bg: #033a16;
    --code-deletion-text: #ffdcd7;
    --code-deletion-bg: #67060c;
  }
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.nolia-export-shell {
  width: min(100%, 1220px);
  margin: 0 auto;
  padding: 48px 32px;
}

.nolia-export.markdown-body {
  width: 100%;
  margin: 0;
  overflow-wrap: anywhere;
}

.nolia-export.markdown-body table {
  display: table;
  width: 100%;
  table-layout: fixed;
  overflow: visible;
}

.nolia-export.markdown-body th,
.nolia-export.markdown-body td {
  vertical-align: top;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.nolia-export.markdown-body pre,
.nolia-export.markdown-body code {
  white-space: pre-wrap;
  word-break: break-word;
}

.nolia-export .code-copy-button,
.nolia-export .diagram-toolbar {
  display: none !important;
}

@media (max-width: 720px) {
  .nolia-export-shell {
    padding: 0;
  }

  .nolia-export.markdown-body {
    border: 0;
    border-radius: 0;
  }
}

@media print {
  :root {
    --bg: #ffffff;
    --surface: #ffffff;
    --text: #111111;
    --muted: #555555;
    --border: #d0d7de;
    --accent: #0969da;
    --code-bg: #f6f8fa;
    --code-text: #24292f;
    --code-keyword: #cf222e;
    --code-entity: #8250df;
    --code-constant: #0550ae;
    --code-string: #0a3069;
    --code-variable: #953800;
    --code-comment: #6e7781;
    --code-tag: #116329;
    --code-list: #3b2300;
    --code-addition-text: #116329;
    --code-addition-bg: #dafbe1;
    --code-deletion-text: #82071e;
    --code-deletion-bg: #ffebe9;
  }

  .nolia-export-shell {
    padding: 0;
    width: 100%;
  }

  .nolia-export.markdown-body {
    border: 0;
    border-radius: 0;
  }
}
`;
}
