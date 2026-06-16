import { expect, test, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const extensionPath = path.resolve(process.cwd(), "dist/chrome");
const rawMarkdownUrl = "https://raw.githubusercontent.com/nolia-reader/qa/main/sample.md";
const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

test.describe.configure({ mode: "serial" });

test.describe("installed Nolia Reader extension", () => {
  test.setTimeout(120_000);

  test("renders raw Markdown, supports core reading actions, and exports styled HTML", async () => {
    const env = await launchExtension();
    try {
      await routeMarkdownFixture(env.context);

      const page = await env.context.newPage();
      const diagnostics = collectPageDiagnostics(page);
      let serviceWorker: Worker;

      await test.step("auto-render raw Markdown with P0/P1 syntax", async () => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(rawMarkdownUrl, { waitUntil: "domcontentloaded" });

        await expect(page.locator("#nolia-inline-reader-root")).toBeVisible({ timeout: 20_000 });
        await expect(page.locator("#nolia-reader-root")).toHaveCount(0);
        env.extensionId = await extensionIdFromContentPage(page);
        serviceWorker = await wakeServiceWorker(env.context, env.extensionId);
        await mockDownloads(serviceWorker);
        await expect(page.locator(".nolia-inline-toolbar")).toBeVisible();
        await expect(page.locator(".markdown-body h1").first()).toHaveText("Nolia Reader QA Sample");
        await expect(page.locator(".frontmatter-panel")).toBeVisible();
        await expect(page.locator(".markdown-body table")).toBeVisible();
        await expect(page.locator(".callout")).toContainText("This callout should render");
        await expect(page.locator(".katex").first()).toBeVisible();
        await expect(page.locator(".mermaid-block svg").first()).toBeVisible({ timeout: 30_000 });
      });

      await test.step("support expected inline reader interactions", async () => {
        await page.getByRole("button", { name: /Source|原文/ }).click();
        await expect(page.locator(".source-view")).toContainText('const message = "copy me";');
        await page.getByRole("button", { name: /Preview|预览/ }).click();

        const firstCodeBlock = page.locator(".markdown-body pre[data-code-block='true']").first();
        await expect(firstCodeBlock.locator(".code-copy-button")).toBeAttached();
        await firstCodeBlock.hover();
        await firstCodeBlock.locator(".code-copy-button").click({ force: true });
        await expect(page.locator(".reader-toast")).toContainText(/Copied|已复制/);
      });

      await test.step("download and export through extension background", async () => {
        const documentModel = await page.evaluate(() => {
          return {
            title: document.querySelector(".document-header h1")?.textContent ?? "Nolia Reader QA Sample",
            sourceUrl: location.href,
            sourceOrigin: location.hostname
          };
        });
        await page.getByRole("button", { name: /Source|原文/ }).click();
        const markdown = await page.locator(".source-view pre").textContent();
        await page.getByRole("button", { name: /Preview|预览/ }).click();
        const html = await page.locator(".markdown-body").evaluate((node) => node.innerHTML);

        const extensionPage = await env.context.newPage();
        await extensionPage.goto(`chrome-extension://${env.extensionId}/index.html`, { waitUntil: "domcontentloaded" });
        await extensionPage.evaluate(async ({ documentModel, markdown, html }) => {
          const base = {
            id: "e2e-document",
            title: documentModel.title,
            sourceUrl: documentModel.sourceUrl,
            sourceOrigin: documentModel.sourceOrigin,
            markdown: markdown ?? "",
            detectedBy: ["known-raw-host"],
            fetchedAt: new Date().toISOString(),
            contentType: "text/plain",
            baseUrl: documentModel.sourceUrl,
            stats: {
              bytes: markdown?.length ?? 0,
              lines: markdown?.split(/\r?\n/).length ?? 0,
              words: 136,
              estimatedReadMinutes: 1
            }
          };
          await chrome.runtime.sendMessage({ type: "markdown:download", payload: { document: base } });
          await chrome.runtime.sendMessage({
            type: "export:html",
            payload: { document: base, html, css: ".markdown-body{line-height:1.65}" }
          });
        }, { documentModel, markdown, html });
        await extensionPage.close();

        await expect.poll(() => readMockDownloads(serviceWorker).then((items) => items.length)).toBe(2);
        const downloads = await readMockDownloads(serviceWorker);
        const markdownDownload = downloads[0];
        expect(markdownDownload.filename).toBe("sample.md");
        expect(decodeDataUrl(markdownDownload.url)).toContain("# Nolia Reader QA Sample");
        const htmlDownload = downloads[1];
        const exportedHtml = decodeDataUrl(htmlDownload.url);
        expect(htmlDownload.filename).toBe("sample.html");
        expect(exportedHtml).toContain("<main class=\"nolia-export-shell\">");
        expect(exportedHtml).toContain("<article class=\"nolia-export markdown-body\">");
        expect(exportedHtml).toContain("table-layout: fixed");
        expect(exportedHtml).toContain(".markdown-body");
      });

      await test.step("open full reader when requested", async () => {
        await page.getByRole("button", { name: /Open reader|打开阅读器/ }).click();
        await expect(page.locator("#nolia-reader-root")).toBeVisible({ timeout: 20_000 });
        await expect(page.locator(".reader-toc")).toBeVisible();
        await page.getByRole("button", { name: /Contents|目录/ }).click();
        await expect(page.locator(".reader-toc")).toBeHidden();
        await page.getByRole("button", { name: /Dark|Light/ }).click();
        await expect(page.locator(".reader-toc")).toBeHidden();
        await page.getByRole("button", { name: /Dark|Light/ }).click();
        await expect(page.locator(".reader-toc")).toBeHidden();

        const optionsPromise = env.context.waitForEvent("page");
        await page.getByRole("button", { name: /Settings|设置/ }).click();
        const options = await optionsPromise;
        await options.waitForLoadState("domcontentloaded");
        await expect(options).toHaveURL(new RegExp(`chrome-extension://${env.extensionId}/index\\.html`));
        await options.close();
        await page.bringToFront();
      });

      await test.step("capture desktop and mobile UI states", async () => {
        await page.screenshot({ path: "test-results/ui-reader-desktop.png", fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(page.locator(".reader-toc")).toBeHidden();
        await expect(page.locator(".mermaid-block svg").first()).toBeVisible();
        await expect(page.locator(".markdown-body pre[data-code-block='true'] .code-copy-button").first()).toBeAttached();
        expect(await hasNoDocumentHorizontalOverflow(page)).toBe(true);
        await page.screenshot({ path: "test-results/ui-reader-mobile.png", fullPage: true });
      });

      expect(diagnostics.errors).toEqual([]);
    } finally {
      await env.close();
    }
  });

  test("auto-renders generic Markdown documents without taking over ordinary HTML pages", async () => {
    const env = await launchExtension();
    try {
      const markdownUrl = "https://docs.example.test/teams/platform/runbook";
      const htmlUrl = "https://docs.example.test/teams/platform/page.md";
      await env.context.route(markdownUrl, (route) => route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: [
          "# Platform Runbook",
          "",
          "- Check service health",
          "- Review deploy logs",
          "",
          "```sh",
          "npm run verify",
          "```"
        ].join("\n")
      }));
      await env.context.route(htmlUrl, (route) => route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html>
<html>
<head><title>HTML page with Markdown-looking URL</title></head>
<body>
  <main>
    <h1>HTML Page</h1>
    <p>This page is already HTML and should not be replaced automatically.</p>
  </main>
</body>
</html>`
      }));

      const markdownPage = await env.context.newPage();
      await markdownPage.goto(markdownUrl, { waitUntil: "domcontentloaded" });
      await expect(markdownPage.locator("#nolia-inline-reader-root")).toBeVisible({ timeout: 20_000 });
      await expect(markdownPage.locator("#nolia-reader-root")).toHaveCount(0);
      await expect(markdownPage.locator(".markdown-body h1")).toHaveText("Platform Runbook");

      const htmlPage = await env.context.newPage();
      await htmlPage.goto(htmlUrl, { waitUntil: "domcontentloaded" });
      await expect(htmlPage.locator("#nolia-reader-root")).toHaveCount(0);
      await expect(htmlPage.getByRole("heading", { name: "HTML Page" })).toBeVisible();
    } finally {
      await env.close();
    }
  });

  test("exits reader back to the browser view and re-enters the previous mode", async () => {
    const env = await launchExtension();
    try {
      const markdownUrl = "https://raw.githubusercontent.com/nolia-reader/qa/main/exit-reader.md";
      await env.context.route(markdownUrl, (route) => route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: [
          "# Exit Reader",
          "",
          "The original browser view should be restored after leaving Nolia Reader.",
          "",
          "```http",
          "POST /api/waybill/receive HTTP/1.1",
          "Host: api.example.com",
          "```"
        ].join("\n")
      }));

      const page = await env.context.newPage();
      await page.goto(markdownUrl, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#nolia-inline-reader-root")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(".markdown-body h1")).toHaveText("Exit Reader");
      env.extensionId = await extensionIdFromContentPage(page);

      await page.getByRole("button", { name: /Exit reader|退出阅读器/ }).click();
      await expect(page.locator("#nolia-inline-reader-root")).toHaveCount(0);
      await expect(page.locator("body > pre")).toContainText("# Exit Reader");

      const serviceWorker = await wakeServiceWorker(env.context, env.extensionId);
      const status = await sendContentMessageToPage(serviceWorker, page, { type: "content:status" });
      expect((status as { rendered?: boolean; lastRenderedSurface?: string }).rendered).toBe(false);
      expect((status as { rendered?: boolean; lastRenderedSurface?: string }).lastRenderedSurface).toBe("inline");

      await sendContentMessageToPage(serviceWorker, page, { type: "content:render", forced: true });
      await expect(page.locator("#nolia-inline-reader-root")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(".markdown-body h1")).toHaveText("Exit Reader");
    } finally {
      await env.close();
    }
  });

  test("enhances Mermaid snippets inside ordinary wiki pages without replacing the page", async () => {
    const env = await launchExtension();
    try {
      const wikiUrl = "https://docs.example.test/pages/viewpage.action?pageId=93240440";
      await env.context.route(wikiUrl, (route) => route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html>
<html>
<head><title>Wiki Mermaid Fixture</title></head>
<body>
  <aside>页面树结构 2026-进行中</aside>
  <main class="wiki-content">
    <h1>技术文档</h1>
    <h2>5.1 流程图</h2>
    <pre>flowchart TD
  A[进入映射配置页] --> B[GET /match/result]
  B --> C[构造原始字段和目标字段候选项]</pre>
    <h2>5.2 时序图</h2>
    <pre>sequenceDiagram
  participant U as 用户
  participant FE as 前端
  U->>FE: 打开转化历史映射配置</pre>
    <h2>5.3 普通代码块</h2>
    <pre># Release Notes

- This Markdown-looking block is documentation source.
- It should stay as source text on an ordinary HTML page.</pre>
  </main>
</body>
</html>`
      }));

      const page = await env.context.newPage();
      const diagnostics = collectPageDiagnostics(page);
      await page.goto(wikiUrl, { waitUntil: "domcontentloaded" });

      await expect(page.locator("#nolia-reader-root")).toHaveCount(0);
      await expect(page.locator("#nolia-inline-reader-root")).toHaveCount(0);
      await expect(page.getByText("页面树结构 2026-进行中")).toBeVisible();
      await expect(page.locator(".nolia-mermaid-render .mermaid-block svg")).toHaveCount(2, { timeout: 30_000 });
      await expect(page.locator(".wiki-content pre")).toHaveCount(1);
      await expect(page.locator(".wiki-content pre")).toContainText("Release Notes");
      expect(diagnostics.errors).toEqual([]);
    } finally {
      await env.close();
    }
  });

  test("renders Mermaid snippets that appear after the original page has loaded", async () => {
    const env = await launchExtension();
    try {
      const dynamicUrl = "https://docs.example.test/pages/dynamic-mermaid";
      await env.context.route(dynamicUrl, (route) => route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html>
<html>
<head><title>Dynamic Mermaid Fixture</title></head>
<body>
  <aside>原网页目录仍然存在</aside>
  <main class="wiki-content">
    <h1>动态 Wiki 页面</h1>
    ${Array.from({ length: 18 }, (_, index) => `<p>普通正文段落 ${index + 1}</p>`).join("\n")}
    <div id="diagram-slot"></div>
  </main>
  <script>
    setTimeout(() => {
      const pre = document.createElement("pre");
      pre.textContent = "flowchart TD\\n  Start[开始] --> End[结束]";
      document.getElementById("diagram-slot").append(pre);
    }, 250);
  </script>
</body>
</html>`
      }));

      const page = await env.context.newPage();
      const diagnostics = collectPageDiagnostics(page);
      await page.goto(dynamicUrl, { waitUntil: "domcontentloaded" });

      await expect(page.locator("#nolia-reader-root")).toHaveCount(0);
      await expect(page.locator("#nolia-inline-reader-root")).toHaveCount(0);
      await expect(page.getByText("原网页目录仍然存在")).toBeVisible();
      await expect(page.locator(".nolia-mermaid-render .mermaid-block svg")).toHaveCount(1, { timeout: 30_000 });
      expect(await canScrollWindow(page)).toBe(true);
      expect(diagnostics.errors).toEqual([]);
    } finally {
      await env.close();
    }
  });

  test("renders Mermaid manually when auto-render is disabled", async () => {
    const env = await launchExtension();
    try {
      env.extensionId = await extensionIdFromManifest(env.context);
      await setExtensionSettings(env.context, env.extensionId, { autoRender: false });

      const manualUrl = "https://docs.example.test/pages/manual-mermaid";
      await env.context.route(manualUrl, (route) => route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html>
<html>
<head><title>Manual Mermaid Fixture</title></head>
<body>
  <main class="wiki-content">
    <h1>手动 Mermaid 页面</h1>
    <pre>sequenceDiagram
  participant U as 用户
  participant API as 接口
  U->>API: 查询状态</pre>
  </main>
</body>
</html>`
      }));

      const page = await env.context.newPage();
      const diagnostics = collectPageDiagnostics(page);
      await page.goto(manualUrl, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".nolia-mermaid-render")).toHaveCount(0);

      const serviceWorker = await wakeServiceWorker(env.context, env.extensionId);
      const status = await sendContentMessageToPage(serviceWorker, page, { type: "content:status" });
      expect((status as { mermaidCandidates?: boolean }).mermaidCandidates).toBe(true);
      await sendContentMessageToPage(serviceWorker, page, { type: "content:enhanceMermaid" });

      await expect(page.locator("#nolia-reader-root")).toHaveCount(0);
      await expect(page.locator("#nolia-inline-reader-root")).toHaveCount(0);
      await expect(page.locator(".nolia-mermaid-render .mermaid-block svg")).toHaveCount(1, { timeout: 30_000 });
      expect(diagnostics.errors).toEqual([]);
    } finally {
      await env.close();
    }
  });

  test("keeps long Markdown documents scrollable in inline and full reader surfaces", async () => {
    const env = await launchExtension();
    try {
      const longMarkdownUrl = "https://raw.githubusercontent.com/nolia-reader/qa/main/long-scroll.md";
      await env.context.route(longMarkdownUrl, (route) => route.fulfill({
        status: 200,
        contentType: "text/plain; charset=utf-8",
        body: [
          "# Long Scroll Document",
          "",
          ...Array.from({ length: 70 }, (_, index) => [
            `## Section ${index + 1}`,
            "",
            `Paragraph ${index + 1} keeps this Markdown document taller than the viewport so vertical scrolling can be verified.`,
            "",
            "- First item",
            "- Second item",
            ""
          ].join("\n"))
        ].join("\n")
      }));

      const page = await env.context.newPage();
      const diagnostics = collectPageDiagnostics(page);
      await page.setViewportSize({ width: 1180, height: 760 });
      await page.goto(longMarkdownUrl, { waitUntil: "domcontentloaded" });

      await expect(page.locator("#nolia-inline-reader-root")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("#nolia-reader-root")).toHaveCount(0);
      await expect(page.locator(".markdown-body h1").first()).toHaveText("Long Scroll Document");
      expect(await canScrollWindow(page)).toBe(true);
      expect(await hasNoDocumentHorizontalOverflow(page)).toBe(true);

      await page.getByRole("button", { name: /Open reader|打开阅读器/ }).click();
      await expect(page.locator("#nolia-reader-root")).toBeVisible({ timeout: 20_000 });
      expect(await canScrollWindow(page)).toBe(true);
      expect(await hasNoDocumentHorizontalOverflow(page)).toBe(true);
      expect(diagnostics.errors).toEqual([]);
    } finally {
      await env.close();
    }
  });

  test("converts a normal article through the popup and keeps the flow understandable", async () => {
    const env = await launchExtension();
    try {
      env.extensionId = await extensionIdFromManifest(env.context);
      const articleUrl = "https://raw.githubusercontent.com/nolia-reader/qa/main/article.html";
      await routeArticleFixture(env.context, articleUrl);
      const article = await env.context.newPage();
      const diagnostics = collectPageDiagnostics(article);
      await article.setViewportSize({ width: 1180, height: 820 });
      await article.goto(articleUrl, { waitUntil: "domcontentloaded" });
      await article.evaluate(() => {
        document.documentElement.style.overflow = "hidden";
        document.documentElement.style.height = "100vh";
        document.body.style.overflow = "hidden";
        document.body.style.height = "100vh";
      });

      const popup = await openPopupForActiveTab(env.context, env.extensionId);
      await expect(popup.locator(".popup-brand")).toContainText("Nolia Reader");
      await expect(popup.locator("header p")).toContainText(/Current page|127\.0\.0\.1/);
      await expect(popup.locator(".status-box strong")).toHaveText(/not detected|未识别|Markdown detected|已检测/);
      await popup.screenshot({ path: "test-results/ui-popup.png", fullPage: true });
      await popup.close();

      const serviceWorker = await wakeServiceWorker(env.context, env.extensionId);
      await sendContentMessageToPage(serviceWorker, article, { type: "content:convert" });

      await expect(article.locator("#nolia-reader-root")).toBeVisible({ timeout: 20_000 });
      await expect(article.locator(".markdown-body")).toContainText("Article Heading");
      await expect(article.locator(".markdown-body")).toContainText("A focused article paragraph");
      await expect(article.locator(".frontmatter-panel")).toContainText(articleUrl);
      expect(await canScrollWindow(article)).toBe(true);
      expect(await hasNoDocumentHorizontalOverflow(article)).toBe(true);
      expect(diagnostics.errors).toEqual([]);
    } finally {
      await env.close();
    }
  });

  test("renders GitHub blob Markdown from the raw source instead of the repository chrome", async () => {
    const env = await launchExtension();
    try {
      env.extensionId = await extensionIdFromManifest(env.context);
      const githubBlobUrl = "https://github.com/github/spec-kit/blob/main/SUPPORT.md";
      const githubRawUrl = "https://raw.githubusercontent.com/github/spec-kit/main/SUPPORT.md";
      await routeGithubBlobFixture(env.context, githubBlobUrl, githubRawUrl);

      const page = await env.context.newPage();
      const diagnostics = collectPageDiagnostics(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(githubBlobUrl, { waitUntil: "domcontentloaded" });

      const serviceWorker = await wakeServiceWorker(env.context, env.extensionId);
      await sendContentMessageToPage(serviceWorker, page, { type: "content:render", forced: true });

      await expect(page.locator("#nolia-inline-reader-root")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("#nolia-reader-root")).toHaveCount(0);
      await expect(page.getByText("Repository navigation Code Issues 253 Pull requests 158")).toBeVisible();
      await expect(page.locator("aside")).toContainText("SUPPORT.md");
      await expect(page.locator(".nolia-inline-toolbar")).toBeVisible();
      await expect(page.locator("#nolia-inline-reader-root .markdown-body h1").first()).toHaveText("Support");
      await expect(page.locator("#nolia-inline-reader-root .markdown-body")).toContainText("How to get help");
      await expect(page.locator("#nolia-inline-reader-root .markdown-body")).not.toContainText("Repository navigation");
      await expect(page.locator("#nolia-inline-reader-root .markdown-body")).not.toContainText("Pull requests 158");
      await page.getByRole("button", { name: /Source|原文/ }).click();
      await expect(page.locator("#nolia-inline-reader-root .source-view")).toContainText("# Support");
      await expect(page.locator("#nolia-inline-reader-root .source-view")).not.toContainText("Skip to content");
      await page.getByRole("button", { name: /Open reader|打开阅读器/ }).click();
      await expect(page.locator("#nolia-reader-root")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(".document-header h1")).toHaveText("Support");
      expect(await hasNoDocumentHorizontalOverflow(page)).toBe(true);
      expect(diagnostics.errors).toEqual([]);
    } finally {
      await env.close();
    }
  });

  test("renders GitHub repository README from raw Markdown instead of converting the repo page", async () => {
    const env = await launchExtension();
    try {
      env.extensionId = await extensionIdFromManifest(env.context);
      const githubRepoUrl = "https://github.com/github/spec-kit";
      const githubReadmeRawUrl = "https://raw.githubusercontent.com/github/spec-kit/main/README.md";
      await routeGithubRepositoryFixture(env.context, githubRepoUrl, githubReadmeRawUrl);

      const page = await env.context.newPage();
      const diagnostics = collectPageDiagnostics(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(githubRepoUrl, { waitUntil: "domcontentloaded" });

      const serviceWorker = await wakeServiceWorker(env.context, env.extensionId);
      await sendContentMessageToPage(serviceWorker, page, { type: "content:convert" });

      await expect(page.locator("#nolia-reader-root")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(".document-header h1")).toHaveText("🌱 Spec Kit");
      await expect(page.locator(".markdown-body h1").first()).toHaveText("🌱 Spec Kit");
      await expect(page.locator(".markdown-body pre[data-code-block='true']").first()).toContainText("uv tool install specify-cli");
      await expect(page.locator(".callout")).toContainText("Community contributions");
      await expect(page.locator(".markdown-body details")).toContainText("Click to expand");
      await expect(page.locator(".markdown-body")).not.toContainText("Repository navigation");
      await expect(page.locator(".markdown-body")).not.toContainText("Pull requests 158");
      await page.getByRole("button", { name: /Source|原文/ }).click();
      await expect(page.locator(".source-view")).toContainText("<h1>🌱 Spec Kit</h1>");
      await expect(page.locator(".source-view")).toContainText("```bash");
      await expect(page.locator(".source-view")).not.toContainText("Skip to content");
      expect(await hasNoDocumentHorizontalOverflow(page)).toBe(true);
      expect(diagnostics.errors).toEqual([]);
    } finally {
      await env.close();
    }
  });

  test("renders GitHub repository README inline by default and preserves repository chrome", async () => {
    const env = await launchExtension();
    try {
      env.extensionId = await extensionIdFromManifest(env.context);
      const githubRepoUrl = "https://github.com/github/spec-kit";
      const githubReadmeRawUrl = "https://raw.githubusercontent.com/github/spec-kit/main/README.md";
      await routeGithubRepositoryFixture(env.context, githubRepoUrl, githubReadmeRawUrl);

      const page = await env.context.newPage();
      const diagnostics = collectPageDiagnostics(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(githubRepoUrl, { waitUntil: "domcontentloaded" });

      const serviceWorker = await wakeServiceWorker(env.context, env.extensionId);
      await sendContentMessageToPage(serviceWorker, page, { type: "content:render", forced: true });

      await expect(page.locator("#nolia-inline-reader-root")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("#nolia-reader-root")).toHaveCount(0);
      await expect(page.getByText("Repository navigation Code Issues 253 Pull requests 158")).toBeVisible();
      await expect(page.locator("aside")).toContainText("README.md");
      await expect(page.locator(".nolia-inline-toolbar")).toBeVisible();
      await expect(page.locator("#nolia-inline-reader-root .markdown-body h1").first()).toHaveText("🌱 Spec Kit");
      await expect(page.locator("#nolia-inline-reader-root .markdown-body pre[data-code-block='true']").first()).toContainText("uv tool install specify-cli");
      await expect(page.locator("#nolia-inline-reader-root .callout")).toContainText("Community contributions");
      await expect(page.locator("#nolia-inline-reader-root .markdown-body details")).toContainText("Click to expand");
      await expect(page.locator("#nolia-inline-reader-root .markdown-body")).not.toContainText("Repository navigation");
      await expect(page.locator("#nolia-inline-reader-root .markdown-body")).not.toContainText("Pull requests 158");
      await page.getByRole("button", { name: /Source|原文/ }).click();
      await expect(page.locator("#nolia-inline-reader-root .source-view")).toContainText("<h1>🌱 Spec Kit</h1>");
      await expect(page.locator("#nolia-inline-reader-root .source-view")).toContainText("```bash");
      await expect(page.locator("#nolia-inline-reader-root .source-view")).not.toContainText("Skip to content");
      expect(await hasNoDocumentHorizontalOverflow(page)).toBe(true);
      expect(diagnostics.errors).toEqual([]);
    } finally {
      await env.close();
    }
  });

  test("options page persists settings and remains clean on desktop and narrow layouts", async () => {
    const env = await launchExtension();
    try {
      env.extensionId = await extensionIdFromManifest(env.context);
      const options = await env.context.newPage();
      const diagnostics = collectPageDiagnostics(options);
      await options.setViewportSize({ width: 1160, height: 860 });
      await options.goto(`chrome-extension://${env.extensionId}/index.html`, { waitUntil: "domcontentloaded" });

      await expect(options.locator(".brand")).toContainText("Nolia Reader");
      await expect(options.getByRole("heading", { name: /Settings|设置/ })).toBeVisible();
      await expect(options.locator("#appearance")).toBeVisible();
      await options.screenshot({ path: "test-results/ui-options-desktop.png", fullPage: true });

      await options.getByLabel("Language").selectOption("zh-CN");
      await expect(options.getByRole("heading", { name: "设置" })).toBeVisible();
      await options.getByLabel("主题").selectOption("dark");
      await options.getByLabel("内容宽度").selectOption("wide");

      const settings = await getSettingsFromExtensionPage(options);
      expect(settings.locale).toBe("zh-CN");
      expect(settings.theme).toBe("dark");
      expect(settings.contentWidth).toBe("wide");

      await options.setViewportSize({ width: 390, height: 844 });
      expect(await hasNoDocumentHorizontalOverflow(options)).toBe(true);
      await options.screenshot({ path: "test-results/ui-options-mobile.png", fullPage: true });
      expect(diagnostics.errors).toEqual([]);
    } finally {
      await env.close();
    }
  });
});

async function launchExtension(): Promise<{
  context: BrowserContext;
  extensionId: string;
  close: () => Promise<void>;
}> {
  expect(existsSync(path.join(extensionPath, "manifest.json")), `Missing built extension at ${extensionPath}`).toBe(true);

  const userDataDir = await mkdtemp(path.join(tmpdir(), "nolia-reader-e2e-"));
  const args = [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    "--no-first-run",
    "--no-default-browser-check"
  ];
  const preferredChannel = process.env.NOLIA_E2E_CHANNEL || "";

  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: preferredChannel || undefined,
      headless: false,
      args
    });
  } catch (error) {
    if (!preferredChannel) throw error;
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args
    });
  }

  return {
    context,
    extensionId: "",
    close: async () => {
      await context?.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  };
}

