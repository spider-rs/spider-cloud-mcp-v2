# Skills Guide

How to pick the right Spider tool for a task. Use this as a decision guide when multiple tools could work.

## Decision Tree

**Need web content?**
- One page -> `spider_scrape`
- Multiple pages / follow links -> `spider_crawl`
- Behind bot protection -> `spider_unblocker`
- Already have HTML locally -> `spider_transform`

**Need to find something?**
- Web search -> `spider_search`
- Links on a known page -> `spider_links`

**Need AI-driven extraction?**
- Structured data from a page -> `spider_ai_scrape`
- Crawl guided by intent -> `spider_ai_crawl`
- Search with ranking/filtering -> `spider_ai_search`
- Link discovery by description -> `spider_ai_links`
- Multi-step browser task described in English -> `spider_ai_browser`

**Need interactive browser control?**
- Open session -> `spider_browser_open`
- Navigate, click, fill, screenshot, read content, evaluate JS, wait, close

**Need account info?**
- Credit balance -> `spider_get_credits`

## Core Tools

### spider_crawl
Crawl a website following links. Best for documentation sites, sitemaps, multi-page content.

Key params:
- `limit` — max pages (0 = unlimited)
- `depth` — max link depth from start URL
- `return_format` — `markdown` is best for LLM context
- `filter_output_main_only` — strip nav/footer noise

### spider_scrape
Fetch and extract a single page. Cheaper and faster than crawl when you only need one URL.

Key params:
- `return_format` — `markdown`, `text`, `raw`, etc.
- `readability` — cleaner article extraction
- `root_selector` — scope to a specific DOM subtree

### spider_search
Web search with optional full-page fetching.

Key params:
- `search` — the query
- `num` — max results
- `fetch_page_content` — set `true` to get full page content, not just URLs
- `tbs` — time filter (`qdr:h` past hour, `qdr:d` 24h, `qdr:w` week, `qdr:m` month)

### spider_links
Extract links from a page without fetching their content. Use to discover URLs before deciding what to crawl.

### spider_screenshot
Server-side page screenshot via the REST API. Returns base64 PNG. Supports full-page capture and custom viewports.

### spider_unblocker
Access bot-protected sites. Uses advanced fingerprinting and proxy rotation. Costs 10-40 extra credits on top of base scrape.

### spider_transform
Convert HTML to markdown/text without making web requests. Use when you already have HTML content.

### spider_get_credits
Check remaining credit balance. Call this before large operations to avoid surprises.

## AI Tools

All require an [AI subscription](https://spider.cloud/ai/pricing). Each takes a `prompt` describing what you want in plain English.

### spider_ai_scrape
Best for structured data extraction. Describe the fields you want and get JSON back.

```
prompt: "Extract product name, price, rating, and review count for each item"
```

### spider_ai_crawl
AI decides which links to follow based on your intent. Good for targeted information gathering.

```
prompt: "Find all pricing pages and extract plan details"
```

### spider_ai_search
Search with AI ranking and filtering. Better than plain search when intent is nuanced.

### spider_ai_browser
Natural language browser automation. Describe the steps and Spider drives the browser.

```
prompt: "Click the Sign In button, enter the email, submit the form"
```

### spider_ai_links
Find and categorize links by description rather than CSS selectors.

## Browser Automation Tools

Interactive browser sessions running in Spider's cloud. Uses spider-browser with smart retry, browser switching, and stealth auto-escalation.

### Session lifecycle

1. `spider_browser_open` — start a session, get a `session_id`
2. Use `session_id` with any browser tool
3. `spider_browser_close` — always close when done to stop billing

Sessions auto-close after 5 minutes idle. Max 5 concurrent sessions.

### spider_browser_open
- `browser` — `auto` (recommended), `chrome`, `chrome-new` (dedicated), `firefox`
- `stealth` — 0 (auto-escalate), 1 (standard), 2 (residential), 3 (premium)

### spider_browser_navigate
Navigates with smart retry and automatic browser switching on failure. No need to specify wait conditions or timeouts — spider-browser handles load detection internally.

### spider_browser_click
Waits for the element to appear, then clicks. Specify `timeout` in ms (default: 10000).

### spider_browser_fill
Clears existing content and types new value. Replaces the old triple-click + type pattern.

### spider_browser_screenshot
Returns base64 PNG of the current viewport. No options needed — just pass `session_id`.

### spider_browser_content
- `format: "html"` (default) — full DOM
- `format: "text"` — visible text only

### spider_browser_evaluate
Execute a JavaScript string expression in the page context. Use `(function() { ... })()` for multi-line code. Only string expressions are supported — no arrow functions.

### spider_browser_wait_for
Three modes:
- `selector` — wait for a CSS selector to appear
- `navigation: true` — wait for the next page load
- Neither — wait for network idle + DOM stability

All take an optional `timeout` in ms (default: 30000).

### spider_browser_close
Closes the session and releases resources. Always call this when done.

## Common Patterns

### Scrape then transform
Use `spider_scrape` with `return_format: "raw"` to get HTML, then `spider_transform` to convert to different formats without extra API calls.

### Search then scrape
Use `spider_search` to find URLs, then `spider_scrape` individual results for full content. Or set `fetch_page_content: true` on the search to do it in one call.

### Browser form submission
```
open -> navigate -> fill (each field) -> click submit -> wait_for navigation -> content or screenshot -> close
```

### Check credits before large crawl
```
spider_get_credits -> spider_crawl with limit
```

### Bypass bot protection
Try `spider_scrape` first. If blocked, escalate to `spider_unblocker`. For interactive sites, use browser tools with `stealth: 2` or `stealth: 3`.
