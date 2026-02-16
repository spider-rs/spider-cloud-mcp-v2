/**
 * Browser session manager.
 *
 * Manages remote browser sessions via spider-browser connecting to
 * Spider's pre-warmed browser fleet. Handles session lifecycle,
 * idle timeout cleanup, and graceful shutdown.
 *
 * spider-browser provides smart retry with browser switching, stealth
 * auto-escalation, interstitial handling, and cross-browser support
 * (CDP + BiDi) out of the box.
 */

import { SpiderBrowser, type SpiderPage } from "spider-browser";

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle
const MAX_SESSIONS = 5;

interface Session {
  browser: SpiderBrowser;
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
 * Connects to Spider's browser fleet via spider-browser. The remote browser
 * runs in the cloud with smart retry, stealth escalation, and cross-browser
 * support built in.
 *
 * @returns A unique session ID for subsequent browser tool calls.
 */
export async function openSession(
  apiKey: string,
  options?: {
    browser?: string;
    stealth?: number;
  }
): Promise<{ sessionId: string; browserType: string }> {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(
      `Maximum ${MAX_SESSIONS} concurrent browser sessions reached. ` +
        "Close an existing session with spider_browser_close first."
    );
  }

  const browser = new SpiderBrowser({
    apiKey,
    browser: options?.browser as any,
    stealth: options?.stealth,
    logLevel: "silent", // prevent stdout corruption on MCP stdio transport
  });
  await browser.init();

  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { browser, lastAccess: Date.now() });

  startCleanup();

  return {
    sessionId,
    browserType: options?.browser ?? "auto",
  };
}

/**
 * Get an active session's page. Throws if the session has expired or been closed.
 */
export function getPage(sessionId: string): SpiderPage {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(
      "Browser session not found. It may have expired (5 min idle timeout) or been closed. " +
        "Open a new session with spider_browser_open."
    );
  }
  session.lastAccess = Date.now();
  return session.browser.page;
}

/**
 * Get an active session's SpiderBrowser instance. Used for smart retry via browser.goto().
 */
export function getBrowser(sessionId: string): SpiderBrowser {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(
      "Browser session not found. It may have expired (5 min idle timeout) or been closed. " +
        "Open a new session with spider_browser_open."
    );
  }
  session.lastAccess = Date.now();
  return session.browser;
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
