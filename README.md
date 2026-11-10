# Price Tracker (MVP)

Personal price-monitoring tool. Tracks one product across several shops and
alerts you when the price drops. Core rule: **never report a price for the
wrong product** — no price is better than a wrong price.

Setup instructions are completed as the project is built (see the end of the
build plan).

```bash
npm install
cp .env.example .env
npm run dev      # web UI on http://localhost:3000 + background worker
npm test
```
