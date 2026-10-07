import { copyText } from "./clipboard";

export function attachCodeCopyButtons(
  root: Document | HTMLElement,
  showToast: (message: string) => void,
  labels: { copy: string; copied: string; failed?: string } = { copy: "Copy", copied: "Copied" }
): void {
  root.querySelectorAll<HTMLPreElement>(".markdown-body pre[data-code-block='true']").forEach((pre) => {
    if (pre.querySelector(".code-copy-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-copy-button";
    button.textContent = labels.copy;
    button.setAttribute("aria-label", labels.copy);
    button.addEventListener("click", () => {
      const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
      void copyText(code.replace(new RegExp(`${escapeRegExp(labels.copy)}$`), ""), pre.ownerDocument).then(() => {
        button.textContent = labels.copied;
        showToast(labels.copied);
        setTimeout(() => {
          button.textContent = labels.copy;
        }, 1500);
      }).catch(() => {
        showToast(labels.failed ?? "Copy failed");
      });
    });
    pre.append(button);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
