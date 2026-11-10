import { describe, it, expect, vi } from "vitest";

vi.mock("../browser.js", () => ({
  openSession: vi.fn(),
  getPage: vi.fn(),
  getBrowser: vi.fn(),
  closeSession: vi.fn(),
  getSessionCount: vi.fn().mockReturnValue(0),
}));

vi.mock("../api.js", () => ({
  getApiKey: vi.fn().mockReturnValue("test-api-key"),
  apiRequest: vi.fn(),
  formatResult: vi.fn((data: unknown) => JSON.stringify(data)),
}));

const { createServer } = await import("../server.js");

type Annotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

const tools = (createServer() as any)._registeredTools as Record<
  string,
  { annotations?: Annotations }
>;

describe("tool annotations", () => {
  it("registers 21 tools", () => {
    expect(Object.keys(tools)).toHaveLength(21);
  });

  it("gives every tool readOnlyHint and destructiveHint", () => {
    for (const [name, tool] of Object.entries(tools)) {
      expect(typeof tool.annotations?.readOnlyHint, name).toBe("boolean");
      expect(typeof tool.annotations?.destructiveHint, name).toBe("boolean");
    }
  });

  it("never marks a read-only tool destructive", () => {
    for (const [name, tool] of Object.entries(tools)) {
      if (tool.annotations?.readOnlyHint) {
        expect(tool.annotations.destructiveHint, name).toBe(false);
      }
    }
  });

  it("marks page actions destructive and fetches read-only", () => {
    for (const name of ["spider_browser_click", "spider_browser_fill", "spider_browser_evaluate", "spider_ai_browser"]) {
      expect(tools[name].annotations?.destructiveHint, name).toBe(true);
    }
    for (const name of ["spider_crawl", "spider_scrape", "spider_search", "spider_get_credits"]) {
      expect(tools[name].annotations?.readOnlyHint, name).toBe(true);
    }
    expect(tools.spider_get_credits.annotations?.openWorldHint).toBe(false);
  });
});
