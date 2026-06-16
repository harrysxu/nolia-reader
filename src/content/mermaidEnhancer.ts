import type { ExtensionSettings } from "../shared/settings";

const ENHANCED_ATTR = "data-nolia-mermaid-enhanced";
const MERMAID_CANDIDATE_SELECTOR = [
  "pre",
  "code",
  ".wiki-content pre",
  ".codeContent pre",
  ".syntaxhighlighter-pre",
  "[data-syntaxhighlighter-params]",
  "[data-language='mermaid']",
  "[data-lang='mermaid']",
  ".language-mermaid",
  ".lang-mermaid"
].join(", ");

export async function enhanceMermaidSnippets(documentRef: Document = document, settings?: ExtensionSettings): Promise<number> {
  if (settings?.enableMermaid === false) {
    return 0;
  }
  const candidates = findMermaidSnippetCandidates(documentRef);
  if (!candidates.length) {
    return 0;
  }

  const { renderMermaidBlocks } = await import("../reader/mermaidRuntime");

  applyTheme(documentRef, settings);
  let count = 0;
  for (const candidate of candidates) {
    const source = candidate.source.trim();
    if (!source) {
      continue;
    }

    const host = documentRef.createElement("div");
    host.className = `nolia-mermaid-render nolia-inline-reader theme-${settings?.theme ?? "system"} font-medium`;
    host.setAttribute(ENHANCED_ATTR, "true");
    const diagram = documentRef.createElement("div");
    diagram.className = "mermaid-block";
    diagram.dataset.diagram = "mermaid";
    diagram.dataset.markdown = source;
    diagram.textContent = source;
    host.append(diagram);
    candidate.element.replaceWith(host);
    await renderMermaidBlocks(host);
    count += 1;
  }
  return count;
}

export function hasMermaidSnippetCandidates(documentRef: Document = document): boolean {
  return findMermaidSnippetCandidates(documentRef, 1).length > 0;
}

interface MermaidSnippetCandidate {
  element: HTMLElement;
  source: string;
}

function findMermaidSnippetCandidates(documentRef: Document, limit = 20): MermaidSnippetCandidate[] {
  const elements = Array.from(documentRef.querySelectorAll<HTMLElement>(MERMAID_CANDIDATE_SELECTOR));
  const candidates: MermaidSnippetCandidate[] = [];
  const seen = new Set<HTMLElement>();
  for (const element of elements) {
    const target = enhanceTargetFor(element, documentRef);
    if (!target || seen.has(target) || target.closest(`[${ENHANCED_ATTR}='true'], #nolia-reader-root, #nolia-inline-reader-root`)) {
      continue;
    }
    seen.add(target);
    const text = target.textContent?.trim() ?? "";
    const language = languageFor(element) || languageFor(target);
    const source = extractMermaidSource(language, text);
    if (source) {
      candidates.push({ element: target, source });
      if (candidates.length >= limit) {
        break;
      }
    }
  }
  return candidates;
}

function enhanceTargetFor(element: HTMLElement, documentRef: Document): HTMLElement | undefined {
  if (!documentRef.body?.contains(element)) {
    return undefined;
  }
  if (element.tagName.toLowerCase() === "code" && element.parentElement?.tagName.toLowerCase() === "pre") {
    return element.parentElement;
  }
  return element;
}

function extractMermaidSource(language: string, source: string): string | undefined {
  if (source.length < 12 || source.length > 80_000) {
    return undefined;
  }
  const normalized = source.trim();
  const fenced = normalized.match(/^```[^\n]*\n([\s\S]*?)\n```\s*$/i)
    ?? normalized.match(/^~~~[^\n]*\n([\s\S]*?)\n~~~\s*$/i);
  const candidate = fenced?.[1]?.trim() || normalized;
  if (looksLikeMermaid(language, candidate)) {
    return candidate;
  }
  const withoutLineNumbers = stripLikelyLineNumbers(candidate);
  return withoutLineNumbers !== candidate && looksLikeMermaid(language, withoutLineNumbers)
    ? withoutLineNumbers
    : undefined;
}

function looksLikeMermaid(language: string, source: string): boolean {
  const normalizedLanguage = language.toLowerCase();
  if (["mermaid", "mmd"].includes(normalizedLanguage)) {
    return true;
  }
  return /^(?:---[\s\S]*?---\s*)?(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4(?:Context|Container|Component|Dynamic|Deployment)|xychart-beta|block-beta|sankey-beta|packet-beta|architecture-beta|kanban|zenuml|treemap-beta|radar-beta|info)\b/m.test(source.trim());
}

function stripLikelyLineNumbers(source: string): string {
  const lines = source.split(/\r?\n/);
  const numberedLines = lines.filter((line) => /^\s*\d+\s+\S/.test(line)).length;
  if (numberedLines < Math.max(2, Math.ceil(lines.length * 0.7))) {
    return source;
  }
  return lines.map((line) => line.replace(/^\s*\d+\s+/, "")).join("\n").trim();
}

function languageFor(element: HTMLElement): string {
  const className = Array.from(element.classList).find((value) => /^(?:language-|lang-)/i.test(value));
  if (className) {
    return className.replace(/^(?:language-|lang-)/i, "").trim();
  }
  return (element.dataset.language || element.getAttribute("data-lang") || "").trim();
}

function applyTheme(documentRef: Document, settings?: ExtensionSettings): void {
  const theme = settings?.theme ?? "system";
  const prefersDark = documentRef.defaultView?.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  documentRef.documentElement.dataset.noliaTheme = theme === "system"
    ? (prefersDark ? "dark" : "light")
    : theme;
}
