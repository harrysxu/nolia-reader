import type { TocItem } from "../shared/documentModel";

export function slugifyHeading(text: string, existing: Map<string, number>): string {
  const base = encodeURIComponent(
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  ) || "heading";
  const count = existing.get(base) ?? 0;
  existing.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

export function collectTocFromHtml(html: string): TocItem[] {
  const template = document.createElement("template");
  template.innerHTML = html;
  return Array.from(template.content.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((heading, index) => ({
    id: heading.id,
    text: heading.textContent?.trim() || `Heading ${index + 1}`,
    depth: Number(heading.tagName.slice(1)) as TocItem["depth"],
    index
  }));
}
