import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockPage = {
  url: vi.fn().mockResolvedValue("https://example.com"),
  title: vi.fn().mockResolvedValue("Example"),
  content: vi.fn().mockResolvedValue("<html><body>Hello</body></html>"),
  evaluate: vi.fn(),
  click: vi.fn(),
  fill: vi.fn(),
  screenshot: vi.fn().mockResolvedValue("base64screenshotdata"),
  waitForSelector: vi.fn(),
  waitForNavigation: vi.fn(),
  waitForNetworkIdle: vi.fn(),
};

const mockBrowser = {
  goto: vi.fn(),
  page: mockPage,
};

vi.mock("../browser.js", () => ({
  openSession: vi.fn().mockResolvedValue({
    sessionId: "test-session-id",
    browserType: "auto",
  }),
  getPage: vi.fn().mockReturnValue(mockPage),
  getBrowser: vi.fn().mockReturnValue(mockBrowser),
  closeSession: vi.fn(),
  getSessionCount: vi.fn().mockReturnValue(1),
}));

vi.mock("../api.js", () => ({
  getApiKey: vi.fn().mockReturnValue("test-api-key"),
  apiRequest: vi.fn(),
  formatResult: vi.fn((data: unknown) => JSON.stringify(data, null, 2)),
}));

const { createServer } = await import("../server.js");
const browserMocks = await import("../browser.js");

// ── Helpers ────────────────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}>;

