export interface InlineMarkdownMountTarget {
  container: HTMLElement;
  siteName: string;
}

const hostedSelectors: Record<string, string[]> = {
  github: [
    "[data-testid='readme'] article.markdown-body",
    "[data-testid='readme'] .markdown-body",
    "article.markdown-body",
    ".markdown-body"
  ],
  gitlab: [
    ".readme-holder .md",
    ".file-content .md",
    ".blob-viewer .md",
    "article.markdown-body",
    ".markdown-body",
    ".wiki"
  ],
  gitee: [
    "article.markdown-body",
    ".markdown-body",
    ".readme-box"
  ],
  bitbucket: [
    "[data-qa='readme-content']",
    ".markdown-body",
    ".readme"
  ]
};

export function findHostedMarkdownMountTarget(
  documentRef: Document = document,
  value: string = location.href
): InlineMarkdownMountTarget | undefined {
  const siteName = hostedSiteName(value);
  if (!siteName) {
    return undefined;
  }

  for (const selector of hostedSelectors[siteName]) {
    const container = firstUsableContainer(documentRef, selector);
    if (container) {
      return { container, siteName };
    }
  }

  return undefined;
}

function firstUsableContainer(documentRef: Document, selector: string): HTMLElement | undefined {
  const candidates = Array.from(documentRef.querySelectorAll<HTMLElement>(selector));
  return candidates.find((element) => {
    if (element.dataset.noliaInlineHost === "true") {
      return true;
    }
    if (element.closest("#nolia-reader-root") || element.closest("#nolia-inline-reader-root")) {
      return false;
    }
    if (element.matches("#nolia-reader-root, #nolia-inline-reader-root")) {
      return false;
    }
    if (element.querySelector("#nolia-reader-root, #nolia-inline-reader-root")) {
      return false;
    }
    return Boolean(element.textContent?.trim() || element.children.length);
  });
}

function hostedSiteName(value: string): keyof typeof hostedSelectors | "" {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "";
  }

  if (url.hostname === "github.com" || url.hostname.endsWith(".github.com")) {
    return "github";
  }
  if (url.hostname === "gitlab.com" || url.hostname.endsWith(".gitlab.com")) {
    return "gitlab";
  }
  if (url.hostname === "gitee.com" || url.hostname.endsWith(".gitee.com")) {
    return "gitee";
  }
  if (url.hostname === "bitbucket.org" || url.hostname.endsWith(".bitbucket.org")) {
    return "bitbucket";
  }
  return "";
}
