import { createRoot, type Root } from "react-dom/client";
import React from "react";

import { detectMarkdownPage } from "./detector";
import { enhanceMermaidSnippets, hasMermaidSnippetCandidates } from "./mermaidEnhancer";
import { findHostedMarkdownMountTarget } from "./hostAdapters";
import { detectionFromHostedSource, isHostedMarkdownPreviewPage, resolveHostedMarkdownSource } from "./hostedMarkdown";
import { createMarkdownDocument } from "../renderer/documentFactory";
import { InlineMarkdownApp } from "../reader/InlineMarkdownApp";
import { ReaderApp } from "../reader/ReaderApp";
import { getSettings, saveSettings } from "../shared/settingsStore";
import type { ExtensionSettings } from "../shared/settings";
import type { ContentScriptMessage } from "../shared/messages";
import { getHostname } from "../shared/url";
import { copyText } from "../reader/clipboard";
import "highlight.js/styles/github.css";
import "../styles/reader.css";
import "../styles/markdown.css";
import "katex/dist/katex.min.css";

let mountedRoot: Root | undefined;
let inlineRoot: Root | undefined;
let originalBodyHtml = "";
let originalPageState: {
  bodyClassName: string;
  documentElementClassName: string;
  bodyStyle: string;
  documentElementStyle: string;
  noliaTheme?: string;
} | undefined;
let inlineRestoreTarget: {
  container: HTMLElement;
  html: string;
  className: string;
  style: string;
  noliaInlineHost?: string;
} | undefined;
let currentDocument: ReturnType<typeof createMarkdownDocument> | undefined;
let renderedSurface: "inline" | "reader" | undefined;
let lastRenderedSurface: "inline" | "reader" | undefined;
let runtimeReady = false;
let mermaidObserver: MutationObserver | undefined;
let mermaidRenderScheduled = false;

declare global {
  interface Window {
    __noliaReaderEnsureRuntime?: () => Promise<void>;
    __noliaReaderHandleMessage?: (message: unknown, sender?: chrome.runtime.MessageSender) => Promise<unknown>;
  }
}

window.__noliaReaderEnsureRuntime = ensureNoliaReaderRuntime;

export async function ensureNoliaReaderRuntime(): Promise<void> {
  if (!runtimeReady) {
    window.__noliaReaderHandleMessage = handleRuntimeMessage;
    runtimeReady = true;
    await maybeAutoRender();
  }
}

async function handleRuntimeMessage(message: unknown): Promise<unknown> {
  if (!isContentScriptMessage(message)) {
    return { ok: false, error: "Unsupported content message" };
  }
  if (message?.type === "content:render") {
    const rendered = await renderCurrent(Boolean(message.forced), message.surface ?? lastRenderedSurface ?? "auto");
    return { ok: true, rendered };
  }
  if (message?.type === "content:exit") {
    const restored = exitReader();
    return { ok: true, restored };
  }
  if (message?.type === "content:convert") {
    await renderConvertedPage();
    return { ok: true };
  }
  if (message?.type === "content:enhanceMermaid" || message?.type === "content:enhanceEmbedded") {
    const settings = await getSettings();
    const enhanced = await enhanceMermaidSnippets(document, settings);
    startMermaidSnippetObserver(settings);
    return { ok: true, enhanced };
  }
  if (message?.type === "content:copyMarkdown") {
    const source = currentDocument?.markdown ?? (await resolveMarkdownSource(true))?.markdown ?? "";
    await copyText(source, document);
    return { ok: true };
  }
  if (message?.type === "content:downloadMarkdown") {
    const source = await resolveMarkdownSource(true);
    const documentModel = currentDocument ?? (source ? createMarkdownDocument(
      source.markdown,
      source.detection,
      source.sourceUrl,
      { baseUrl: source.baseUrl, title: source.title }
    ) : undefined);
    if (documentModel) {
      await chrome.runtime.sendMessage({ type: "markdown:download", payload: { document: documentModel } });
      return { ok: true };
    }
    return { ok: false };
  }
  if (message?.type === "content:status") {
    const detection = detectMarkdownPage(document);
    if (isHostedMarkdownPreviewPage(location.href, document)) {
      detection.isMarkdown = true;
      detection.confidence = 1;
      detection.reason = Array.from(new Set([...detection.reason, "url-extension"]));
    }
    return {
      ok: true,
      detection,
      rendered: Boolean(mountedRoot || inlineRoot),
      renderedSurface,
      lastRenderedSurface,
      mermaidRendered: Boolean(document.querySelector(".nolia-mermaid-render")),
      mermaidCandidates: hasMermaidSnippetCandidates(document),
      embeddedCandidates: hasMermaidSnippetCandidates(document)
    };
  }
  return { ok: false, error: "Unsupported content message" };
}

