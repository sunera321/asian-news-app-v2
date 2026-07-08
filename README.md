# 🌏 Asia Economic Lens v2.0

BBC Global News — Economic Impact Tracker for Asian Countries

## What it does

Fetches the latest BBC business & world news via RSS, then uses Groq AI (Llama 3.1) to analyse how each story specifically affects the selected Asian country — covering trade, currency, sectors, and policy.

## Features

- **15 Asian countries** across South, East, Southeast, Central & West Asia
- **Per-country AI analysis** with country-specific economic context
- **Sentiment scoring** (positive / negative / mixed / neutral) per story
- **Sector tagging** (e.g. Trade, Energy, Currency, Technology)
- **Smart caching** — server caches per country for 1 hour; client caches in session
- **Filter by sentiment** and switch between card / list view
- **BBC source links** on every story
- **Deep link support** — `/index.html?country=LK`

## Setup

```bash
# 1. Clone and install
npm install

# 2. Create .env from example
cp .env.example .env
# Add your GROQ_API_KEY from https://console.groq.com

# 3. Start
npm start
# → http://localhost:3022
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/countries` | List all supported countries & regions |
| GET | `/api/news?country=LK` | Analyse news for a country (cached 1hr) |
| GET | `/api/cache/clear` | Clear server cache (dev) |

## Supported Countries

| Region | Countries |
|--------|-----------|
| South Asia | 🇱🇰 Sri Lanka, 🇮🇳 India, 🇵🇰 Pakistan, 🇧🇩 Bangladesh |
| East Asia | 🇨🇳 China, 🇯🇵 Japan, 🇰🇷 South Korea |
| Southeast Asia | 🇸🇬 Singapore, 🇲🇾 Malaysia, 🇹🇭 Thailand, 🇮🇩 Indonesia, 🇵🇭 Philippines, 🇻🇳 Vietnam |
| Central Asia | 🇰🇿 Kazakhstan |
| West Asia | 🇦🇪 UAE |

## Tech Stack

- **Backend**: Node.js + Express
- **RSS**: `rss-parser` (BBC feeds)
- **AI**: Groq SDK (llama-3.1-8b-instant)
- **Frontend**: Vanilla JS + CSS (no frameworks, no build step)

## Project Structure

```
asia-economic-lens/
├── server.js          # Express server + cache
├── countries.js       # Country config & economic context
├── newsFetcher.js     # BBC RSS parser
├── groqClient.js      # Groq AI analysis per country
├── package.json
├── .env.example
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```
