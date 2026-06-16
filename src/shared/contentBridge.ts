import { browserApi } from "./browser";
import type { ContentScriptMessage } from "./messages";

type ContentResponse<T> = T & { ok?: boolean; error?: string };

const LOADER_FILE = "assets/content-loader.js";

export async function sendContentMessage<TResponse = unknown>(tabId: number, message: ContentScriptMessage): Promise<ContentResponse<TResponse>> {
  try {
    return await browserApi.tabs.sendMessage(tabId, message) as ContentResponse<TResponse>;
  } catch {
    await injectContentLoader(tabId);
    return await browserApi.tabs.sendMessage(tabId, message) as ContentResponse<TResponse>;
  }
}

export async function injectContentLoader(tabId: number): Promise<void> {
  await browserApi.scripting.executeScript({
    target: { tabId },
    files: [LOADER_FILE]
  });
}
