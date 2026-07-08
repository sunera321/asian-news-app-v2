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

## Setup on a fresh VM or new machine

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd asian-news-app-v2

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env

# 4. Fill in the required values in .env
#    - NEWSDATA_API_KEY
#    - GEMINI_API_KEY (optional but recommended)
#    - MISTRAL_API_KEY (optional)
#    - GROQ_API_KEY (optional)
#    - YOUTUBE_* values (only if you want uploads)

# 5. Start the web app
npm start
# → http://localhost:3022
```

## Run the video pipeline on the new VM

```bash
# Test without uploading
npm run pipeline:test

# Generate and upload one video
npm run pipeline

# Run the daily batch with a 5-minute break between stories
npm run daily -- --break 5
```

## If you push to GitHub and clone elsewhere

- Do not commit your real .env file.
- Copy [.env.example](.env.example) to .env on the new machine.
- If you want YouTube uploads on the new VM, run this once after setting the YouTube credentials:

```bash
npm run youtube:auth
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
