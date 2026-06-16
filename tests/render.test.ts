import { describe, expect, it } from "vitest";

import { renderMarkdown } from "../src/renderer/markdownPipeline";
import { DEFAULT_SETTINGS } from "../src/shared/settings";

describe("renderMarkdown", () => {
  it("renders gfm and sanitizes scripts", async () => {
    const rendered = await renderMarkdown("# Hello\n\n<script>alert(1)</script>\n\n- [x] Done", {
      baseUrl: "https://example.com/readme.md",
      settings: DEFAULT_SETTINGS
    });
    expect(rendered.html).toContain("Hello");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.toc[0]?.text).toBe("Hello");
  });

  it("creates mermaid placeholders", async () => {
    const rendered = await renderMarkdown("```mermaid\ngraph TD\nA-->B\n```", {
      baseUrl: "https://example.com/readme.md",
      settings: DEFAULT_SETTINGS
    });
    expect(rendered.html).toContain("mermaid-block");
  });

  it("detects unlabeled mermaid code blocks by diagram syntax", async () => {
    const rendered = await renderMarkdown("```\nflowchart LR\nA --> B\n```", {
      baseUrl: "https://example.com/readme.md",
      settings: DEFAULT_SETTINGS
    });
    expect(rendered.html).toContain("mermaid-block");
  });
});