async function extensionIdFromContentPage(page: Page): Promise<string> {
  const href = await page.locator("link[data-nolia-reader-css]").first().getAttribute("href");
  const id = href ? new URL(href).host : "";
  if (!id) throw new Error("Unable to derive extension id from injected content assets");
  return id;
}

async function extensionIdFromManifest(context: BrowserContext): Promise<string> {
  const rawUrl = "https://raw.githubusercontent.com/nolia-reader/qa/main/id-probe.md";
  await context.route(rawUrl, (route) => route.fulfill({
    status: 200,
    contentType: "text/plain; charset=utf-8",
    body: "# ID probe\n"
  }));
  const page = await context.newPage();
  try {
    await page.goto(rawUrl, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#nolia-inline-reader-root")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("#nolia-reader-root")).toHaveCount(0);
      return await extensionIdFromContentPage(page);
  } finally {
    await page.close();
  }
}

async function wakeServiceWorker(context: BrowserContext, extensionId: string): Promise<Worker> {
  const existing = context.serviceWorkers().find((worker) => new URL(worker.url()).host === extensionId);
  if (existing) return existing;
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/index.html`, { waitUntil: "domcontentloaded" });
    return context.serviceWorkers().find((worker) => new URL(worker.url()).host === extensionId)
      ?? await context.waitForEvent("serviceworker", {
        timeout: 20_000,
        predicate: (worker) => new URL(worker.url()).host === extensionId
      });
  } finally {
    await page.close();
  }
}

async function routeMarkdownFixture(context: BrowserContext) {
  const markdown = await readFile("tests/fixtures/sample.md", "utf8");
  await context.route(rawMarkdownUrl, (route) => route.fulfill({
    status: 200,
    contentType: "text/plain; charset=utf-8",
    body: markdown
  }));
  await context.route("https://placehold.co/**", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: transparentPng
  }));
}

async function routeArticleFixture(context: BrowserContext, articleUrl: string) {
  await context.route(articleUrl, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html>
<html>
<head>
  <title>Readable Article Fixture</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <nav>Navigation that should not dominate the conversion</nav>
  <main>
    <article>
      <h1>Article Heading</h1>
      <p>A focused article paragraph with <strong>important</strong> content for Markdown conversion.</p>
      <h2>Details</h2>
      <ul>
        <li>First useful point</li>
        <li>Second useful point</li>
      </ul>
      <pre><code>npm run verify</code></pre>
      <h2>Long Body</h2>
      ${Array.from({ length: 24 }, (_, index) => `<p>Extended article paragraph ${index + 1} keeps the converted reader taller than the viewport so window scrolling can be verified after the source page locked body scrolling.</p>`).join("\n")}
    </article>
  </main>
</body>
</html>`
  }));
}