function isContentScriptMessage(message: unknown): message is ContentScriptMessage {
  return Boolean(message && typeof message === "object" && "type" in message && typeof message.type === "string" && message.type.startsWith("content:"));
}

async function maybeAutoRender() {
  if (hasRenderedNoliaDocument()) return;
  const settings = await getSettings();
  const host = getHostname(location.href);
  if (!settings.autoRender || settings.blockDomains.includes(host)) return;
  const hostedMarkdownPreview = isHostedMarkdownPreviewPage(location.href, document);
  if (hostedMarkdownPreview && !settings.allowDomains.includes(host)) return;
  const detection = detectMarkdownPage(document);
  if (!hostedMarkdownPreview && (!detection.isMarkdown || !detection.rawText)) {
    await enhanceMermaidSnippets(document, settings);
    startMermaidSnippetObserver(settings);
    return;
  }
  if (!settings.allowDomains.includes(host) && !isTrustedAutoMarkdownDetection(detection.reason)) return;
  const source = await resolveMarkdownSource(false);
  if (!source?.markdown) return;
  await mountDocument(
    createMarkdownDocument(
      source.markdown,
      source.detection,
      source.sourceUrl,
      { baseUrl: source.baseUrl, title: source.title }
    ),
    settings,
    "auto"
  );
}

async function renderCurrent(forced: boolean, surface: "auto" | "inline" | "reader" = "auto"): Promise<boolean> {
  const settings = await getSettings();
  if (currentDocument) {
    await mountDocument(currentDocument, settings, surface);
    return true;
  }
  if (hasRenderedNoliaDocument()) {
    return true;
  }
  const source = await resolveMarkdownSource(forced);
  if (!source?.markdown) {
    const enhanced = await enhanceMermaidSnippets(document, settings);
    startMermaidSnippetObserver(settings);
    return enhanced > 0;
  }
  await mountDocument(
    createMarkdownDocument(
      source.markdown,
      source.detection,
      source.sourceUrl,
      { baseUrl: source.baseUrl, title: source.title }
    ),
    settings,
    surface
  );
  return true;
}

async function renderConvertedPage() {
  const settings = await getSettings();
  if (isHostedMarkdownPreviewPage(location.href, document)) {
    const hostedSource = await resolveHostedMarkdownSource(document);
    if (hostedSource) {
      await mountReader(
        createMarkdownDocument(
          hostedSource.markdown,
          detectionFromHostedSource(hostedSource),
          hostedSource.sourceUrl,
          { baseUrl: hostedSource.baseUrl, title: hostedSource.title }
        ),
        settings
      );
      return;
    }
  }
  const { convertCurrentPageToMarkdown } = await import("./pageExtractor");
  const converted = convertCurrentPageToMarkdown("balanced");
  await mountReader(
    createMarkdownDocument(converted.markdown, {
      isMarkdown: true,
      confidence: 1,
      reason: ["manual-action"],
      sourceKind: "manual",
      rawText: converted.markdown,
      contentType: document.contentType
    }, converted.sourceUrl),
    settings
  );
}

async function resolveMarkdownSource(forced: boolean) {
  if (isHostedMarkdownPreviewPage(location.href, document)) {
    const hostedSource = await resolveHostedMarkdownSource(document);
    if (hostedSource) {
      return {
        markdown: hostedSource.markdown,
        detection: detectionFromHostedSource(hostedSource),
        sourceUrl: hostedSource.sourceUrl,
        baseUrl: hostedSource.baseUrl,
        title: hostedSource.title
      };
    }
  }
  const detection = detectMarkdownPage(document, forced);
  if (!detection.rawText) {
    return undefined;
  }
  return {
    markdown: detection.rawText,
    detection,
    sourceUrl: location.href,
    baseUrl: location.href,
    title: undefined
  };
}

