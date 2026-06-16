import { describe, expect, it } from "vitest";

import { hasMermaidSnippetCandidates } from "../src/content/mermaidEnhancer";

describe("Mermaid page enhancer", () => {
  it("detects Mermaid snippets in ordinary page code blocks", () => {
    document.body.innerHTML = "<main><pre>```mermaid\nflowchart TD\n  A --> B\n```</pre></main>";

    expect(hasMermaidSnippetCandidates(document)).toBe(true);
  });

  it("does not treat generic Markdown source as a page Mermaid diagram", () => {
    document.body.innerHTML = "<main><pre># Notes\n\n- Keep this Markdown source visible.\n- Do not replace it.</pre></main>";

    expect(hasMermaidSnippetCandidates(document)).toBe(false);
  });

  it("detects Mermaid snippets with line numbers from wiki code macros", () => {
    document.body.innerHTML = "<main><pre>1 flowchart TD\n2   A --> B\n3   B --> C</pre></main>";

    expect(hasMermaidSnippetCandidates(document)).toBe(true);
  });

  it("does not detect non-Mermaid fenced code blocks as diagrams", () => {
    document.body.innerHTML = "<main><pre>```bash\nnpm run verify\n```</pre></main>";

    expect(hasMermaidSnippetCandidates(document)).toBe(false);
  });
});