async function routeGithubBlobFixture(context: BrowserContext, blobUrl: string, rawUrl: string) {
  await context.route(blobUrl, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html>
<html>
<head>
  <title>spec-kit/SUPPORT.md at main · github/spec-kit</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <header>Repository navigation Code Issues 253 Pull requests 158</header>
  <aside>Files .github docs src tests README.md SECURITY.md SUPPORT.md</aside>
  <main>
    <nav>Breadcrumbs spec-kit / SUPPORT.md</nav>
    <a href="${rawUrl}">Raw</a>
    <article class="markdown-body">
      <h1>Support</h1>
      <h2>How to get help</h2>
      <p>Please search existing issues and discussions before creating new ones.</p>
    </article>
  </main>
</body>
</html>`
  }));
  await context.route(rawUrl, (route) => route.fulfill({
    status: 200,
    contentType: "text/plain; charset=utf-8",
    body: [
      "# Support",
      "",
      "## How to get help",
      "",
      "Please search existing issues and discussions before creating new ones.",
      "",
      "- Review the README for getting started instructions.",
      "- Ask in GitHub Discussions for questions.",
      "",
      "## Project Status",
      "",
      "Spec Kit is under active development."
    ].join("\n")
  }));
}

async function routeGithubRepositoryFixture(context: BrowserContext, repoUrl: string, readmeRawUrl: string) {
  await context.route(repoUrl, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html>
<html>
<head>
  <title>GitHub - github/spec-kit: Toolkit to help you get started with Spec-Driven Development</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <header>Repository navigation Code Issues 253 Pull requests 158</header>
  <aside>Files .github docs src tests README.md SECURITY.md SUPPORT.md</aside>
  <main>
    <a href="/github/spec-kit/blob/main/README.md">README.md</a>
    <article class="markdown-body">
      <h1>Toolkit to help you get started with Spec-Driven Development</h1>
      <p>This is rendered GitHub README HTML that should not be converted directly.</p>
    </article>
  </main>
</body>
</html>`
  }));
  await context.route(readmeRawUrl, (route) => route.fulfill({
    status: 200,
    contentType: "text/plain; charset=utf-8",
    body: [
      "<div align=\"center\">",
      "  <h1>🌱 Spec Kit</h1>",
      "</div>",
      "",
      "## ⚡ Get Started",
      "",
      "```bash",
      "uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z",
      "```",
      "",
      "> [!NOTE]",
      "> Community contributions are independently created and maintained.",
      "",
      "<details>",
      "<summary>Click to expand the detailed step-by-step walkthrough</summary>",
      "",
      "```bash",
      "specify init my-project --integration copilot",
      "```",
      "",
      "</details>"
    ].join("\n")
  }));
}

