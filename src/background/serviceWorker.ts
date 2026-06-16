import { browserApi } from "../shared/browser";
import { sendContentMessage } from "../shared/contentBridge";
import type { ExtensionMessage } from "../shared/messages";
import { getSettings, patchSettings } from "../shared/settingsStore";
import { syncAllowedDomainContentScripts } from "./dynamicContentScripts";
import { downloadHtml, downloadMarkdown, downloadOfflineZip } from "./downloads";

browserApi.runtime.onInstalled.addListener(() => {
  browserApi.contextMenus.create({
    id: "nolia-reader-render",
    title: "Open Markdown viewer",
    contexts: ["page"]
  });
  browserApi.contextMenus.create({
    id: "nolia-reader-mermaid",
    title: "Render Mermaid diagrams",
    contexts: ["page", "selection"]
  });
  browserApi.contextMenus.create({
    id: "nolia-reader-convert",
    title: "Convert page to Markdown",
    contexts: ["page", "selection"]
  });
  void syncAllowedDomainContentScriptsFromStore();
});

browserApi.runtime.onStartup?.addListener(() => {
  void syncAllowedDomainContentScriptsFromStore();
});

browserApi.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "nolia-reader-render") {
    void sendContentMessage(tab.id, { type: "content:render", forced: true, surface: "reader" });
  }
  if (info.menuItemId === "nolia-reader-mermaid") {
    void sendContentMessage(tab.id, { type: "content:enhanceMermaid" });
  }
  if (info.menuItemId === "nolia-reader-convert") {
    void sendContentMessage(tab.id, { type: "content:convert" });
  }
});

browserApi.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  void handleMessage(message)
    .then((response) => sendResponse({ ok: true, response }))
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case "settings:get":
      return getSettings();
    case "settings:set":
      return patchAndSyncSettings(message.payload);
    case "settings:openOptions":
      await browserApi.runtime.openOptionsPage();
      return { status: "opened" };
    case "markdown:download":
      await downloadMarkdown(message.payload.document);
      return { status: "completed" };
    case "export:html":
      await downloadHtml(message.payload.document, message.payload.html, message.payload.css);
      return { status: "completed" };
    case "export:offlineZip":
      await downloadOfflineZip(message.payload.document, message.payload.html, message.payload.css, message.payload.assets);
      return { status: "completed" };
    case "permissions:requestHost":
      return browserApi.permissions.request({ origins: [`${message.payload.origin}/*`] });
    case "domain:allowCurrent": {
      const current = await getSettings();
      return patchAndSyncSettings({
        allowDomains: unique([...current.allowDomains, message.payload.hostname]),
        blockDomains: current.blockDomains.filter((host) => host !== message.payload.hostname)
      });
    }
    case "domain:blockCurrent": {
      const current = await getSettings();
      return patchAndSyncSettings({
        blockDomains: unique([...current.blockDomains, message.payload.hostname]),
        allowDomains: current.allowDomains.filter((host) => host !== message.payload.hostname)
      });
    }
    case "markdown:renderCurrentTab":
    case "page:convertToMarkdown":
      return { status: "forward-only" };
    default:
      return undefined;
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function patchAndSyncSettings(patch: Parameters<typeof patchSettings>[0]) {
  const settings = await patchSettings(patch);
  await syncAllowedDomainContentScripts(settings);
  return settings;
}

async function syncAllowedDomainContentScriptsFromStore() {
  await syncAllowedDomainContentScripts(await getSettings());
}
