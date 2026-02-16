/**
 * Spider MCP Server — tool registrations.
 *
 * 22 tools across three categories:
 *   - Core (8):    crawl, scrape, search, links, screenshot, unblocker, transform, credits
 *   - AI (5):      ai_crawl, ai_scrape, ai_search, ai_browser, ai_links
 *   - Browser (9): open, navigate, click, fill, screenshot, content, evaluate, wait_for, close
 *
 * All REST tools call the public Spider API at https://api.spider.cloud.
 * Browser tools connect via CDP WebSocket to https://browser.spider.cloud.
 * No internal endpoints, no private infrastructure details.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest, formatResult, getApiKey } from "./api.js";
import {
  openSession,
  getPage,
  getBrowser,
  closeSession,
  getSessionCount,
} from "./browser.js";

// ─── Shared Parameter Schemas ───────────────────────────────────────────────

const returnFormatSchema = z
  .union([
    z.enum(["markdown", "commonmark", "raw", "text", "xml", "bytes", "empty"]),
    z.array(z.string()),
  ])
  .optional()
  .describe("Output format. Default: raw");

const requestTypeSchema = z
  .enum(["http", "chrome", "smart"])
  .optional()
  .describe("Request type: http (fast), chrome (JS rendering), smart (auto-detect). Default: smart");

const viewportSchema = z
  .object({
    width: z.number().optional(),
    height: z.number().optional(),
    device_scale_factor: z.number().optional(),
    emulating_mobile: z.boolean().optional(),
    is_landscape: z.boolean().optional(),
    has_touch: z.boolean().optional(),
  })
  .optional()
  .describe("Device viewport settings");

/**
 * Parameters shared across crawl, scrape, links, unblocker, and screenshot endpoints.
 * Documented at https://spider.cloud/docs/api
 */
