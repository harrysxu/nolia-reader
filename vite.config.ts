import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

type BrowserTarget = "chrome" | "edge" | "firefox";

const target = (process.env.npm_lifecycle_event?.replace("build:", "") || process.env.MODE || "chrome") as BrowserTarget;

export default defineConfig(({ mode }) => {
  const browser = normalizeTarget(mode || target);
  const outDir = `dist/${browser}`;
  return {
    base: "./",
    plugins: [react(), manifestPlugin(browser, outDir)],
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: {
          popup: path.resolve(__dirname, "popup.html"),
          options: path.resolve(__dirname, "index.html"),
          background: path.resolve(__dirname, "src/background/serviceWorker.ts"),
          contentApp: path.resolve(__dirname, "src/content/bootstrap.tsx")
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]"
        }
      }
    }
  };
});

function normalizeTarget(value: string): BrowserTarget {
  if (value === "edge" || value === "firefox") {
    return value;
  }
  return "chrome";
}

function manifestPlugin(browser: BrowserTarget, outDir: string): PluginOption {
  return {
    name: "nolia-reader-manifest",
    async closeBundle() {
      await mkdir(outDir, { recursive: true });
      const contentCss = await findContentCss(outDir);
      await writeContentLoader(outDir, contentCss);
      await copyIcons(outDir);
      await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(await createManifest(browser, outDir), null, 2)}\n`, "utf8");
    }
  };
}

async function createManifest(browser: BrowserTarget, outDir: string) {
  const chromiumBackground = {
    service_worker: "assets/background.js",
    type: "module"
  };
  const firefoxBackground = {
    scripts: ["assets/background.js"],
    type: "module"
  };
  return removeUndefined({
    manifest_version: 3,
    name: browser === "edge" ? "Nolia Reader for Edge" : "Nolia Reader",
    version: "0.1.0",
    description: "Read, convert, and export Markdown webpages locally.",
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png"
    },
    action: {
      default_title: "Nolia Reader",
      default_popup: "popup.html",
      default_icon: {
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
        48: "icons/icon-48.png",
        128: "icons/icon-128.png"
      }
    },
    options_ui: {
      page: "index.html",
      open_in_tab: true
    },
    background: browser === "firefox" ? firefoxBackground : chromiumBackground,
    permissions: ["storage", "activeTab", "scripting", "downloads", "contextMenus"],
    optional_host_permissions: ["http://*/*", "https://*/*", "file:///*"],
    content_scripts: [
      {
        matches: defaultContentLoaderMatches(),
        js: ["assets/content-loader.js"],
        run_at: "document_idle"
      }
    ],
    web_accessible_resources: [
      {
        resources: ["assets/*"],
        matches: ["http://*/*", "https://*/*", "file:///*"]
      }
    ],
    browser_specific_settings:
      browser === "firefox"
        ? {
            gecko: {
              id: "nolia-reader@example.com",
              strict_min_version: "121.0"
            }
          }
        : undefined
  });
}

async function findContentCss(outDir: string): Promise<string[]> {
  try {
    const assets = await readdir(path.join(outDir, "assets"));
    return assets.filter((name) => /^contentApp-.*\.css$/.test(name)).map((name) => `assets/${name}`);
  } catch {
    return [];
  }
}

async function writeContentLoader(outDir: string, contentCss: string[]) {
  const loader = `(() => {
  const runtime = globalThis.chrome;
  const appScript = "assets/contentApp.js";
  const cssFiles = ${JSON.stringify(contentCss)};
  const loadKey = "__noliaReaderLoadRuntime";
  const promiseKey = "__noliaReaderRuntimePromise";
  const ensureKey = "__noliaReaderEnsureRuntime";
  const handlerKey = "__noliaReaderHandleMessage";
  const installedKey = "__noliaReaderLoaderInstalled";
  const observerKey = "__noliaReaderMermaidCandidateObserver";
  const markdownPathPattern = /\\.(?:md|markdown|mdown|mkd)(?:$|[?#])/i;
  const mermaidSyntaxPattern = /(?:^|\\n)\\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4(?:Context|Container|Component|Dynamic|Deployment)|xychart-beta|block-beta|sankey-beta|packet-beta|architecture-beta|kanban|zenuml|treemap-beta|radar-beta|info)\\b/;
  const mermaidLanguagePattern = /(?:^|\\s)(?:language-|lang-)?(?:mermaid|mmd)(?:\\s|$)/i;
  const knownHostedMarkdownPattern = /^(?:https?:\\/\\/github\\.com\\/[^/]+\\/[^/]+(?:\\/blob\\/.*\\.(?:md|markdown|mdown|mkd)(?:$|[?#])?)?|https?:\\/\\/github\\.com\\/[^/]+\\/[^/?#]+\\/?(?:[?#].*)?|https?:\\/\\/(?:[^/]+\\.)?gitlab\\.com\\/.*\\/-\\/blob\\/.*\\.(?:md|markdown|mdown|mkd)(?:$|[?#])?|https?:\\/\\/gitee\\.com\\/[^/]+\\/[^/]+\\/blob\\/.*\\.(?:md|markdown|mdown|mkd)(?:$|[?#])?|https?:\\/\\/bitbucket\\.org\\/[^/]+\\/[^/]+\\/src\\/.*\\.(?:md|markdown|mdown|mkd)(?:$|[?#])?)/i;
  const knownRawHostPattern = /^(?:https?:\\/\\/raw\\.githubusercontent\\.com\\/|https?:\\/\\/gist\\.githubusercontent\\.com\\/|https?:\\/\\/(?:[^/]+\\.)?gitlab\\.com\\/.*\\/-\\/raw\\/|https?:\\/\\/gitee\\.com\\/.*\\/raw\\/|https?:\\/\\/bitbucket\\.org\\/.*\\/raw\\/)/i;

  function runtimeUrl(path) {
    return runtime.runtime.getURL(path);
  }

  function injectStyles() {
    for (const cssFile of cssFiles) {
      const href = runtimeUrl(cssFile);
      if (document.querySelector('link[data-nolia-reader-css="' + href + '"]')) {
        continue;
      }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.noliaReaderCss = href;
      (document.head || document.documentElement).append(link);
    }
  }

  globalThis[loadKey] = async () => {
    if (!globalThis[promiseKey]) {
      globalThis[promiseKey] = (async () => {
        injectStyles();
        await import(runtimeUrl(appScript));
        const ensureRuntime = globalThis[ensureKey];
        if (typeof ensureRuntime !== "function") {
          throw new Error("Nolia Reader app module did not register.");
        }
        await ensureRuntime();
        return true;
      })();
    }
    return globalThis[promiseKey];
  };

  function shouldLoadImmediately() {
    const href = location.href;
    const contentType = document.contentType || "";
    const plainTextPreDocument = isPlainTextPreDocument();
    if (knownHostedMarkdownPattern.test(href) || knownRawHostPattern.test(href)) {
      return true;
    }
    if (/text\\/html/i.test(contentType) && hasMermaidSnippetCandidate()) {
      return true;
    }
    if (!markdownPathPattern.test(href) && !/text\\/(?:plain|(?:x-)?markdown)/i.test(contentType) && !plainTextPreDocument) {
      return false;
    }
    if (/text\\/html/i.test(contentType) && !plainTextPreDocument) {
      return false;
    }
    return true;
  }

  function isPlainTextPreDocument() {
    return Boolean(document.body && document.body.children.length === 1 && document.body.firstElementChild?.tagName?.toLowerCase() === "pre");
  }

  function hasMermaidSnippetCandidate() {
    const blocks = Array.from(document.querySelectorAll("pre, code, .wiki-content pre, .codeContent pre, .syntaxhighlighter-pre, [data-syntaxhighlighter-params], [data-language='mermaid'], [data-lang='mermaid'], .language-mermaid, .lang-mermaid"));
    return blocks.some((block) => {
      const text = (block.textContent || "").trim();
      const className = block.getAttribute("class") || "";
      const language = block.getAttribute("data-language") || block.getAttribute("data-lang") || "";
      return text.length >= 12
        && text.length <= 80000
        && (mermaidSyntaxPattern.test(text) || mermaidLanguagePattern.test(className) || /^(?:mermaid|mmd)$/i.test(language));
    });
  }

  function installMermaidCandidateObserver() {
    if (globalThis[observerKey] || !/text\\/html/i.test(document.contentType || "")) {
      return;
    }
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) {
        return;
      }
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        if (hasMermaidSnippetCandidate()) {
          observer.disconnect();
          globalThis[observerKey] = undefined;
          void globalThis[loadKey]();
        }
      }, 250);
    });
    globalThis[observerKey] = observer;
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setTimeout(() => {
      observer.disconnect();
      if (globalThis[observerKey] === observer) {
        globalThis[observerKey] = undefined;
      }
    }, 30000);
  }

  if (!globalThis[installedKey]) {
    globalThis[installedKey] = true;
    runtime.runtime.onMessage.addListener((message, sender, sendResponse) => {
      globalThis[loadKey]()
        .then(() => {
          const handler = globalThis[handlerKey];
          if (typeof handler !== "function") {
            throw new Error("Nolia Reader runtime is not ready.");
          }
          return handler(message, sender);
        })
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      return true;
    });
  }

  if (shouldLoadImmediately()) {
    void globalThis[loadKey]();
  } else {
    installMermaidCandidateObserver();
  }
})();
`;
  await writeFile(path.join(outDir, "assets", "content-loader.js"), loader, "utf8");
}

async function copyIcons(outDir: string) {
  await cp(path.join(__dirname, "assets", "icons"), path.join(outDir, "icons"), { recursive: true });
}

function knownRawMarkdownMatches(): string[] {
  return [
    "https://raw.githubusercontent.com/*",
    "https://gist.githubusercontent.com/*",
    "https://gitlab.com/*/-/raw/*",
    "https://*.gitlab.com/*/-/raw/*",
    "https://gitee.com/*/raw/*",
    "https://bitbucket.org/*/raw/*"
  ];
}

function knownHostedMarkdownPreviewMatches(): string[] {
  return [
    "https://github.com/*/*",
    "https://github.com/*/*/blob/*.md*",
    "https://github.com/*/*/blob/*.markdown*",
    "https://gitlab.com/*/-/blob/*.md*",
    "https://gitlab.com/*/-/blob/*.markdown*",
    "https://*.gitlab.com/*/-/blob/*.md*",
    "https://*.gitlab.com/*/-/blob/*.markdown*",
    "https://gitee.com/*/*/blob/*.md*",
    "https://gitee.com/*/*/blob/*.markdown*",
    "https://bitbucket.org/*/*/src/*.md*",
    "https://bitbucket.org/*/*/src/*.markdown*"
  ];
}

function defaultContentLoaderMatches(): string[] {
  return [
    "http://*/*",
    "https://*/*",
    "file:///*"
  ];
}

function removeUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefined(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, removeUndefined(entryValue)])
    ) as T;
  }
  return value;
}