async function mockDownloads(serviceWorker: Worker) {
  await serviceWorker.evaluate(() => {
    const scope = globalThis as unknown as {
      __noliaReaderMockDownloads: chrome.downloads.DownloadOptions[];
    };
    scope.__noliaReaderMockDownloads = [];
    chrome.downloads.download = ((options: chrome.downloads.DownloadOptions, callback?: (downloadId: number) => void) => {
      scope.__noliaReaderMockDownloads.push(options);
      const id = scope.__noliaReaderMockDownloads.length;
      callback?.(id);
      return Promise.resolve(id);
    }) as typeof chrome.downloads.download;
  });
}

async function readMockDownloads(serviceWorker: Worker): Promise<chrome.downloads.DownloadOptions[]> {
  return serviceWorker.evaluate(() => {
    const scope = globalThis as unknown as {
      __noliaReaderMockDownloads?: chrome.downloads.DownloadOptions[];
    };
    return scope.__noliaReaderMockDownloads ?? [];
  });
}

async function sendContentMessageToPage(serviceWorker: Worker, page: Page, message: unknown): Promise<unknown> {
  await page.bringToFront();
  await page.waitForLoadState("domcontentloaded");
  const targetUrl = page.url();
  return serviceWorker.evaluate(async ({ payload, targetUrl }) => {
    const tabs = await chrome.tabs.query({});
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs.find((candidate) => candidate.url === targetUrl) ?? activeTabs[0];
    if (!tab?.id) {
      throw new Error(`No tab found for content message target: ${targetUrl}`);
    }
    try {
      return await chrome.tabs.sendMessage(tab.id, payload);
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["assets/content-loader.js"]
      });
      return await chrome.tabs.sendMessage(tab.id, payload);
    }
  }, { payload: message, targetUrl });
}

