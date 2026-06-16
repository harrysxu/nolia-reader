import { describe, expect, it } from "vitest";

import { findHostedMarkdownMountTarget } from "../src/content/hostAdapters";

describe("hosted Markdown mount targets", () => {
  it("finds GitHub README markdown containers", () => {
    const documentRef = document.implementation.createHTMLDocument("repo");
    documentRef.body.innerHTML = `
      <header>Repository navigation</header>
      <main>
        <article class="markdown-body">
          <h1>Spec Kit</h1>
        </article>
      </main>
    `;

    const target = findHostedMarkdownMountTarget(documentRef, "https://github.com/github/spec-kit");

    expect(target?.siteName).toBe("github");
    expect(target?.container.tagName).toBe("ARTICLE");
  });

  it("finds GitLab markdown preview containers", () => {
    const documentRef = document.implementation.createHTMLDocument("repo");
    documentRef.body.innerHTML = `
      <section class="file-content">
        <div class="md"><h1>README</h1></div>
      </section>
    `;

    const target = findHostedMarkdownMountTarget(documentRef, "https://gitlab.com/group/project/-/blob/main/README.md");

    expect(target?.siteName).toBe("gitlab");
    expect(target?.container.className).toBe("md");
  });

  it("does not choose the existing Nolia roots as hosted containers", () => {
    const documentRef = document.implementation.createHTMLDocument("repo");
    documentRef.body.innerHTML = `
      <article class="markdown-body">
        <div id="nolia-inline-reader-root">Rendered</div>
      </article>
    `;

    expect(findHostedMarkdownMountTarget(documentRef, "https://github.com/github/spec-kit")).toBeUndefined();
  });
});
