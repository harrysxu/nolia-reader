import type { DetectionReason, DetectionResult } from "../shared/documentModel";
import { getHostname, isKnownRawHost } from "../shared/url";

const markdownExtensions = /\.(md|markdown|mdown|mkd)(?:$|[?#])/i;

export function detectMarkdownPage(documentRef: Document = document, forced = false): DetectionResult {
  const pageUrl = documentRef.location?.href || location.href;
  const pagePathname = documentRef.location?.pathname || location.pathname;
  const pageProtocol = documentRef.location?.protocol || location.protocol;
  const sourceKind = pageProtocol === "file:" ? "local" : forced ? "manual" : "remote";
  const rawText = readPlainText(documentRef);
  const reasons: DetectionReason[] = [];
  const hostname = getHostname(pageUrl);
  const contentType = readContentType(documentRef);
  const rawTextDocument = isRawTextDocument(documentRef, contentType);
  const markdownUrl = markdownExtensions.test(pageUrl) || /(?:^|\/)(README|CHANGELOG|LICENSE)(?:$|[?#])/i.test(pagePathname);
  const markdownContentType = /text\/(?:x-)?markdown/i.test(contentType);
  const canAnalyzeSource = forced || rawTextDocument || markdownContentType || (markdownUrl && !isHtmlContentType(contentType));

  if (forced) {
    reasons.push("manual-action");
  }
  if (markdownUrl && canAnalyzeSource) {
    reasons.push("url-extension");
  }
  if (markdownContentType) {
    reasons.push("content-type");
  }
  if (isKnownRawHost(hostname) && rawText && rawTextDocument) {
    reasons.push("known-raw-host");
  }
  if (isPlainTextPre(documentRef)) {
    reasons.push("plain-text-pre");
  }

  const heuristic = canAnalyzeSource ? markdownConfidence(rawText) : 0;
  if (heuristic >= 0.45 || (rawTextDocument && heuristic >= 0.35)) {
    reasons.push("markdown-heuristic");
  }

  const confidence = rawTextDocument && reasons.includes("markdown-heuristic")
    ? Math.max(confidenceForReasons(reasons, heuristic), 0.7)
    : confidenceForReasons(reasons, heuristic);
  return {
    isMarkdown: forced || confidence >= 0.65,
    confidence,
    reason: uniqueReasons(reasons),
    sourceKind,
    rawText,
    contentType
  };
}

export function readPlainText(documentRef: Document = document): string {
  if (documentRef.querySelector("#nolia-reader-root, #nolia-inline-reader-root")) {
    return "";
  }
  if (isPlainTextPre(documentRef)) {
    return documentRef.body?.querySelector("pre")?.textContent ?? "";
  }
  if (documentRef.body && documentRef.body.children.length === 0) {
    return documentRef.body.textContent ?? "";
  }
  if (documentRef.contentType.includes("text/plain")) {
    return documentRef.body?.innerText ?? "";
  }
  const root = documentRef.querySelector("body");
  return root?.innerText ?? "";
}

export function markdownConfidence(source: string): number {
  const text = source.slice(0, 100_000);
  if (!text.trim()) {
    return 0;
  }
  const lines = text.split(/\r?\n/);
  let score = 0;
  if (/^---\s*\n[\s\S]+?\n---/m.test(text)) score += 0.12;
  if (lines.some((line) => /^#{1,6}\s+\S/.test(line))) score += 0.16;
  if (/```|~~~/.test(text)) score += 0.16;
  if (lines.some((line) => /^\s*[-*+]\s+\S/.test(line))) score += 0.1;
  if (lines.some((line) => /^\s*\d+\.\s+\S/.test(line))) score += 0.08;
  if (/\[[^\]\n]+]\([^)]+\)/.test(text)) score += 0.12;
  if (/!\[[^\]\n]*]\([^)]+\)/.test(text)) score += 0.08;
  if (/\n\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}:?\s*\|/.test(text)) score += 0.14;
  if (/^\s*[-*+]\s+\[[ xX]]\s+/m.test(text)) score += 0.1;
  if (/^\s*>\s+\S/m.test(text)) score += 0.06;
  if (/<html[\s>]/i.test(text)) score -= 0.22;
  return Math.max(0, Math.min(1, score));
}

function readContentType(documentRef: Document): string {
  return documentRef.contentType || documentRef.querySelector("meta[http-equiv='content-type']")?.getAttribute("content") || "";
}

function isPlainTextPre(documentRef: Document): boolean {
  const body = documentRef.body;
  return Boolean(body && body.children.length === 1 && body.firstElementChild?.tagName.toLowerCase() === "pre");
}

function isRawTextDocument(documentRef: Document, contentType: string): boolean {
  if (/text\/(?:plain|(?:x-)?markdown)/i.test(contentType)) {
    return true;
  }
  const body = documentRef.body;
  if (body && (body.children.length === 0 || isPlainTextPre(documentRef))) {
    return true;
  }
  return false;
}

function isHtmlContentType(contentType: string): boolean {
  return /(?:^|;|\s)text\/html(?:$|;|\s)/i.test(contentType);
}

function confidenceForReasons(reasons: DetectionReason[], heuristic: number): number {
  let confidence = heuristic;
  if (reasons.includes("manual-action")) confidence = Math.max(confidence, 1);
  if (reasons.includes("url-extension")) confidence = Math.max(confidence, 0.9);
  if (reasons.includes("content-type")) confidence = Math.max(confidence, 0.9);
  if (reasons.includes("known-raw-host")) confidence = Math.max(confidence, 0.75);
  if (reasons.includes("plain-text-pre") && reasons.includes("markdown-heuristic")) confidence = Math.max(confidence, 0.7);
  if (reasons.includes("plain-text-pre")) confidence += 0.1;
  return Math.max(0, Math.min(1, confidence));
}

function uniqueReasons(reasons: DetectionReason[]): DetectionReason[] {
  return Array.from(new Set(reasons));
}
