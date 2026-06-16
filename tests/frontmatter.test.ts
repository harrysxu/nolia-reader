import { describe, expect, it } from "vitest";

import { splitFrontmatter } from "../src/renderer/frontmatter";

describe("splitFrontmatter", () => {
  it("extracts yaml frontmatter", () => {
    const result = splitFrontmatter("---\ntitle: Hello\ntags:\n  - test\n---\n# Body");
    expect(result.frontmatter.title).toBe("Hello");
    expect(result.body).toBe("# Body");
  });

  it("keeps body when there is no frontmatter", () => {
    const result = splitFrontmatter("# Body");
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("# Body");
  });
});
