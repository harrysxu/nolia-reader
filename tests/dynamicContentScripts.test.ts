import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  allowedDomainMatchPatternsForTest,
  filterPermittedMatchesForTest,
  normalizeAllowedDomainForTest
} from "../src/background/dynamicContentScripts";
import { hostPermissionPatternForUrl } from "../src/shared/url";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("allowed domain content script registration helpers", () => {
  it("normalizes saved host values", () => {
    expect(normalizeAllowedDomainForTest("https://docs.example.com/path/readme.md")).toBe("docs.example.com");
    expect(normalizeAllowedDomainForTest("http://localhost:5173/readme.md")).toBe("localhost");
  });

  it("creates explicit http and https match patterns", () => {
    expect(allowedDomainMatchPatternsForTest("docs.example.com")).toEqual([
      "https://docs.example.com/*",
      "http://docs.example.com/*"
    ]);
  });

  it("rejects wildcard domains for dynamic registration", () => {
    expect(allowedDomainMatchPatternsForTest("*.example.com")).toEqual([]);
  });

  it("filters dynamic matches to granted host permissions", async () => {
    const contains = vi.fn(async ({ origins }: { origins: string[] }) => origins[0] === "https://docs.example.com/*");
    globalThis.chrome = { permissions: { contains } } as unknown as typeof chrome;

    await expect(filterPermittedMatchesForTest([
      "https://docs.example.com/*",
      "http://docs.example.com/*"
    ])).resolves.toEqual(["https://docs.example.com/*"]);
  });
});

describe("hostPermissionPatternForUrl", () => {
  it("creates origin-scoped permission patterns", () => {
    expect(hostPermissionPatternForUrl("https://docs.example.com/path/readme.md")).toBe("https://docs.example.com/*");
    expect(hostPermissionPatternForUrl("file:///home/example/readme.md")).toBe("file:///*");
  });
});
