import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Root, RootContent, Text } from "mdast";
import type { Element, Root as HastRoot, Text as HastText } from "hast";

import type { AssetRef, RenderDiagnostic, RenderedMarkdownDocument, TocItem } from "../shared/documentModel";
import type { ExtensionSettings } from "../shared/settings";
import { isSafeImageUrl, isSafeLinkUrl, resolveUrl } from "../shared/url";
import { splitFrontmatter } from "./frontmatter";
import { slugifyHeading } from "./toc";

interface RenderOptions {
  baseUrl: string;
  settings: ExtensionSettings;
}

const sanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "mark",
    "kbd",
    "sub",
    "sup",
    "dl",
    "dt",
    "dd"
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "id",
      "className",
      ["dataLanguage"],
      ["dataCodeBlock"],
      ["dataMarkdown"],
      ["dataDiagram"],
      ["dataCallout"],
      ["dataWikilinkTarget"]
    ],
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      "target",
      "rel"
    ],
    details: [
      ...(defaultSchema.attributes?.details ?? []),
      "open"
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      "className"
    ]
  }
};

export async function renderMarkdown(source: string, options: RenderOptions): Promise<RenderedMarkdownDocument> {
  const diagnostics: RenderDiagnostic[] = [];
  const { body, frontmatter, error: frontmatterError } = splitFrontmatter(source);
  if (frontmatterError) {
    diagnostics.push({
      severity: "warning",
      code: "frontmatter-parse-failed",
      message: frontmatterError
    });
  }

  const toc: TocItem[] = [];
  const assets: AssetRef[] = [];
  const headings = new Map<string, number>();

  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(options.settings.enableMath ? remarkMath : noopPlugin)
    .use(options.settings.enableWikilinks ? remarkWikilinks : noopPlugin)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, sanitizeSchema)
    .use(() => (tree: HastRoot) => {
      visit(tree, "element", (node: Element) => {
        normalizeElement(node, options.baseUrl, assets, toc, headings, options.settings);
      });
    })
    .use(options.settings.enableMath ? rehypeKatex : noopPlugin)
    .use(rehypeHighlight)
    .use(rehypeStringify);

  const file = await processor.process(body);
  return {
    html: String(file),
    toc,
    frontmatter,
    diagnostics,
    assets,
    headings: toc
  };
}