function getToolHandler(server: ReturnType<typeof createServer>, name: string): ToolHandler {
  return async (args: Record<string, unknown>) => {
    const registeredTools = (server as any)._registeredTools as Record<
      string,
      { handler: ToolHandler }
    >;
    const tool = registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args) as any;
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("browser tool handlers", () => {
  let server: ReturnType<typeof createServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage.url.mockResolvedValue("https://example.com");
    mockPage.title.mockResolvedValue("Example");
    mockPage.content.mockResolvedValue("<html><body>Hello</body></html>");
    mockPage.screenshot.mockResolvedValue("base64screenshotdata");
    server = createServer();
  });

  describe("spider_browser_open", () => {
    it("calls openSession with correct args", async () => {
      const handler = getToolHandler(server, "spider_browser_open");
      const result = await handler({ browser: "firefox", stealth: 2 });

      expect(browserMocks.openSession).toHaveBeenCalledWith("test-api-key", {
        browser: "firefox",
        stealth: 2,
      });
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text!;
      expect(text).toContain("test-session-id");
    });

    it("returns isError on failure", async () => {
      vi.mocked(browserMocks.openSession).mockRejectedValueOnce(
        new Error("Max sessions")
      );
      const handler = getToolHandler(server, "spider_browser_open");
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Max sessions");
    });
  });

  describe("spider_browser_navigate", () => {
    it("uses getBrowser().goto() for smart retry", async () => {
      const handler = getToolHandler(server, "spider_browser_navigate");
      const result = await handler({
        session_id: "test-session-id",
        url: "https://example.com",
      });

      expect(browserMocks.getBrowser).toHaveBeenCalledWith("test-session-id");
      expect(mockBrowser.goto).toHaveBeenCalledWith("https://example.com");
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text!;
      expect(text).toContain("https://example.com");
    });

    it("returns isError on navigation failure", async () => {
      mockBrowser.goto.mockRejectedValueOnce(new Error("Navigation failed"));
      const handler = getToolHandler(server, "spider_browser_navigate");
      const result = await handler({
        session_id: "test-session-id",
        url: "https://bad.com",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Navigation failed");
    });
  });

  describe("spider_browser_click", () => {
    it("waits for selector with plain number timeout, then clicks", async () => {
      const handler = getToolHandler(server, "spider_browser_click");
      const result = await handler({
        session_id: "test-session-id",
        selector: "button.submit",
        timeout: 5000,
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith("button.submit", 5000);
      expect(mockPage.click).toHaveBeenCalledWith("button.submit");
      expect(result.isError).toBeUndefined();
    });

    it("uses default timeout of 10000", async () => {
      const handler = getToolHandler(server, "spider_browser_click");
      await handler({
        session_id: "test-session-id",
        selector: "#btn",
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith("#btn", 10000);
    });

    it("returns isError when element not found", async () => {
      mockPage.waitForSelector.mockRejectedValueOnce(
        new Error("Timeout waiting for selector")
      );
      const handler = getToolHandler(server, "spider_browser_click");
      const result = await handler({
        session_id: "test-session-id",
        selector: ".missing",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Timeout");
    });
  });

  describe("spider_browser_fill", () => {
    it("uses page.fill() instead of triple-click + type", async () => {
      const handler = getToolHandler(server, "spider_browser_fill");
      const result = await handler({
        session_id: "test-session-id",
        selector: "input[name='email']",
        value: "user@example.com",
        timeout: 5000,
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        "input[name='email']",
        5000
      );
      expect(mockPage.fill).toHaveBeenCalledWith(
        "input[name='email']",
        "user@example.com"
      );
      expect(result.isError).toBeUndefined();
      const text = result.content[0].text!;
      expect(text).toContain("16"); // value_length
    });
  });

  describe("spider_browser_screenshot", () => {
    it("returns base64 image directly from page.screenshot()", async () => {
      const handler = getToolHandler(server, "spider_browser_screenshot");
      const result = await handler({ session_id: "test-session-id" });

      expect(mockPage.screenshot).toHaveBeenCalledOnce();
      expect(result.content[0].type).toBe("image");
      expect(result.content[0].data).toBe("base64screenshotdata");
      expect(result.content[0].mimeType).toBe("image/png");
    });
  });

  describe("spider_browser_content", () => {
    it("returns HTML content by default", async () => {
      const handler = getToolHandler(server, "spider_browser_content");
      const result = await handler({ session_id: "test-session-id" });

      expect(mockPage.content).toHaveBeenCalledOnce();
      expect(mockPage.url).toHaveBeenCalled();
      expect(result.isError).toBeUndefined();
    });

    it("uses evaluate with string expression for text format", async () => {
      mockPage.evaluate.mockResolvedValueOnce("Hello world");
      const handler = getToolHandler(server, "spider_browser_content");
      const result = await handler({
        session_id: "test-session-id",
        format: "text",
      });

      expect(mockPage.evaluate).toHaveBeenCalledWith(
        'document.body.innerText || document.body.textContent || ""'
      );
      expect(result.isError).toBeUndefined();
    });
  });

  describe("spider_browser_evaluate", () => {
    it("evaluates string expression and returns result", async () => {
      mockPage.evaluate.mockResolvedValueOnce(42);
      const handler = getToolHandler(server, "spider_browser_evaluate");
      const result = await handler({
        session_id: "test-session-id",
        expression: "1 + 1",
      });

      expect(mockPage.evaluate).toHaveBeenCalledWith("1 + 1");
      expect(result.isError).toBeUndefined();
    });

    it("returns isError on evaluation failure", async () => {
      mockPage.evaluate.mockRejectedValueOnce(new Error("ReferenceError"));
      const handler = getToolHandler(server, "spider_browser_evaluate");
      const result = await handler({
        session_id: "test-session-id",
        expression: "undefinedVar",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ReferenceError");
    });
  });

  describe("spider_browser_wait_for", () => {
    it("waits for selector with plain number timeout", async () => {
      const handler = getToolHandler(server, "spider_browser_wait_for");
      const result = await handler({
        session_id: "test-session-id",
        selector: ".loaded",
        timeout: 5000,
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(".loaded", 5000);
      expect(result.isError).toBeUndefined();
    });

    it("waits for navigation with plain number timeout", async () => {
      const handler = getToolHandler(server, "spider_browser_wait_for");
      const result = await handler({
        session_id: "test-session-id",
        navigation: true,
        timeout: 15000,
      });

      expect(mockPage.waitForNavigation).toHaveBeenCalledWith(15000);
      expect(result.isError).toBeUndefined();
    });

    it("waits for network idle by default", async () => {
      const handler = getToolHandler(server, "spider_browser_wait_for");
      const result = await handler({ session_id: "test-session-id" });

      expect(mockPage.waitForNetworkIdle).toHaveBeenCalledWith(30000);
      expect(result.isError).toBeUndefined();
    });
  });

  describe("spider_browser_close", () => {
    it("calls closeSession with correct session_id", async () => {
      const handler = getToolHandler(server, "spider_browser_close");
      const result = await handler({ session_id: "test-session-id" });

      expect(browserMocks.closeSession).toHaveBeenCalledWith("test-session-id");
      expect(result.isError).toBeUndefined();
    });
  });
});
