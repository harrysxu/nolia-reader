import { parse as parseYaml } from "yaml";

export interface SplitFrontmatterResult {
  frontmatter: Record<string, unknown>;
  body: string;
  raw?: string;
  error?: string;
}

export function splitFrontmatter(source: string): SplitFrontmatterResult {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) {
    return { frontmatter: {}, body: source };
  }
  try {
    const parsed = parseYaml(match[1]);
    return {
      frontmatter: isRecord(parsed) ? parsed : {},
      body: source.slice(match[0].length).replace(/^\n+/, ""),
      raw: match[1]
    };
  } catch (error) {
    return {
      frontmatter: {},
      body: source.slice(match[0].length).replace(/^\n+/, ""),
      raw: match[1],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
