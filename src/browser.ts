/**
 * Browser session manager.
 *
 * Manages remote browser sessions via puppeteer-core connecting to
 * browser.spider.cloud's CDP WebSocket endpoint. Handles session lifecycle,
 * idle timeout cleanup, and graceful shutdown.
 *
 * Public connection endpoint: wss://browser.spider.cloud/v1/browser
 * Compatible with Puppeteer, Playwright, and any CDP client.
 */

import puppeteer, { type Browser, type Page } from "puppeteer-core";

const BROWSER_WS_BASE = "wss://browser.spider.cloud/v1/browser";
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle
const MAX_SESSIONS = 5;

interface Session {
  browser: Browser;
  page: Page;
  lastAccess: number;
}

const sessions = new Map<string, Session>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(async () => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastAccess > SESSION_TIMEOUT_MS) {
        await closeSession(id);
      }
    }
    if (sessions.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, 60_000);
}

/**
 * Open a new remote browser session.
 *
 * Connects to browser.spider.cloud via CDP WebSocket. The remote browser
 * runs in the cloud with anti-bot protection and proxy rotation built in.
 *
 * @returns A unique session ID for subsequent browser tool calls.
 */
export async function openSession(
  apiKey: string,
  options?: {
    browser?: string;
    stealth?: number;
    country?: string;
    mode?: string;
  }
): Promise<{ sessionId: string; browserType: string }> {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(
      `Maximum ${MAX_SESSIONS} concurrent browser sessions reached. ` +
        "Close an existing session with spider_browser_close first."
    );
  }

  const params = new URLSearchParams({ token: apiKey });
  if (options?.browser) params.set("browser", options.browser);
  if (options?.stealth !== undefined) params.set("s", String(options.stealth));
  if (options?.country) params.set("country", options.country);
  if (options?.mode) params.set("mode", options.mode);

  const wsUrl = `${BROWSER_WS_BASE}?${params}`;

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
  });

  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());

  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { browser, page, lastAccess: Date.now() });

  // Auto-cleanup on unexpected disconnect
  browser.on("disconnected", () => {
    sessions.delete(sessionId);
  });

  startCleanup();

  return {
    sessionId,
    browserType: options?.browser ?? "chrome",
  };
}

/**
 * Get an active session's page. Throws if the session has expired or been closed.
 */
export function getPage(sessionId: string): Page {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(
      "Browser session not found. It may have expired (5 min idle timeout) or been closed. " +
        "Open a new session with spider_browser_open."
    );
  }
  session.lastAccess = Date.now();
  return session.page;
}

/**
 * Close a browser session and release its resources.
 */
export async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  try {
    await session.browser.close();
  } catch {
    // Already disconnected
  }
}

/**
 * Close all active sessions. Called on server shutdown.
 */
export async function closeAllSessions(): Promise<void> {
  const ids = [...sessions.keys()];
  await Promise.allSettled(ids.map(closeSession));
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Get the number of active sessions.
 */
export function getSessionCount(): number {
  return sessions.size;
}
