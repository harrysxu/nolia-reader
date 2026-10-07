import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: "<svg data-test='diagram'></svg>" }))
  }
}));

import { renderMermaidBlocks } from "../src/reader/mermaidRuntime";

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
  document.body.innerHTML = "";
});

describe("renderMermaidBlocks", () => {
  it("copies the rendered SVG and reports the result", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const status = vi.fn();
    const block = document.createElement("div");
    block.className = "mermaid-block";
    block.dataset.markdown = "flowchart TD\nA --> B";
    document.body.append(block);

    await renderMermaidBlocks(document, {
      onCopyStatus: status,
      labels: { copy: "Copy SVG", copied: "Copied", failed: "Copy failed" }
    });

    document.querySelector<HTMLButtonElement>("[data-copy-svg]")?.click();
    await vi.waitFor(() => expect(status).toHaveBeenCalledWith("Copied"));
    expect(writeText).toHaveBeenCalledWith("<svg data-test='diagram'></svg>");
  });
});