const baseParams = {
  url: z
    .string()
    .describe("The URL to process. Comma-separate for multiple URLs."),
  return_format: returnFormatSchema,
  request: requestTypeSchema,
  readability: z
    .boolean()
    .optional()
    .describe("Use readability algorithm for cleaner content extraction"),
  root_selector: z
    .string()
    .optional()
    .describe('Root CSS selector to scope extraction (e.g. "#main-content")'),
  exclude_selector: z
    .string()
    .optional()
    .describe("CSS selector for elements to exclude from output"),
  return_page_links: z
    .boolean()
    .optional()
    .describe("Include links found on each page in the response"),
  return_json_data: z
    .boolean()
    .optional()
    .describe("Extract JSON-LD and structured data from pages"),
  return_headers: z
    .boolean()
    .optional()
    .describe("Include HTTP response headers"),
  return_cookies: z
    .boolean()
    .optional()
    .describe("Include HTTP response cookies"),
  metadata: z
    .boolean()
    .optional()
    .describe("Collect page metadata (title, description, keywords)"),
  css_extraction_map: z
    .record(z.unknown())
    .optional()
    .describe(
      "CSS/XPath selector mapping for structured extraction per URL path"
    ),
  filter_output_images: z
    .boolean()
    .optional()
    .describe("Remove images from output"),
  filter_output_svg: z
    .boolean()
    .optional()
    .describe("Remove SVGs from output"),
  filter_output_main_only: z
    .boolean()
    .optional()
    .describe("Remove nav, aside, footer from output"),
  filter_svg: z
    .boolean()
    .optional()
    .describe("Remove SVG elements from markup before processing"),
  filter_images: z
    .boolean()
    .optional()
    .describe("Remove image elements from markup before processing"),
  filter_main_only: z
    .boolean()
    .optional()
    .describe("Keep only main content. Default: enabled"),
  clean_html: z
    .boolean()
    .optional()
    .describe("Strip unwanted HTML attributes (class, style, etc.)"),
  proxy_enabled: z
    .boolean()
    .optional()
    .describe("Enable premium proxies. Multiplies credit cost by 1.5x"),
  proxy: z
    .enum(["residential", "mobile", "isp", "datacenter"])
    .optional()
    .describe("Proxy pool type. residential (x1.2), mobile (x2), isp/datacenter (x1.2)"),
  remote_proxy: z
    .string()
    .optional()
    .describe("External proxy URL. Saves 50% on data transfer credits"),
  country_code: z
    .string()
    .optional()
    .describe("ISO country code for geo-located proxy (e.g. 'gb', 'us')"),
  fingerprint: z
    .boolean()
    .optional()
    .describe("Advanced browser fingerprint detection. Default: true"),
  cookies: z
    .string()
    .optional()
    .describe("HTTP cookies for authenticated scraping"),
  external_domains: z
    .array(z.string())
    .optional()
    .describe("External domains to follow. Use ['*'] to allow all"),
  subdomains: z.boolean().optional().describe("Follow subdomains"),
  tld: z.boolean().optional().describe("Follow top-level domain variations"),
  blacklist: z
    .array(z.string())
    .optional()
    .describe("URL path patterns to exclude (supports regex)"),
  whitelist: z
    .array(z.string())
    .optional()
    .describe("URL path patterns to include (supports regex)"),
  redirect_policy: z
    .enum(["Loose", "Strict", "None"])
    .optional()
    .describe("How to handle redirects. Default: Loose"),
  concurrency_limit: z
    .number()
    .optional()
    .describe("Max concurrent requests to the target site"),
  respect_robots: z
    .boolean()
    .optional()
    .describe("Obey robots.txt rules. Default: true"),
  cache: z
    .union([z.boolean(), z.record(z.unknown())])
    .optional()
    .describe("HTTP caching. true/false or {maxAge, allowStale, period}"),
  storageless: z
    .boolean()
    .optional()
    .describe("Prevent data storage. Default: true"),
  session: z
    .boolean()
    .optional()
    .describe("Persist cookies across requests. Default: true"),
  user_agent: z.string().optional().describe("Custom HTTP user agent string"),
  full_resources: z
    .boolean()
    .optional()
    .describe("Download all resources including images, CSS, JS"),
  sitemap: z
    .boolean()
    .optional()
    .describe("Discover pages via sitemap.xml"),
  sitemaps: z
    .array(z.string())
    .optional()
    .describe("Specific sitemap URLs to use"),
  request_timeout: z
    .number()
    .optional()
    .describe("Per-request timeout in milliseconds"),
  budget: z
    .record(z.number())
    .optional()
    .describe("Page budget per URL path (e.g. {'*': 100, '/blog': 20})"),
  chunking_alg: z
    .record(z.unknown())
    .optional()
    .describe("Segment content: bysentence, bylines, bycharacterlength, bywords"),
  automation: z
    .record(z.unknown())
    .optional()
    .describe("Browser automation actions to run before extraction (Click, Fill, Wait, Scroll)"),
  viewport: viewportSchema,
  locale: z
    .string()
    .optional()
    .describe("Browser locale (e.g. 'en-US')"),
  timezone: z.string().optional().describe("Browser timezone"),
  timeout: z.number().optional().describe("Overall request timeout in milliseconds"),
  webhooks: z
    .record(z.unknown())
    .optional()
    .describe("Webhook URLs for async events (on_find, on_credits_depleted)"),
  cron: z
    .enum(["daily", "weekly", "monthly"])
    .optional()
    .describe("Schedule recurring crawls"),
  run_in_background: z
    .boolean()
    .optional()
    .describe("Run asynchronously. Requires webhooks or storageless=false"),
  block_ads: z
    .boolean()
    .optional()
    .describe("Block advertisements. Default: true"),
  block_analytics: z
    .boolean()
    .optional()
    .describe("Block analytics scripts. Default: true"),
  block_stylesheets: z
    .boolean()
    .optional()
    .describe("Block CSS stylesheets. Default: true"),
  disable_intercept: z
    .boolean()
    .optional()
    .describe("Disable request interception"),
  preserve_host: z
    .boolean()
    .optional()
    .describe("Preserve the HOST header on redirects"),
  event_tracker: z
    .record(z.unknown())
    .optional()
    .describe("Track detailed request/response events"),
};

const crawlOnlyParams = {
  limit: z
    .number()
    .optional()
    .describe("Maximum pages to crawl. 0 for unlimited. Default: 0"),
  depth: z
    .number()
    .optional()
    .describe("Maximum crawl depth from start URL. Default: 25"),
  delay: z
    .number()
    .optional()
    .describe("Delay between requests in ms (max 60000). Disables concurrency"),
};

