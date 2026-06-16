export type DetectionReason =
  | "url-extension"
  | "content-type"
  | "plain-text-pre"
  | "markdown-heuristic"
  | "known-raw-host"
  | "manual-action";

export interface DetectionResult {
  isMarkdown: boolean;
  confidence: number;
  reason: DetectionReason[];
  sourceKind: "remote" | "local" | "manual";
  rawText?: string;
  contentType?: string;
}

export interface MarkdownPageDocument {
  id: string;
  title: string;
  sourceUrl: string;
  sourceOrigin: string;
  markdown: string;
  detectedBy: DetectionReason[];
  fetchedAt: string;
  contentType?: string;
  baseUrl: string;
  stats: {
    bytes: number;
    lines: number;
    words: number;
    estimatedReadMinutes: number;
  };
}

export interface RenderedMarkdownDocument {
  html: string;
  toc: TocItem[];
  frontmatter: Record<string, unknown>;
  diagnostics: RenderDiagnostic[];
  assets: AssetRef[];
  headings: HeadingRef[];
}

export interface TocItem {
  id: string;
  text: string;
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  index: number;
}

export interface HeadingRef extends TocItem {
  line?: number;
}

export interface RenderDiagnostic {
  severity: "info" | "warning" | "error";
  code:
    | "unsafe-html-removed"
    | "mermaid-render-failed"
    | "math-render-failed"
    | "asset-fetch-failed"
    | "large-document-degraded"
    | "frontmatter-parse-failed";
  message: string;
  line?: number;
}

export interface AssetRef {
  originalUrl: string;
  resolvedUrl: string;
  kind: "image" | "link" | "video" | "audio" | "other";
  downloadable: boolean;
}

export type ReaderMode = "preview" | "source";
