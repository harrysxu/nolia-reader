import type { DetectionResult } from "../shared/documentModel";

export interface HostedMarkdownSource {
  markdown: string;
  sourceUrl: string;
  baseUrl: string;
  title?: string;
  contentType?: string;
}

const markdownFilePath = /\.(md|markdown|mdown|mkd)(?:$|[?#])/i;

export function hostedRawUrlFromPageUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "";
  }

  if (url.hostname === "github.com" || url.hostname.endsWith(".github.com")) {
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (match && markdownFilePath.test(match[4])) {
      return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}${url.search}`;
    }
  }

  if (url.hostname === "gitlab.com" || url.hostname.endsWith(".gitlab.com")) {
    const match = url.pathname.match(/^\/(.+)\/-\/blob\/([^/]+)\/(.+)$/);
    if (match && markdownFilePath.test(match[3])) {
      return `${url.origin}/${match[1]}/-/raw/${match[2]}/${match[3]}${url.search}`;
    }
  }

  if (url.hostname === "gitee.com" || url.hostname.endsWith(".gitee.com")) {
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (match && markdownFilePath.test(match[4])) {
      return `${url.origin}/${match[1]}/${match[2]}/raw/${match[3]}/${match[4]}${url.search}`;
    }
  }

  if (url.hostname === "bitbucket.org" || url.hostname.endsWith(".bitbucket.org")) {
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/src\/([^/]+)\/(.+)$/);
    if (match && markdownFilePath.test(match[4])) {
      return `${url.origin}/${match[1]}/${match[2]}/raw/${match[3]}/${match[4]}${url.search}`;
    }
  }

  return "";
}

export function isHostedMarkdownPreviewPage(
  value: string = location.href,
  documentRef?: Document
): boolean {
  const pageDocument = documentRef ?? (typeof document !== "undefined" ? document : undefined);
  return Boolean(hostedRawUrlFromPageUrl(value) || (pageDocument ? hostedRawUrlFromDocument(pageDocument, value) : ""));
}

export async function resolveHostedMarkdownSource(documentRef: Document = document, value?: string): Promise<HostedMarkdownSource | undefined> {
  const pageUrl = value || documentRef.location?.href || location.href;
  const rawUrl = hostedRawUrlFromDocument(documentRef, pageUrl) || hostedRawUrlFromPageUrl(pageUrl);
  if (!rawUrl) {
    return undefined;
  }

  const response = await fetch(rawUrl, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Unable to fetch raw Markdown (${response.status})`);
  }

  const markdown = await response.text();
  return {
    markdown,
    sourceUrl: pageUrl,
    baseUrl: rawUrl,
    title: titleFromMarkdown(markdown) || hostedMarkdownTitle(documentRef, pageUrl),
    contentType: response.headers.get("content-type") ?? "text/markdown"
  };
}

export function hostedRawUrlFromDocument(documentRef: Document, value: string = location.href): string {
  const links = Array.from(documentRef.querySelectorAll<HTMLAnchorElement>("a[href]"));
  const rawLink = links.find((link) => {
    const label = link.textContent?.trim().toLowerCase() ?? "";
    const href = link.getAttribute("href") ?? "";
    return label === "raw" && /\/raw\//.test(href) && markdownFilePath.test(href);
  }) ?? links.find((link) => {
    const href = link.getAttribute("href") ?? "";
    return /\/raw\//.test(href) && markdownFilePath.test(href);
  });
  if (rawLink) {
    try {
      return new URL(rawLink.getAttribute("href") || "", value).toString();
    } catch {
      // Fall through to repository README detection below.
    }
  }
  return githubRepositoryReadmeRawUrlFromDocument(documentRef, value, links);
}

export function detectionFromHostedSource(source: HostedMarkdownSource): DetectionResult {
  return {
    isMarkdown: true,
    confidence: 1,
    reason: ["url-extension", "manual-action"],
    sourceKind: "manual",
    rawText: source.markdown,
    contentType: source.contentType
  };
}

function hostedMarkdownTitle(documentRef: Document, value: string): string {
  const heading = documentRef.querySelector(".markdown-body h1, article h1, h1")?.textContent?.trim();
  if (heading) {
    return heading;
  }
  try {
    return decodeURIComponent(new URL(value).pathname.split("/").pop() || "").trim();
  } catch {
    return "";
  }
}

function titleFromMarkdown(markdown: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return plainTextFromInlineHtml(heading);
  }
  const htmlHeading = markdown.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.trim();
  return htmlHeading ? plainTextFromInlineHtml(htmlHeading) : "";
}

function plainTextFromInlineHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function githubRepositoryReadmeRawUrlFromDocument(documentRef: Document, value: string, links: HTMLAnchorElement[]): string {
  const repo = githubRepositoryPath(value);
  if (!repo) {
    return "";
  }

  const readmeContainer = documentRef.querySelector(".markdown-body, article.markdown-body, [data-testid='readme']");
  const readmeLink = links.find((link) => {
    const href = link.getAttribute("href") ?? "";
    const text = link.textContent?.trim() ?? "";
    return readmeFilePath.test(href) || /^readme(?:\.(?:md|markdown|mdown|mkd))?$/i.test(text);
  });
  if (!readmeContainer && !readmeLink) {
    return "";
  }

  const branch = branchFromGithubReadmeLink(readmeLink?.getAttribute("href") ?? "", repo.owner, repo.name) || "HEAD";
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${branch}/README.md`;
}

function githubRepositoryPath(value: string): { owner: string; name: string } | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.hostname !== "github.com" && !url.hostname.endsWith(".github.com")) {
    return undefined;
  }
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/);
  if (!match) {
    return undefined;
  }
  return { owner: match[1], name: match[2] };
}

function branchFromGithubReadmeLink(href: string, owner: string, repo: string): string {
  const match = href.match(new RegExp(`/${escapeRegExp(owner)}/${escapeRegExp(repo)}/blob/([^/]+)/README\\.(?:md|markdown|mdown|mkd)(?:$|[?#])`, "i"));
  return match?.[1] ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const readmeFilePath = /(?:^|\/)README\.(?:md|markdown|mdown|mkd)(?:$|[?#])/i;
