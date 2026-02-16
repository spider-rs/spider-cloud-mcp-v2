# Spider MCP Server

The fastest web crawling, scraping, and browser automation server for AI agents. Gives Claude direct access to the web through 22 tools — crawl sites at 100K+ pages/sec, extract structured data with AI, and control remote browsers with built-in anti-bot bypass.

## Why Spider

- **Speed** — Crawl 100K+ pages per second. Smart request routing picks HTTP or headless Chrome automatically. Streaming responses start delivering data immediately.
- **Cost** — Pay-per-use credits with no subscription required for core tools. Check your balance anytime with `spider_get_credits`. AI tools available with an [AI subscription](https://spider.cloud/ai/pricing).
- **Reliability** — Anti-bot bypass with fingerprinting and proxy rotation. Browser fleet with automatic fallback across Chrome, Firefox, and more. Built-in retry and stealth escalation.

## Quick Start

### Claude Code

```bash
claude mcp add spider -- npx -y spider-cloud-mcp
```

Set your API key:

```bash
export SPIDER_API_KEY="your-api-key"
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "spider": {
      "command": "npx",
      "args": ["-y", "spider-cloud-mcp"],
      "env": {
        "SPIDER_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "spider": {
      "command": "npx",
      "args": ["-y", "spider-cloud-mcp"],
      "env": {
        "SPIDER_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "spider": {
      "command": "npx",
      "args": ["-y", "spider-cloud-mcp"],
      "env": {
        "SPIDER_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Configuration

| Variable | Required | Description |
|---|---|---|
| `SPIDER_API_KEY` | Yes | Your Spider API key. Get one at [spider.cloud/api-keys](https://spider.cloud/api-keys) |

## Tools

### Core Tools (8)

These work on pay-per-use credits with no subscription required.

| Tool | Description |
|---|---|
| `spider_crawl` | Crawl a website and extract content from multiple pages. Follows links up to a depth/limit. |
| `spider_scrape` | Scrape a single page. Faster and cheaper than crawling when you need one URL. |
| `spider_search` | Search the web. Optionally fetch full page content from results. |
| `spider_links` | Extract all links from a page without fetching content. |
| `spider_screenshot` | Capture a page screenshot as base64 PNG. |
| `spider_unblocker` | Access bot-protected content with advanced anti-bot bypass. |
| `spider_transform` | Convert HTML to markdown or text without making web requests. |
| `spider_get_credits` | Check your API credit balance. |

### AI Tools (5)

Natural language web interaction. Describe what you want in plain English.

Requires an [AI subscription](https://spider.cloud/ai/pricing).

| Tool | Description |
|---|---|
| `spider_ai_crawl` | AI-guided crawling — describe what content to find. |
| `spider_ai_scrape` | Extract structured data with plain English — no CSS selectors. |
| `spider_ai_search` | AI-enhanced search with intent understanding. |
| `spider_ai_browser` | Automate browser actions with natural language. |
| `spider_ai_links` | Find and filter links by description. |

### Browser Automation Tools (9)

Direct browser control via spider-browser. Browsers run in Spider's cloud with smart retry, browser switching, anti-bot protection, proxy rotation, and automatic stealth escalation. Supports CDP and BiDi protocols.

| Tool | Description |
|---|---|
| `spider_browser_open` | Open a remote browser session. Returns a session_id. |
| `spider_browser_navigate` | Navigate to a URL and wait for load. |
| `spider_browser_click` | Click an element by CSS selector. |
| `spider_browser_fill` | Fill a form field with text. |
| `spider_browser_screenshot` | Take a screenshot of the current page. Returns base64 PNG. |
| `spider_browser_content` | Get page HTML or visible text. |
| `spider_browser_evaluate` | Execute JavaScript in the page context. |
| `spider_browser_wait_for` | Wait for an element, navigation, or network idle. |
| `spider_browser_close` | Close the session and stop billing. |

Browser sessions auto-close after 5 minutes of inactivity. Always call `spider_browser_close` when done.

## Examples

### Research and RAG

> "Crawl the React documentation and summarize the hooks API"

Uses `spider_crawl` to fetch 50+ pages in seconds and return clean markdown ready for context.

```
spider_crawl: {
  url: "https://react.dev/reference/react",
  limit: 50,
  return_format: "markdown",
  filter_output_main_only: true
}
```

### Structured Data Extraction

> "Get all product names and prices from this e-commerce page"

Uses `spider_ai_scrape` to extract structured JSON with zero CSS selectors.

```
spider_ai_scrape: {
  url: "https://example-store.com/products",
  prompt: "Extract every product name, price, and availability status as JSON"
}
```

### Multi-Step Browser Automation

> "Log into the dashboard, go to reports, and screenshot the monthly summary"

Uses `spider_browser_*` tools to drive a remote browser with full anti-bot protection.

```
1. spider_browser_open: { browser: "auto" }
2. spider_browser_navigate: { url: "https://app.example.com/login" }
3. spider_browser_fill: { selector: "input[name='email']", value: "user@example.com" }
4. spider_browser_fill: { selector: "input[name='password']", value: "..." }
5. spider_browser_click: { selector: "button[type='submit']" }
6. spider_browser_wait_for: { navigation: true }
7. spider_browser_navigate: { url: "https://app.example.com/reports/monthly" }
8. spider_browser_screenshot: {}
9. spider_browser_close: {}
```

### Competitive Intelligence

> "Search for recent AI startup funding rounds and get the details"

Uses `spider_search` with time filtering, then `spider_scrape` for details.

```
spider_search: {
  search: "AI startup Series A funding 2025",
  num: 10,
  fetch_page_content: true,
  return_format: "markdown",
  tbs: "qdr:m"
}
```

## API Reference

All tools map directly to the [Spider API](https://spider.cloud/docs/api). Core tools accept the same parameters as their API counterparts:

- **Crawl/Scrape**: `url`, `return_format`, `request`, `readability`, `root_selector`, `proxy_enabled`, `cache`, and [many more](https://spider.cloud/docs/api)
- **Search**: `search`, `num`, `fetch_page_content`, `country`, `language`, `tbs`
- **AI tools**: Add a `prompt` parameter describing what you want in natural language
- **Browser tools**: Use `session_id` from `spider_browser_open` for all operations

Full parameter reference: [spider.cloud/docs/api](https://spider.cloud/docs/api)

## Links

- [Website](https://spider.cloud)
- [Documentation](https://spider.cloud/docs/overview)
- [API Reference](https://spider.cloud/docs/api)
- [Get API Key](https://spider.cloud/api-keys)
- [Credit Pricing](https://spider.cloud/credits/new)
- [AI Subscription](https://spider.cloud/ai/pricing)
- [Discord](https://discord.spider.cloud)
- [Support](mailto:support@spider.cloud)

## License

MIT
