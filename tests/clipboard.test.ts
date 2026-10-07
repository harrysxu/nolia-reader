import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "../src/reader/clipboard";

const originalClipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, "clipboard");
const originalExecCommand = Object.getOwnPropertyDescriptor(Document.prototype, "execCommand");

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
  if (originalClipboard) {
    Object.defineProperty(Navigator.prototype, "clipboard", originalClipboard);
  }
  Reflect.deleteProperty(document, "execCommand");
  if (originalExecCommand) {
    Object.defineProperty(Document.prototype, "execCommand", originalExecCommand);
  }
  document.body.innerHTML = "";
});

describe("copyText", () => {
  it("uses the async Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    await copyText("<svg />");

    expect(writeText).toHaveBeenCalledWith("<svg />");
  });

  it("falls back to execCommand when Clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });

    await copyText("fallback text");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.body.querySelector("textarea")).toBeNull();
  });

  it("reports failure when neither copy path is available", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });

    await expect(copyText("unavailable")).rejects.toThrow("Clipboard is unavailable");
  });
});
