import { afterEach, describe, expect, it, vi } from "vitest";

import { hostedRawUrlFromDocument, hostedRawUrlFromPageUrl, isHostedMarkdownPreviewPage, resolveHostedMarkdownSource } from "../src/content/hostedMarkdown";
describe("hosted Markdown preview pages", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("resolves GitHub blob Markdown pages to raw URLs", () => {
    expect(hostedRawUrlFromPageUrl("https://github.com/github/spec-kit/blob/main/SUPPORT.md")).toBe(
      "https://raw.githubusercontent.com/github/spec-kit/main/SUPPORT.md"
    );
  });

  it("resolves GitLab blob Markdown pages to raw URLs", () => {
    expect(hostedRawUrlFromPageUrl("https://gitlab.com/group/project/-/blob/main/docs/README.md")).toBe(
      "https://gitlab.com/group/project/-/raw/main/docs/README.md"
    );
  });

  it("ignores non-Markdown hosted file previews", () => {
    expect(hostedRawUrlFromPageUrl("https://github.com/github/spec-kit/blob/main/package.json")).toBe("");
  });

  it("identifies hosted Markdown preview pages", () => {
    expect(isHostedMarkdownPreviewPage("https://github.com/github/spec-kit/blob/main/SUPPORT.md")).toBe(true);
    expect(isHostedMarkdownPreviewPage("https://github.com/github/spec-kit/issues")).toBe(false);
  });

  it("resolves GitHub repository home pages to README raw URLs when a README is present", () => {
    const documentRef = document.implementation.createHTMLDocument("spec-kit");
    documentRef.body.innerHTML = `
      <main>
        <a href="/github/spec-kit/blob/main/README.md">README.md</a>
        <article class="markdown-body">
          <h1>Spec Kit</h1>
          <p>Repository README content.</p>
        </article>
      </main>
    `;

    expect(hostedRawUrlFromDocument(documentRef, "https://github.com/github/spec-kit")).toBe(
      "https://raw.githubusercontent.com/github/spec-kit/main/README.md"
    );
    expect(isHostedMarkdownPreviewPage("https://github.com/github/spec-kit", documentRef)).toBe(true);
  });

  it("falls back to HEAD for GitHub repository README pages without a branch link", () => {
    const documentRef = document.implementation.createHTMLDocument("spec-kit");
    documentRef.body.innerHTML = `
      <article class="markdown-body">
        <h1>Spec Kit</h1>
      </article>
    `;

    expect(hostedRawUrlFromDocument(documentRef, "https://github.com/github/spec-kit")).toBe(
      "https://raw.githubusercontent.com/github/spec-kit/HEAD/README.md"
    );
  });

  it("uses the raw Markdown heading as the hosted document title", async () => {
    const documentRef = document.implementation.createHTMLDocument("spec-kit");
    documentRef.body.innerHTML = `
      <a href="/github/spec-kit/blob/main/README.md">README.md</a>
      <article class="markdown-body">
        <h1>Toolkit to help you get started with Spec-Driven Development</h1>
      </article>
    `;
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => "<div align=\"center\">\n<h1>🌱 Spec Kit</h1>\n</div>\n",
      headers: new Headers({ "content-type": "text/plain; charset=utf-8" })
    })));

    const source = await resolveHostedMarkdownSource(documentRef, "https://github.com/github/spec-kit");
    expect(source?.baseUrl).toBe("https://raw.githubusercontent.com/github/spec-kit/main/README.md");
    expect(source?.title).toBe("🌱 Spec Kit");
  });
});
