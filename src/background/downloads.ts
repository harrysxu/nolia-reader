import JSZip from "jszip";

import type { MarkdownPageDocument } from "../shared/documentModel";
import { filenameFromDocument } from "../shared/filename";
import { browserApi } from "../shared/browser";
import { createExportHtml } from "../renderer/exportHtml";

export async function downloadMarkdown(documentModel: MarkdownPageDocument): Promise<void> {
  await downloadText(filenameFromDocument(documentModel.title, documentModel.sourceUrl, "md"), documentModel.markdown, "text/markdown;charset=utf-8");
}

export async function downloadHtml(documentModel: MarkdownPageDocument, html: string, css: string): Promise<void> {
  const content = createExportHtml(documentModel, html, css);
  await downloadText(filenameFromDocument(documentModel.title, documentModel.sourceUrl, "html"), content, "text/html;charset=utf-8");
}

export async function downloadOfflineZip(documentModel: MarkdownPageDocument, html: string, css: string, assets: string[]): Promise<void> {
  const zip = new JSZip();
  const assetManifest: Array<{ url: string; path?: string; status: "downloaded" | "failed" | "skipped"; reason?: string }> = [];
  let htmlContent = createExportHtml(documentModel, html, css);
  zip.file("document.md", documentModel.markdown);

  for (const [index, assetUrl] of assets.entries()) {
    if (!/^https?:\/\//i.test(assetUrl) && !assetUrl.startsWith("data:image/")) {
      assetManifest.push({ url: assetUrl, status: "skipped", reason: "unsupported protocol" });
      continue;
    }
    try {
      const response = await fetch(assetUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      if (blob.size > 10 * 1024 * 1024) {
        throw new Error("asset exceeds 10MB");
      }
      const extension = extensionFromMime(blob.type) || extensionFromUrl(assetUrl) || "bin";
      const assetPath = `assets/image-${String(index + 1).padStart(3, "0")}.${extension}`;
      zip.file(assetPath, await blob.arrayBuffer());
      htmlContent = htmlContent.split(assetUrl).join(assetPath);
      assetManifest.push({ url: assetUrl, path: assetPath, status: "downloaded" });
    } catch (error) {
      assetManifest.push({ url: assetUrl, status: "failed", reason: error instanceof Error ? error.message : String(error) });
    }
  }

  zip.file("assets/manifest.json", `${JSON.stringify(assetManifest, null, 2)}\n`);
  zip.file("index.html", htmlContent);
  const blob = await zip.generateAsync({ type: "blob" });
  await downloadBlob(filenameFromDocument(documentModel.title, documentModel.sourceUrl, "zip"), blob);
}

async function downloadText(filename: string, content: string, type: string): Promise<void> {
  await downloadBlob(filename, new Blob([content], { type }));
}

async function downloadBlob(filename: string, blob: Blob): Promise<void> {
  const url = await blobToDataUrl(blob);
  await browserApi.downloads.download({ url, filename, saveAs: true });
}

function extensionFromMime(type: string): string {
  if (type.includes("png")) return "png";
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("gif")) return "gif";
  if (type.includes("webp")) return "webp";
  if (type.includes("svg")) return "svg";
  return "";
}

function extensionFromUrl(value: string): string {
  try {
    return new URL(value).pathname.split(".").pop()?.replace(/[^a-z0-9]/gi, "").slice(0, 8) ?? "";
  } catch {
    return "";
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read export blob"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}
