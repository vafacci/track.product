# Price Tracker (MVP)

Personal price-monitoring tool. Tracks one product across several shops and
alerts you when the price drops. Core rule: **never report a price for the
wrong product** — no price is better than a wrong price.

Setup instructions are completed as the project is built.

## Getting started

```bash
npm install
npm run browser:install  # headless Chromium for shops that block plain requests (~120 MB)
cp .env.example .env     # then fill in GEMINI_* and SMTP_*
```

Model names for `GEMINI_MODEL` must be API ids such as `gemini-3.8-flash`
(not "flash 3.8").

### Trying a link from the command line

```bash
npm run probe -- "https://shop.example/product/123"
```

Prints exactly what the tracker would conclude: the product and price, or the
reason the link was rejected.

### Development

```bash
npm run dev      # web UI on http://localhost:3000 + background worker, with live reload
```

Open the URL printed as "Network" (e.g. `http://192.168.x.x:3000`) to use it from
your phone on the same Wi-Fi.

### Production

`npm start` serves a production build, so build first — and stop `npm run dev`
first, since both use port 3000:

```bash
npm run build
npm start        # web UI + worker
```

### Tests

```bash
npm test
```
