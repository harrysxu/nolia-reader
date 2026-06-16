import type { ExtensionSettings } from "./settings";
import type { MarkdownPageDocument } from "./documentModel";

export type ContentScriptMessage =
  | { type: "content:render"; forced?: boolean; surface?: "auto" | "inline" | "reader" }
  | { type: "content:exit" }
  | { type: "content:convert" }
  | { type: "content:enhanceMermaid" }
  | { type: "content:enhanceEmbedded" }
  | { type: "content:copyMarkdown" }
  | { type: "content:downloadMarkdown" }
  | { type: "content:status" };

export type ExtensionMessage =
  | { type: "settings:get" }
  | { type: "settings:set"; payload: Partial<ExtensionSettings> }
  | { type: "settings:openOptions" }
  | { type: "markdown:renderCurrentTab" }
  | { type: "markdown:download"; payload: { document: MarkdownPageDocument } }
  | { type: "export:html"; payload: { document: MarkdownPageDocument; html: string; css: string } }
  | { type: "export:offlineZip"; payload: { document: MarkdownPageDocument; html: string; css: string; assets: string[] } }
  | { type: "page:convertToMarkdown" }
  | { type: "permissions:requestHost"; payload: { origin: string } }
  | { type: "domain:blockCurrent"; payload: { hostname: string } }
  | { type: "domain:allowCurrent"; payload: { hostname: string } };

export type RuntimeMessage = ContentScriptMessage | ExtensionMessage;

export interface ExtensionError {
  code:
    | "permission_denied"
    | "not_markdown"
    | "render_failed"
    | "download_failed"
    | "export_failed"
    | "conversion_failed";
  message: string;
  recoverable: boolean;
  detail?: unknown;
}
