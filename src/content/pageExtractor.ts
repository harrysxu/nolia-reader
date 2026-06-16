import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export type CleanupLevel = "conservative" | "balanced" | "strict";

export interface ConvertedPage {
  title: string;
  markdown: string;
  sourceUrl: string;
  excerpt?: string;
}

export function convertCurrentPageToMarkdown(level: CleanupLevel = "balanced"): ConvertedPage {
  const clone = document.cloneNode(true) as Document;
  cleanupDocument(clone, level);
  const article = new Readability(clone).parse();
  const title = article?.title || document.title || "Untitled";
  const html = article?.content || document.body.innerHTML;
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_"
  });
  turndown.use(gfm);
  turndown.addRule("absoluteImages", {
    filter: "img",
    replacement: (_content, node) => {
      const element = node as HTMLImageElement;
      const src = element.getAttribute("src") || "";
      const alt = element.getAttribute("alt") || "";
      return src ? `![${alt}](${new URL(src, location.href).toString()})` : "";
    }
  });
  const markdown = normalizeMarkdown(withFrontmatter(turndown.turndown(html), title, location.href));
  return {
    title,
    markdown,
    sourceUrl: location.href,
    excerpt: article?.excerpt ?? undefined
  };
}

function cleanupDocument(documentRef: Document, level: CleanupLevel) {
  documentRef.querySelectorAll("script,style,noscript,iframe,object,embed").forEach((node) => node.remove());
  if (level !== "conservative") {
    documentRef
      .querySelectorAll("nav,aside,footer,header,[role='navigation'],[aria-hidden='true'],.ad,.ads,.advertisement,.comments,.related")
      .forEach((node) => node.remove());
  }
  if (level === "strict") {
    documentRef.querySelectorAll("form,button,input,select,textarea,svg,canvas").forEach((node) => node.remove());
  }
}

function withFrontmatter(markdown: string, title: string, source: string): string {
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    `source: ${JSON.stringify(source)}`,
    `savedAt: ${JSON.stringify(new Date().toISOString())}`,
    "---",
    "",
    markdown
  ].join("\n");
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
