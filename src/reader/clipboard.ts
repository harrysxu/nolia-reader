/**
 * Copy text through the async Clipboard API, with a legacy fallback for
 * content scripts running on pages that are not secure contexts.
 */
export async function copyText(text: string, documentRef: Document = document): Promise<void> {
  const clipboard = documentRef.defaultView?.navigator.clipboard ?? globalThis.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy copy path when the page denies clipboard access.
    }
  }

  if (!documentRef.body || typeof documentRef.execCommand !== "function") {
    throw new Error("Clipboard is unavailable");
  }

  const textarea = documentRef.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  documentRef.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = documentRef.execCommand("copy");
  } finally {
    textarea.remove();
  }

  if (!copied) {
    throw new Error("Clipboard is unavailable");
  }
}
