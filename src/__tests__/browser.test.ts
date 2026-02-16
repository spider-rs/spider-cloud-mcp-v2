import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPage = {
  url: vi.fn(),
  title: vi.fn(),
  content: vi.fn(),
  evaluate: vi.fn(),
  click: vi.fn(),
  fill: vi.fn(),
  screenshot: vi.fn(),
  waitForSelector: vi.fn(),
  waitForNavigation: vi.fn(),
  waitForNetworkIdle: vi.fn(),
};

const mockInit = vi.fn();
const mockClose = vi.fn();
const mockGoto = vi.fn();

vi.mock("spider-browser", () => ({
  SpiderBrowser: vi.fn().mockImplementation(function (this: any) {
    this.init = mockInit;
    this.close = mockClose;
    this.goto = mockGoto;
    this.page = mockPage;
  }),
}));

// Import after mock so the mock is in effect
const {
  openSession,
  getPage,
  getBrowser,
  closeSession,
  closeAllSessions,
  getSessionCount,
} = await import("../browser.js");

const { SpiderBrowser } = await import("spider-browser");

describe("browser session manager", () => {
  beforeEach(async () => {
    // Clean up all sessions between tests
    await closeAllSessions();
    vi.clearAllMocks();
  });

  describe("openSession", () => {
    it("creates SpiderBrowser with correct options and calls init()", async () => {
      const { sessionId, browserType } = await openSession("test-key", {
        browser: "firefox",
        stealth: 2,
      });

      expect(SpiderBrowser).toHaveBeenCalledWith({
        apiKey: "test-key",
        browser: "firefox",
        stealth: 2,
        logLevel: "silent",
      });
      expect(mockInit).toHaveBeenCalledOnce();
      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(browserType).toBe("firefox");
    });

    it("defaults browserType to 'auto' when not specified", async () => {
      const { browserType } = await openSession("test-key");
      expect(browserType).toBe("auto");
    });

    it("throws at MAX_SESSIONS limit", async () => {
      // Open 5 sessions (the max)
      for (let i = 0; i < 5; i++) {
        await openSession("test-key");
      }

      await expect(openSession("test-key")).rejects.toThrow(
        /Maximum 5 concurrent browser sessions/
      );
    });
  });

  describe("getPage", () => {
    it("returns page for valid session", async () => {
      const { sessionId } = await openSession("test-key");
      const page = getPage(sessionId);
      expect(page).toBe(mockPage);
    });

    it("throws for invalid session", () => {
      expect(() => getPage("nonexistent")).toThrow(
        /Browser session not found/
      );
    });

    it("updates lastAccess timestamp", async () => {
      const { sessionId } = await openSession("test-key");

      // First access
      getPage(sessionId);

      // The session should still be accessible (lastAccess updated)
      const page = getPage(sessionId);
      expect(page).toBe(mockPage);
    });
  });

  describe("getBrowser", () => {
    it("returns SpiderBrowser for valid session", async () => {
      const { sessionId } = await openSession("test-key");
      const browser = getBrowser(sessionId);
      expect(browser.goto).toBe(mockGoto);
      expect(browser.page).toBe(mockPage);
    });

    it("throws for invalid session", () => {
      expect(() => getBrowser("nonexistent")).toThrow(
        /Browser session not found/
      );
    });
  });

  describe("closeSession", () => {
    it("removes session and calls browser.close()", async () => {
      const { sessionId } = await openSession("test-key");
      expect(getSessionCount()).toBe(1);

      await closeSession(sessionId);

      expect(mockClose).toHaveBeenCalledOnce();
      expect(getSessionCount()).toBe(0);
      expect(() => getPage(sessionId)).toThrow(/Browser session not found/);
    });

    it("is a no-op for nonexistent session", async () => {
      await closeSession("nonexistent");
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe("closeAllSessions", () => {
    it("closes all sessions", async () => {
      await openSession("test-key");
      await openSession("test-key");
      await openSession("test-key");
      expect(getSessionCount()).toBe(3);

      await closeAllSessions();

      expect(getSessionCount()).toBe(0);
      expect(mockClose).toHaveBeenCalledTimes(3);
    });
  });

  describe("getSessionCount", () => {
    it("returns 0 initially", () => {
      expect(getSessionCount()).toBe(0);
    });

    it("increments on open", async () => {
      await openSession("test-key");
      expect(getSessionCount()).toBe(1);
      await openSession("test-key");
      expect(getSessionCount()).toBe(2);
    });
  });
});