const screenshotExtraParams = {
  screenshot: z.boolean().optional().describe("Enable screenshot capture"),
  binary: z
    .boolean()
    .optional()
    .describe("Return screenshot as binary instead of base64"),
  full_page: z
    .boolean()
    .optional()
    .describe("Capture full scrollable page. Default: true"),
  block_images: z
    .boolean()
    .optional()
    .describe("Block images from loading before screenshot"),
  omit_background: z
    .boolean()
    .optional()
    .describe("Transparent background in screenshot"),
  cdp_params: z
    .record(z.unknown())
    .optional()
    .describe("Chrome DevTools Protocol screenshot options (clip, format, quality)"),
};

const crawlParams = { ...baseParams, ...crawlOnlyParams };

// Scrape/unblocker: base params + screenshot options (no limit/depth/delay)
const scrapeParams = { ...baseParams, ...screenshotExtraParams };

// ─── Tool Result Helpers ────────────────────────────────────────────────────

type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

function textResult(
  data: unknown
): { content: ToolContent[] } {
  return { content: [{ type: "text" as const, text: formatResult(data) }] };
}

function errorResult(
  error: unknown
): { content: ToolContent[]; isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function imageResult(
  base64: string,
  mimeType = "image/png"
): { content: ToolContent[] } {
  return {
    content: [{ type: "image" as const, data: base64, mimeType }],
  };
}

// ─── Server Factory ─────────────────────────────────────────────────────────

export function createServer(): McpServer {
  const server = new McpServer({
    name: "spider-cloud-mcp",
    version: "2.1.0",
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE TOOLS (8)
  // Public Spider API — no subscription required
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    "spider_crawl",
    "Crawl a website and extract content from multiple pages. " +
      "Follows links up to the specified depth/limit. Returns content in markdown, HTML, text, or other formats. " +
      "Powered by Spider — crawls 100K+ pages/sec with smart JS rendering.",
    crawlParams,
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/crawl",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_scrape",
    "Scrape a single page and extract its content. " +
      "No link following — fetches and processes one URL. Faster and cheaper than crawling. " +
      "Supports all output formats and optional screenshot capture.",
    scrapeParams,
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/scrape",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_search",
    "Search the web and optionally fetch full page content from results. " +
      "Supports location, language, and time range filters. " +
      "Set fetch_page_content=true to get full page data, not just URLs.",
    {
      search: z.string().describe("Search query"),
      search_limit: z
        .number()
        .optional()
        .describe("Max result URLs to fetch. 0 for all"),
      num: z.number().optional().describe("Max results to return"),
      fetch_page_content: z
        .boolean()
        .optional()
        .describe("Fetch full content from each result page. Default: false"),
      country: z
        .string()
        .optional()
        .describe("Two-letter country code (e.g. 'us')"),
      location: z
        .string()
        .optional()
        .describe("Location name (e.g. 'United Kingdom')"),
      language: z
        .string()
        .optional()
        .describe("Two-letter language code (e.g. 'en')"),
      tbs: z
        .string()
        .optional()
        .describe(
          "Time range: qdr:h (past hour), qdr:d (24h), qdr:w (week), qdr:m (month), qdr:y (year)"
        ),
      page: z.number().optional().describe("Result page number"),
      quick_search: z
        .boolean()
        .optional()
        .describe("Prioritize speed over completeness"),
      auto_pagination: z
        .boolean()
        .optional()
        .describe("Auto-paginate to reach exact result count"),
      url: z
        .string()
        .optional()
        .describe("Optional URL context for the search"),
      limit: z
        .number()
        .optional()
        .describe("Page crawl limit when fetching results"),
      return_format: returnFormatSchema,
      request: requestTypeSchema,
      proxy_enabled: z.boolean().optional().describe("Enable premium proxies"),
      cookies: z.string().optional().describe("HTTP cookies"),
    },
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/search",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_links",
    "Extract all links from a page without fetching their content. " +
      "Fast way to discover URLs on a site for further processing.",
    {
      url: z.string().describe("URL to extract links from"),
      limit: z.number().optional().describe("Max links to return"),
      return_format: returnFormatSchema,
      request: requestTypeSchema,
    },
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/links",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_screenshot",
    "Capture a screenshot of a web page. Returns base64-encoded PNG by default. " +
      "Supports full-page capture and custom viewports.",
    {
      url: z.string().describe("URL to screenshot"),
      ...screenshotExtraParams,
      viewport: viewportSchema,
      proxy_enabled: z.boolean().optional().describe("Enable premium proxies"),
      country_code: z
        .string()
        .optional()
        .describe("ISO country code for proxy"),
      fingerprint: z
        .boolean()
        .optional()
        .describe("Advanced fingerprint detection"),
      cookies: z.string().optional().describe("HTTP cookies"),
      automation: z
        .record(z.unknown())
        .optional()
        .describe("Automation actions to run before taking the screenshot"),
      block_ads: z.boolean().optional().describe("Block ads"),
      block_analytics: z.boolean().optional().describe("Block analytics"),
      block_stylesheets: z.boolean().optional().describe("Block stylesheets"),
      locale: z.string().optional().describe("Locale"),
      timezone: z.string().optional().describe("Timezone"),
      timeout: z.number().optional().describe("Timeout in ms"),
    },
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/screenshot",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_unblocker",
    "Access content from bot-protected websites. " +
      "Uses advanced anti-bot bypass with fingerprinting and proxy rotation. " +
      "Costs 10-40 extra credits per successful unblock on top of base scrape cost.",
    scrapeParams,
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/unblocker",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_transform",
    "Transform HTML content to markdown, text, or other formats without making any web requests. " +
      "Use when you already have HTML and need to convert it.",
    {
      data: z
        .array(
          z.object({
            html: z.string().describe("HTML content to transform"),
            url: z
              .string()
              .optional()
              .describe("Source URL (helps readability algorithm)"),
          })
        )
        .describe("Array of HTML documents to transform"),
      return_format: returnFormatSchema,
      readability: z
        .boolean()
        .optional()
        .describe("Apply readability preprocessing"),
      clean_full: z
        .boolean()
        .optional()
        .describe("Aggressively clean HTML attributes"),
      clean: z
        .boolean()
        .optional()
        .describe("Clean output for AI consumption (strip nav, footers)"),
    },
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/transform",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_get_credits",
    "Check your available Spider API credit balance. " +
      "Returns the number of credits remaining on your account.",
    {},
    async () => {
      try {
        const data = await apiRequest("GET", "/data/credits");
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // AI TOOLS (5)
  // Require an active AI subscription: https://spider.cloud/ai/pricing
  // ═══════════════════════════════════════════════════════════════════════════

  const AI_NOTE =
    "Requires an active AI subscription (https://spider.cloud/ai/pricing).";

  server.tool(
    "spider_ai_crawl",
    `AI-guided website crawling. Describe what you want in plain English and Spider's AI optimizes the crawl automatically. ${AI_NOTE}`,
    {
      url: z.string().describe("URL to crawl"),
      prompt: z
        .string()
        .describe(
          "Natural language instructions (e.g. 'Find all product pages and extract pricing info')"
        ),
      limit: z.number().optional().describe("Max pages to crawl"),
      return_format: returnFormatSchema,
      request: requestTypeSchema,
      proxy_enabled: z.boolean().optional().describe("Enable premium proxies"),
      cookies: z.string().optional().describe("HTTP cookies"),
    },
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/ai/crawl",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_ai_scrape",
    `Extract structured data from a page using plain English. Describe the data you need and get clean JSON back — no CSS selectors required. ${AI_NOTE}`,
    {
      url: z.string().describe("URL to scrape"),
      prompt: z
        .string()
        .describe(
          "Extraction instructions (e.g. 'Extract the article title, author, publish date, and main text')"
        ),
      return_format: returnFormatSchema,
      request: requestTypeSchema,
      proxy_enabled: z.boolean().optional().describe("Enable premium proxies"),
      cookies: z.string().optional().describe("HTTP cookies"),
    },
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/ai/scrape",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_ai_search",
    `AI-enhanced web search with intent understanding and relevance ranking. ${AI_NOTE}`,
    {
      search: z.string().describe("Search query"),
      prompt: z
        .string()
        .optional()
        .describe("Additional AI guidance for filtering/ranking results"),
      num: z.number().optional().describe("Max results"),
      fetch_page_content: z
        .boolean()
        .optional()
        .describe("Fetch full page content from results"),
      country: z
        .string()
        .optional()
        .describe("Two-letter country code"),
      language: z
        .string()
        .optional()
        .describe("Two-letter language code"),
      tbs: z.string().optional().describe("Time range filter"),
      return_format: returnFormatSchema,
    },
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/ai/search",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_ai_browser",
    `AI-powered browser automation using natural language. Describe what to do and Spider automates the browser — click buttons, fill forms, navigate pages. ${AI_NOTE}`,
    {
      url: z.string().describe("Starting URL"),
      prompt: z
        .string()
        .describe(
          "Automation instructions (e.g. 'Click the Sign In button, enter email, submit the form')"
        ),
      return_format: returnFormatSchema,
      proxy_enabled: z.boolean().optional().describe("Enable premium proxies"),
      cookies: z.string().optional().describe("HTTP cookies"),
    },
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/ai/browser",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_ai_links",
    `AI-powered link extraction and filtering. Describe which links you want and the AI finds and categorizes them. ${AI_NOTE}`,
    {
      url: z.string().describe("URL to extract links from"),
      prompt: z
        .string()
        .describe(
          "Link filter instructions (e.g. 'Find all documentation links and API reference pages')"
        ),
      limit: z.number().optional().describe("Max links"),
      return_format: returnFormatSchema,
      request: requestTypeSchema,
    },
    async (params) => {
      try {
        const data = await apiRequest(
          "POST",
          "/ai/links",
          params as Record<string, unknown>,
          { stream: true }
        );
        return textResult(data);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // BROWSER AUTOMATION TOOLS (9)
  // Direct browser control via CDP WebSocket to browser.spider.cloud
  // Compatible with Puppeteer and Playwright workflows
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    "spider_browser_open",
    "Open a new remote browser session in Spider's cloud. " +
      "Returns a session_id for use with other browser tools. " +
      "The browser comes with anti-bot protection and proxy rotation. " +
      "Sessions auto-close after 5 minutes of inactivity. " +
      "Always close sessions with spider_browser_close when done to avoid unnecessary charges.",
    {
      browser: z
        .enum(["chrome", "chrome-new", "firefox", "auto"])
        .optional()
        .describe("Browser engine. auto (recommended), chrome, chrome-new (dedicated), firefox. Default: auto"),
      stealth: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe("Stealth/proxy level 0-3. 0=auto, 1=standard, 2=residential, 3=premium. Default: 0"),
    },
    async (params) => {
      try {
        const apiKey = getApiKey();
        const { sessionId, browserType } = await openSession(apiKey, {
          browser: params.browser,
          stealth: params.stealth,
        });
        return textResult({
          session_id: sessionId,
          browser: browserType,
          active_sessions: getSessionCount(),
          note: "Use this session_id with other spider_browser_* tools. Close with spider_browser_close when done.",
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_browser_navigate",
    "Navigate the browser to a URL. Waits for the page to finish loading before returning the URL and title.",
    {
      session_id: z
        .string()
        .describe("Session ID from spider_browser_open"),
      url: z.string().describe("URL to navigate to"),
    },
    async ({ session_id, url }) => {
      try {
        const browser = getBrowser(session_id);
        await browser.goto(url);
        const page = browser.page;
        return textResult({
          url: await page.url(),
          title: await page.title(),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_browser_click",
    "Click an element on the page. Waits for the element to appear before clicking.",
    {
      session_id: z
        .string()
        .describe("Session ID from spider_browser_open"),
      selector: z
        .string()
        .describe(
          'CSS selector of the element to click (e.g. "button.submit", "#login-btn", "a[href=\'/pricing\']")'
        ),
      timeout: z
        .number()
        .optional()
        .describe("Max time to wait for element in ms. Default: 10000"),
    },
    async ({ session_id, selector, timeout }) => {
      try {
        const page = getPage(session_id);
        await page.waitForSelector(selector, timeout ?? 10_000);
        await page.click(selector);
        // Brief pause for any navigation or DOM updates triggered by the click
        await new Promise((r) => setTimeout(r, 500));
        return textResult({
          clicked: selector,
          current_url: await page.url(),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_browser_fill",
    "Fill a form field with text. Clears existing content first, then types the new value. " +
      "Use for text inputs, textareas, and contenteditable elements.",
    {
      session_id: z
        .string()
        .describe("Session ID from spider_browser_open"),
      selector: z
        .string()
        .describe('CSS selector of the input field (e.g. "input[name=\'email\']", "#search-box")'),
      value: z.string().describe("Text to type into the field"),
      timeout: z
        .number()
        .optional()
        .describe("Max time to wait for element in ms. Default: 10000"),
    },
    async ({ session_id, selector, value, timeout }) => {
      try {
        const page = getPage(session_id);
        await page.waitForSelector(selector, timeout ?? 10_000);
        await page.fill(selector, value);
        return textResult({
          filled: selector,
          value_length: value.length,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_browser_screenshot",
    "Take a screenshot of the current page. Returns a base64-encoded PNG image. " +
      "Use for visual verification, debugging, or capturing page state.",
    {
      session_id: z
        .string()
        .describe("Session ID from spider_browser_open"),
    },
    async ({ session_id }) => {
      try {
        const page = getPage(session_id);
        const base64 = await page.screenshot();
        return imageResult(base64, "image/png");
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_browser_content",
    "Get the current page content. Returns the full HTML or extracted text of the page.",
    {
      session_id: z
        .string()
        .describe("Session ID from spider_browser_open"),
      format: z
        .enum(["html", "text"])
        .optional()
        .describe("Content format: html (full DOM) or text (visible text only). Default: html"),
    },
    async ({ session_id, format }) => {
      try {
        const page = getPage(session_id);

        let content: string;
        if (format === "text") {
          content = (await page.evaluate(
            'document.body.innerText || document.body.textContent || ""'
          )) as string;
        } else {
          content = await page.content();
        }

        return textResult({
          url: await page.url(),
          title: await page.title(),
          content,
          length: content.length,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_browser_evaluate",
    "Execute JavaScript in the browser page and return the result. " +
      "The expression is evaluated in the page context with access to the DOM. " +
      "Use for advanced interactions, data extraction, or anything not covered by other browser tools.",
    {
      session_id: z
        .string()
        .describe("Session ID from spider_browser_open"),
      expression: z
        .string()
        .describe(
          "JavaScript expression to evaluate in the page context. " +
            "Use a function wrapper for multi-line code: (function() { ... })()"
        ),
    },
    async ({ session_id, expression }) => {
      try {
        const page = getPage(session_id);
        const result = await page.evaluate(expression);
        return textResult({ result });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_browser_wait_for",
    "Wait for a condition on the page. Use after navigation or actions that trigger dynamic content loading.",
    {
      session_id: z
        .string()
        .describe("Session ID from spider_browser_open"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector to wait for (element must appear in DOM)"),
      navigation: z
        .boolean()
        .optional()
        .describe("Wait for the next navigation to complete"),
      timeout: z
        .number()
        .optional()
        .describe("Max wait time in ms. Default: 30000"),
    },
    async ({ session_id, selector, navigation, timeout }) => {
      try {
        const page = getPage(session_id);
        const ms = timeout ?? 30_000;

        if (selector) {
          await page.waitForSelector(selector, ms);
          return textResult({ waited_for: `selector: ${selector}` });
        }

        if (navigation) {
          await page.waitForNavigation(ms);
          return textResult({
            waited_for: "navigation",
            url: await page.url(),
            title: await page.title(),
          });
        }

        // Default: wait for network idle + DOM stability
        await page.waitForNetworkIdle(ms);
        return textResult({ waited_for: "network_idle" });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "spider_browser_close",
    "Close a browser session and release its resources. " +
      "Always call this when done with a browser session to stop billing.",
    {
      session_id: z
        .string()
        .describe("Session ID from spider_browser_open"),
    },
    async ({ session_id }) => {
      try {
        await closeSession(session_id);
        return textResult({
          closed: session_id,
          remaining_sessions: getSessionCount(),
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  return server;
}
