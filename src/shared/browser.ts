export type ExtensionApi = typeof chrome;

export const browserApi: ExtensionApi = globalThis.chrome;

export function isExtensionRuntimeAvailable(): boolean {
  return Boolean(globalThis.chrome?.runtime?.id);
}

export function sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    browserApi.runtime.sendMessage(message, (response) => {
      const error = browserApi.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response as TResponse);
    });
  });
}

export function queryActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  return browserApi.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
}

export function getRuntimeUrl(path: string): string {
  return browserApi.runtime.getURL(path);
}
