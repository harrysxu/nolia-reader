export function filenameFromDocument(title: string, sourceUrl: string, extension = "md"): string {
  const urlName = filenameFromUrl(sourceUrl);
  const base = sanitizeFilename(urlName || title || "document");
  return `${base || "document"}.${extension.replace(/^\./, "")}`;
}

export function filenameFromUrl(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    return last.replace(/\.(md|markdown|mdown|mkd|html?)$/i, "");
  } catch {
    return "";
  }
}

export function sanitizeFilename(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~[\]`;&]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
