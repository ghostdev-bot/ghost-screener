# 👻 Ghost Screener

A lightweight, independent screener for trending Solana memecoins with live public market data.

**Live:** https://ghostscreener.surge.sh

- Pure static site: `site/index.html`, `site/css/style.css`, `site/js/app.js`. No build step, no keys, no wallet connection, no payments.
- Data: the public GeckoTerminal and DexScreener APIs, read from the browser.
- Fallback: if the live trending call fails or is rate limited (one retry first), the table shows the last good copy from this browser, or else `site/data/trending.json`, a snapshot rebuilt by `scripts/refresh.sh`. It is clearly labelled as cached.
- Routes: `#/` screener, `#/token/<mint>` token detail, `#/featured` for the Get Featured section.
- Installable PWA (`manifest.webmanifest`, `sw.js`).

## Run
```bash
cd site && python3 -m http.server 8765   # then open http://localhost:8765/
```

## Config
Edit the `CFG` object at the top of `site/js/app.js` (featured mint and pool, refresh interval, trending pages).

## Fees
None right now. `REVENUE_PLAN.md` lists ideas that are not implemented yet.

Not financial advice.

## License
MIT