async function mountDocument(
  documentModel: ReturnType<typeof createMarkdownDocument>,
  settings: ExtensionSettings,
  surface: "auto" | "inline" | "reader"
) {
  if (surface !== "reader" && isHostedMarkdownPreviewPage(location.href, document)) {
    const target = findHostedMarkdownMountTarget(document, location.href);
    if (target) {
      await mountInlineReader(documentModel, settings, target.container);
      return;
    }
    if (surface === "inline") {
      return;
    }
  }
  if (surface !== "reader") {
    const rawContainer = findRawMarkdownPageContainer(document);
    if (rawContainer) {
      await mountInlineReader(documentModel, settings, rawContainer);
      return;
    }
  }
  await mountReader(documentModel, settings);
}

async function mountInlineReader(
  documentModel: ReturnType<typeof createMarkdownDocument>,
  settings: ExtensionSettings,
  container: HTMLElement
) {
  stopMermaidSnippetObserver();
  captureOriginalPageState();
  inlineRestoreTarget = {
    container,
    html: container.innerHTML,
    className: container.className,
    style: container.getAttribute("style") ?? "",
    noliaInlineHost: container.dataset.noliaInlineHost
  };
  currentDocument = documentModel;
  mountedRoot?.unmount();
  mountedRoot = undefined;
  const rootId = "nolia-inline-reader-root";
  let host = document.getElementById(rootId);
  inlineRoot?.unmount();
  inlineRoot = undefined;
  if (host) {
    host.remove();
  }
  container.innerHTML = "";
  container.dataset.noliaInlineHost = "true";
  const isWholePageInline = container === document.body;
  if (isWholePageInline) {
    document.documentElement.classList.remove("nolia-reader-fullscreen");
    document.body.classList.remove("nolia-reader-fullscreen");
    document.documentElement.classList.add("nolia-reader-inline-page");
    document.body.classList.add("nolia-reader-inline-page");
    document.body.style.setProperty("margin", "0", "important");
  }
  host = document.createElement("div");
  host.id = rootId;
  container.append(host);
  document.documentElement.dataset.noliaTheme = settings.theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : settings.theme;
  inlineRoot = createRoot(host);
  renderedSurface = "inline";
  lastRenderedSurface = "inline";
  inlineRoot.render(
    <React.StrictMode>
      <InlineMarkdownApp
        documentModel={documentModel}
        settings={settings}
        onClose={exitReader}
        onOpenReader={() => {
          void mountReader(documentModel, settings);
        }}
      />
    </React.StrictMode>
  );
}

async function mountReader(documentModel: ReturnType<typeof createMarkdownDocument>, settings: ExtensionSettings) {
  stopMermaidSnippetObserver();
  captureOriginalPageState();
  currentDocument = documentModel;
  inlineRoot?.unmount();
  inlineRoot = undefined;
  mountedRoot?.unmount();
  document.documentElement.dataset.noliaTheme = settings.theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : settings.theme;
  applyFullscreenReaderPageState();
  document.body.innerHTML = "";
  const host = document.createElement("div");
  host.id = "nolia-reader-root";
  document.body.append(host);
  mountedRoot = createRoot(host);
  renderedSurface = "reader";
  lastRenderedSurface = "reader";
  mountedRoot.render(
    <React.StrictMode>
      <ReaderApp
        documentModel={documentModel}
        settings={settings}
        onClose={exitReader}
        onSettingsChange={(nextSettings) => {
          void saveSettings(nextSettings);
        }}
      />
    </React.StrictMode>
  );
}

function captureOriginalPageState() {
  if (originalPageState || !document.body) {
    return;
  }
  originalBodyHtml = document.body.innerHTML;
  originalPageState = {
    bodyClassName: document.body.className,
    documentElementClassName: document.documentElement.className,
    bodyStyle: document.body.getAttribute("style") ?? "",
    documentElementStyle: document.documentElement.getAttribute("style") ?? "",
    noliaTheme: document.documentElement.dataset.noliaTheme
  };
}

