import type { DetectionResult, MarkdownPageDocument } from "../shared/documentModel";
import { getHostname } from "../shared/url";
import { splitFrontmatter } from "./frontmatter";

interface CreateMarkdownDocumentOptions {
  baseUrl?: string;
  title?: string;
}

export function createMarkdownDocument(
  markdown: string,
  detection: DetectionResult,
  sourceUrl = location.href,
  options: CreateMarkdownDocumentOptions = {}
): MarkdownPageDocument {
  const frontmatterTitle = titleFromFrontmatter(markdown);
  const headingTitle = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const pageTitle = document.title?.trim();
  const title = frontmatterTitle || headingTitle || options.title || titleFromSourceUrl(sourceUrl) || pageTitle || "Markdown Document";
  const words = countWords(markdown);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    sourceUrl,
    sourceOrigin: getHostname(sourceUrl),
    markdown,
    detectedBy: detection.reason,
    fetchedAt: new Date().toISOString(),
    contentType: detection.contentType,
    baseUrl: options.baseUrl || sourceUrl,
    stats: {
      bytes: new Blob([markdown]).size,
      lines: markdown.split(/\r?\n/).length,
      words,
      estimatedReadMinutes: Math.max(1, Math.ceil(words / 220))
    }
  };
}

export function countWords(source: string): number {
  const cjk = source.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latin = source.replace(/[\u4e00-\u9fff]/g, " ").match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  return cjk + latin;
}

function titleFromFrontmatter(markdown: string): string {
  const { frontmatter } = splitFrontmatter(markdown);
  const title = frontmatter.title;
  return typeof title === "string" ? title.trim() : "";
}

function titleFromSourceUrl(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "file:") {
      return "";
    }
    return decodeURIComponent(url.pathname.split("/").pop() || "").replace(/\.(md|markdown|mdown|mkd)$/i, "").trim();
  } catch {
    return "";
  }
}
