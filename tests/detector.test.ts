import { describe, expect, it } from "vitest";

import { detectMarkdownPage, markdownConfidence, readPlainText } from "../src/content/detector";

describe("markdownConfidence", () => {
  it("scores markdown documents highly", () => {
    const source = [
      "# Title",
      "",
      "- [x] Task",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "```ts",
      "const x = 1;",
      "```"
    ].join("\n");
    expect(markdownConfidence(source)).toBeGreaterThan(0.65);
  });

  it("scores plain text lower", () => {
    expect(markdownConfidence("This is just a sentence without markdown structure.")).toBeLessThan(0.3);
  });

  it("does not trust known raw hosts when the response is HTML", () => {
    const htmlDocument = document.implementation.createHTMLDocument("Article");
    htmlDocument.body.innerHTML = "<main><h1>Article Heading</h1><p>A focused article paragraph.</p></main>";
    Object.defineProperty(htmlDocument.body, "innerText", {
      value: "Article Heading\nA focused article paragraph.",
      configurable: true
    });
    const documentRef = {
      body: htmlDocument.body,
      contentType: "text/html",
      location: {
        href: "https://raw.githubusercontent.com/nolia-reader/qa/main/article.html",
        pathname: "/nolia-reader/qa/main/article.html",
        protocol: "https:"
      },
      querySelector: (selector: string) => selector === "body" ? htmlDocument.body : htmlDocument.querySelector(selector)
    } as unknown as Document;

    const result = detectMarkdownPage(documentRef);
    expect(result.reason).not.toContain("known-raw-host");
    expect(result.isMarkdown).toBe(false);
  });

  it("does not treat an HTML page as Markdown just because its URL ends with .md", () => {
    const htmlDocument = document.implementation.createHTMLDocument("README.md");
    htmlDocument.body.innerHTML = "<main><h1>Rendered Page</h1><p>This is ordinary HTML.</p></main>";
    Object.defineProperty(htmlDocument.body, "innerText", {
      value: "Rendered Page\nThis is ordinary HTML.",
      configurable: true
    });
    const documentRef = {
      body: htmlDocument.body,
      contentType: "text/html",
      location: {
        href: "https://docs.example.com/path/README.md",
        pathname: "/path/README.md",
        protocol: "https:"
      },
      querySelector: (selector: string) => selector === "body" ? htmlDocument.body : htmlDocument.querySelector(selector)
    } as unknown as Document;

    const result = detectMarkdownPage(documentRef);
    expect(result.reason).not.toContain("url-extension");
    expect(result.isMarkdown).toBe(false);
  });

  it("detects browser plain-text pre documents with Markdown syntax", () => {
    const htmlDocument = document.implementation.createHTMLDocument("README.md");
    htmlDocument.body.innerHTML = `<pre># Internal Runbook

- Step one
- Step two

\`\`\`sh
npm run verify
\`\`\`
</pre>`;
    const documentRef = {
      body: htmlDocument.body,
      contentType: "text/html",
      location: {
        href: "https://docs.example.com/internal/runbook",
        pathname: "/internal/runbook",
        protocol: "https:"
      },
      querySelector: (selector: string) => htmlDocument.querySelector(selector)
    } as unknown as Document;

    const result = detectMarkdownPage(documentRef);
    expect(result.reason).toContain("plain-text-pre");
    expect(result.reason).toContain("markdown-heuristic");
    expect(result.isMarkdown).toBe(true);
  });

  it("does not read already-rendered Nolia UI as Markdown source", () => {
    const htmlDocument = document.implementation.createHTMLDocument("Markdown Document");
    htmlDocument.body.innerHTML = `
      <div id="nolia-reader-root">
        <div class="nolia-reader">
          <header>Preview Source Contents</header>
          <article class="markdown-body"><h1>Rendered Title</h1></article>
        </div>
      </div>
    `;

    expect(readPlainText(htmlDocument)).toBe("");
    expect(detectMarkdownPage(htmlDocument).rawText).toBe("");
  });
});