function decodeDataUrl(value: string): string {
  const match = value.match(/^data:([^,]*),(.*)$/);
  if (!match) return value;
  return match[1].includes(";base64")
    ? Buffer.from(match[2], "base64").toString("utf8")
    : decodeURIComponent(match[2]);
}

async function openPopupForActiveTab(context: BrowserContext, extensionId: string): Promise<Page> {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 560 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
  return popup;
}

async function getSettingsFromExtensionPage(page: Page) {
  const result = await page.evaluate(() => chrome.runtime.sendMessage({ type: "settings:get" }));
  if (!result || typeof result !== "object" || !("response" in result)) {
    throw new Error("Unable to read settings from extension page");
  }
  return (result as { response: { locale: string; theme: string; contentWidth: string } }).response;
}

async function setExtensionSettings(context: BrowserContext, extensionId: string, patch: Record<string, unknown>) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/index.html`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate((nextPatch) => chrome.runtime.sendMessage({ type: "settings:set", payload: nextPatch }), patch);
    if (!result || typeof result !== "object" || !("ok" in result) || !(result as { ok: boolean }).ok) {
      throw new Error("Unable to update extension settings");
    }
  } finally {
    await page.close();
  }
}

function collectPageDiagnostics(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  return { errors };
}

async function hasNoDocumentHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
}

async function canScrollWindow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    window.scrollTo(0, 0);
    const before = window.scrollY;
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY > before;
  });
}
