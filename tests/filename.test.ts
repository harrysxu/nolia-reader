import { describe, expect, it } from "vitest";

import { createMarkdownDocument } from "../src/renderer/documentFactory";
import { filenameFromDocument, sanitizeFilename } from "../src/shared/filename";

describe("filename helpers", () => {
  it("sanitizes unsafe names", () => {
    expect(sanitizeFilename("a/b:c*? title")).toBe("a-b-c-title");
  });

  it("uses url filename first", () => {
    expect(filenameFromDocument("Title", "https://example.com/docs/readme.md")).toBe("readme.md");
  });
});

describe("createMarkdownDocument", () => {
  it("uses local Markdown file names as fallback titles", () => {
    const markdown = "Hello,\n\nThis document does not have a top-level heading.";
    const documentModel = createMarkdownDocument(
      markdown,
      {
        isMarkdown: true,
        confidence: 1,
        reason: ["url-extension"],
        sourceKind: "local",
        rawText: markdown,
        contentType: "text/plain"
      },
      "file:///home/example/Documents/project-notes.md"
    );

    expect(documentModel.title).toBe("project-notes");
  });
});