function exitReader(): boolean {
  if (!document.body || !hasRenderedNoliaDocument()) {
    return false;
  }

  const surfaceToRestore = renderedSurface;
  inlineRoot?.unmount();
  inlineRoot = undefined;
  mountedRoot?.unmount();
  mountedRoot = undefined;
  renderedSurface = undefined;

  if (
    surfaceToRestore === "inline"
    && inlineRestoreTarget
    && inlineRestoreTarget.container.isConnected
    && inlineRestoreTarget.container !== document.body
  ) {
    inlineRestoreTarget.container.innerHTML = inlineRestoreTarget.html;
    inlineRestoreTarget.container.className = inlineRestoreTarget.className;
    restoreAttribute(inlineRestoreTarget.container, "style", inlineRestoreTarget.style);
    if (inlineRestoreTarget.noliaInlineHost === undefined) {
      delete inlineRestoreTarget.container.dataset.noliaInlineHost;
    } else {
      inlineRestoreTarget.container.dataset.noliaInlineHost = inlineRestoreTarget.noliaInlineHost;
    }
    restoreNoliaTheme();
    return true;
  }

  if (!originalPageState) {
    return true;
  }
  document.body.innerHTML = originalBodyHtml;
  document.body.className = originalPageState.bodyClassName;
  document.documentElement.className = originalPageState.documentElementClassName;
  restoreAttribute(document.body, "style", originalPageState.bodyStyle);
  restoreAttribute(document.documentElement, "style", originalPageState.documentElementStyle);
  restoreNoliaTheme();
  return true;
}

function restoreNoliaTheme() {
  if (originalPageState?.noliaTheme === undefined) {
    delete document.documentElement.dataset.noliaTheme;
  } else {
    document.documentElement.dataset.noliaTheme = originalPageState.noliaTheme;
  }
}

function restoreAttribute(element: HTMLElement, name: string, value: string) {
  if (value) {
    element.setAttribute(name, value);
  } else {
    element.removeAttribute(name);
  }
}

function applyFullscreenReaderPageState() {
  document.documentElement.classList.add("nolia-reader-fullscreen");
  document.body.classList.add("nolia-reader-fullscreen");
  for (const element of [document.documentElement, document.body]) {
    element.style.setProperty("display", "block", "important");
    element.style.setProperty("position", "static", "important");
    element.style.setProperty("height", "auto", "important");
    element.style.setProperty("min-height", "100%", "important");
    element.style.setProperty("max-height", "none", "important");
    element.style.setProperty("overflow-y", "auto", "important");
    element.style.setProperty("overflow-x", "hidden", "important");
    element.style.setProperty("transform", "none", "important");
  }
  document.body.style.setProperty("margin", "0", "important");
}

function hasRenderedNoliaDocument(): boolean {
  return Boolean(mountedRoot || inlineRoot || document.getElementById("nolia-reader-root") || document.getElementById("nolia-inline-reader-root"));
}

function startMermaidSnippetObserver(settings: ExtensionSettings) {
  if (mermaidObserver || settings.enableMermaid === false || hasRenderedNoliaDocument() || !document.body) {
    return;
  }
  mermaidObserver = new MutationObserver(() => {
    if (mermaidRenderScheduled) {
      return;
    }
    mermaidRenderScheduled = true;
    window.setTimeout(() => {
      mermaidRenderScheduled = false;
      if (!hasRenderedNoliaDocument()) {
        void enhanceMermaidSnippets(document, settings);
      }
    }, 300);
  });
  mermaidObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function stopMermaidSnippetObserver() {
  mermaidObserver?.disconnect();
  mermaidObserver = undefined;
  mermaidRenderScheduled = false;
}

function findRawMarkdownPageContainer(documentRef: Document): HTMLElement | undefined {
  if (documentRef.body?.dataset.noliaInlineHost === "true") {
    return documentRef.body;
  }
  if (documentRef.querySelector("#nolia-reader-root, #nolia-inline-reader-root")) {
    return undefined;
  }
  const contentType = documentRef.contentType || "";
  const body = documentRef.body;
  if (!body) {
    return undefined;
  }
  const singlePre = body.children.length === 1 && body.firstElementChild?.tagName.toLowerCase() === "pre";
  if (singlePre || body.children.length === 0 || /text\/(?:plain|(?:x-)?markdown)/i.test(contentType)) {
    return body;
  }
  return undefined;
}

function isTrustedAutoMarkdownDetection(reasons: string[]): boolean {
  return reasons.some((reason) => [
    "url-extension",
    "content-type",
    "known-raw-host",
    "markdown-heuristic"
  ].includes(reason));
}