function normalizeElement(
  node: Element,
  baseUrl: string,
  assets: AssetRef[],
  toc: TocItem[],
  headings: Map<string, number>,
  settings: ExtensionSettings
) {
  if (/^h[1-6]$/.test(node.tagName)) {
    const text = textContent(node).trim();
    const id = slugifyHeading(text, headings);
    node.properties.id = id;
    toc.push({
      id,
      text,
      depth: Number(node.tagName.slice(1)) as TocItem["depth"],
      index: toc.length
    });
  }

  if (node.tagName === "a") {
    const href = String(node.properties.href ?? "");
    const resolved = href.startsWith("#") ? href : resolveUrl(href, baseUrl);
    if (!isSafeLinkUrl(resolved)) {
      delete node.properties.href;
    } else {
      node.properties.href = resolved;
      if (!resolved.startsWith("#")) {
        node.properties.target = "_blank";
        node.properties.rel = "noopener noreferrer";
      }
      assets.push({ originalUrl: href, resolvedUrl: resolved, kind: "link", downloadable: false });
    }
  }

  if (node.tagName === "img") {
    const src = String(node.properties.src ?? "");
    const resolved = resolveUrl(src, baseUrl);
    if (!isSafeImageUrl(resolved)) {
      delete node.properties.src;
    } else {
      node.properties.src = resolved;
      node.properties.loading = "lazy";
      assets.push({ originalUrl: src, resolvedUrl: resolved, kind: "image", downloadable: /^https?:|^data:image\//i.test(resolved) });
    }
  }

  if (node.tagName === "pre") {
    normalizeCodeOrDiagramBlock(node, settings);
  }

  if (settings.enableCallouts && node.tagName === "blockquote") {
    normalizeCallout(node);
  }
}

function normalizeCodeOrDiagramBlock(node: Element, settings: ExtensionSettings) {
  const code = node.children.find((child): child is Element => child.type === "element" && child.tagName === "code");
  const className = classList(code?.properties.className);
  const language = className.find((value) => value.startsWith("language-"))?.replace(/^language-/, "") ?? "";
  const source = textContent(code ?? node);
  if (settings.enableMermaid && isMermaidBlock(language, source)) {
    node.tagName = "div";
    node.properties = {
      className: ["mermaid-block"],
      dataDiagram: "mermaid",
      dataMarkdown: source
    };
    node.children = [{ type: "text", value: source }];
    return;
  }
  node.properties = {
    ...(node.properties ?? {}),
    dataCodeBlock: "true",
    dataLanguage: language || "plaintext"
  };
}

export function isMermaidBlock(language: string, source: string): boolean {
  const normalizedLanguage = language.trim().toLowerCase();
  if ([
    "mermaid",
    "mmd",
    "graph",
    "flowchart",
    "sequencediagram",
    "classdiagram",
    "statediagram",
    "erdiagram",
    "gantt",
    "pie",
    "journey",
    "gitgraph",
    "mindmap",
    "timeline",
    "quadrantchart",
    "requirementdiagram",
    "c4context",
    "c4container",
    "c4component",
    "c4dynamic",
    "c4deployment",
    "xychart",
    "xychart-beta",
    "block",
    "block-beta",
    "sankey-beta",
    "packet-beta",
    "architecture-beta",
    "kanban",
    "zenuml",
    "treemap-beta",
    "radar-beta",
    "info"
  ].includes(normalizedLanguage)) {
    return true;
  }
  return /^(?:---[\s\S]*?---\s*)?(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4(?:Context|Container|Component|Dynamic|Deployment)|xychart-beta|block-beta|sankey-beta|packet-beta|architecture-beta|kanban|zenuml|treemap-beta|radar-beta|info)\b/m.test(source.trim());
}

function normalizeCallout(node: Element) {
  const firstParagraph = node.children.find((child): child is Element => child.type === "element" && child.tagName === "p");
  const firstText = firstParagraph?.children.find((child): child is HastText => child.type === "text");
  const match = firstText?.value.match(/^\[!([A-Za-z][A-Za-z0-9_-]*)([+-])?]\s*([^\n]*)/);
  if (!match || !firstText) {
    return;
  }
  const kind = match[1].toLowerCase();
  const title = match[3].trim() || kind.toUpperCase();
  firstText.value = firstText.value.slice(match[0].length).replace(/^\s+/, "");
  node.properties = {
    ...(node.properties ?? {}),
    className: ["callout", `callout-${knownCalloutKind(kind)}`],
    dataCallout: kind
  };
  node.children.unshift({
    type: "element",
    tagName: "div",
    properties: { className: ["callout-title"] },
    children: [{ type: "text", value: title }]
  });
}

function knownCalloutKind(kind: string): string {
  return ["note", "tip", "important", "warning", "caution"].includes(kind) ? kind : "note";
}

function remarkWikilinks() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || typeof index !== "number" || !("children" in parent)) {
        return;
      }
      const replacements = expandWikilinks(node.value);
      if (replacements.length === 1 && replacements[0]?.type === "text" && replacements[0].value === node.value) {
        return;
      }
      parent.children.splice(index, 1, ...replacements);
    });
  };
}

function expandWikilinks(value: string): RootContent[] {
  const nodes: RootContent[] = [];
  const pattern = /\[\[([^\]\n]+)]]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, match.index) });
    }
    const [targetWithHeading, alias] = match[1].split("|").map((part) => part.trim());
    const [targetText, targetHeading] = targetWithHeading.split("#").map((part) => part.trim());
    const label = alias || targetText || match[1];
    nodes.push({
      type: "link",
      url: `#wiki-${encodeURIComponent(targetText || label)}`,
      children: [{ type: "text", value: label }],
      data: {
        hProperties: {
          className: ["wikilink"],
          dataWikilinkTarget: targetText,
          dataWikilinkHeading: targetHeading
        }
      }
    } as RootContent);
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) });
  }
  return nodes.length ? nodes : [{ type: "text", value }];
}

function textContent(node: Element): string {
  return node.children
    .map((child) => {
      if (child.type === "text") return child.value;
      if (child.type === "element") return textContent(child);
      return "";
    })
    .join("");
}

function classList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string") {
    return value.split(/\s+/);
  }
  return [];
}

function noopPlugin() {
  return undefined;
}
