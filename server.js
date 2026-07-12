// server.js — Asia Economic Lens backend
import dotenv from "dotenv";
dotenv.config();

import cors    from "cors";
import express from "express";
import path    from "path";
import { fileURLToPath } from "url";
import { fetchHeadlines }    from "./newsFetcher.js";
import { analyzeForCountry } from "./groqClient.js";
import { COUNTRIES, REGIONS } from "./countries.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const app  = express();
const PORT = process.env.PORT || 3022;

// ── Caches ─────────────────────────────────────────────────
const countryCache  = new Map();
let   newsCache     = null;
let   newsCacheTime = 0;
const CACHE_TTL     = 60 * 60 * 1000; // 1 hour

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "frontend")));

// ── /api/countries ──────────────────────────────────────────
app.get("/api/countries", (_req, res) => {
  res.json({
    countries: Object.values(COUNTRIES).map(c => ({
      code: c.code, name: c.name, emoji: c.emoji, region: c.region,
    })),
    regions: REGIONS,
  });
});

// ── /api/news?country=LK ────────────────────────────────────
app.get("/api/news", async (req, res) => {
  const code = (req.query.country || "LK").toUpperCase();
  if (!COUNTRIES[code])
    return res.status(400).json({ error: `Unsupported country: ${code}` });

  const cached = countryCache.get(code);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL)
    return res.json({ ...cached.data, fromCache: true });

  try {
    if (!newsCache || Date.now() - newsCacheTime > CACHE_TTL) {
      newsCache     = await fetchHeadlines(10);
      newsCacheTime = Date.now();
    }

    const analysis = await analyzeForCountry(newsCache, code);
    const result   = {
      source:      "NewsData.io",
      lastUpdated: new Date().toISOString(),
      fromCache:   false,
      ...analysis,
    };

    countryCache.set(code, { data: result, timestamp: Date.now() });
    res.json(result);
  } catch (err) {
    console.error("[API]", err.message);
    res.status(500).json({ error: "Analysis failed", message: "Please try again" });
  }
});

// ── /api/image?url=... — lightweight image proxy ────────────
// NewsData.io images are from various CDNs.
// Proxying avoids CORS issues when different origins block hotlinks.
app.get("/api/image", async (req, res) => {
  const raw = req.query.url;
  if (!raw) return res.status(400).send("Missing url");

  let imageUrl;
  try {
    imageUrl = new URL(decodeURIComponent(raw));
  } catch {
    return res.status(400).send("Invalid URL");
  }

  // Only allow http/https images
  if (!["http:", "https:"].includes(imageUrl.protocol))
    return res.status(400).send("Invalid protocol");

  // Spoof headers to bypass hotlink protection on news CDNs
  // Different sources block differently — try multiple referrer strategies
  const attempts = [
    { "Referer": imageUrl.origin + "/", "Origin": imageUrl.origin },
    { "Referer": "https://www.google.com/" },
    { "Referer": "https://newsdata.io/" },
    {},
  ];

  for (const extraHeaders of attempts) {
    try {
      const upstream = await fetch(imageUrl.toString(), {
        headers: {
          "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept":          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control":   "no-cache",
          "Sec-Fetch-Dest":  "image",
          "Sec-Fetch-Mode":  "no-cors",
          "Sec-Fetch-Site":  "cross-site",
          ...extraHeaders,
        },
        signal:   AbortSignal.timeout(10_000),
        redirect: "follow",
      });

      if (!upstream.ok) continue; // try next strategy

      const ct     = upstream.headers.get("content-type") || "image/jpeg";
      if (!ct.startsWith("image/")) continue; // got HTML error page, try next

      const buffer = await upstream.arrayBuffer();
      res.set({
        "Content-Type":  ct,
        "Cache-Control": "public, max-age=86400",
        "X-Proxy-By":    "AEL",
      });
      return res.send(Buffer.from(buffer));
    } catch {
      continue; // try next strategy
    }
  }

  // All strategies failed
  console.warn("[IMG] All proxy strategies failed for:", imageUrl.hostname);
  res.status(502).send("Image unavailable");
});

// ── Dev-only tools — disabled when NODE_ENV=production ──────
if (process.env.NODE_ENV !== "production") {
  // /api/cache/clear
  app.get("/api/cache/clear", (_req, res) => {
    countryCache.clear(); newsCache = null; newsCacheTime = 0;
    res.json({ message: "Cache cleared" });
  });

  // /api/debug-news — show raw news data including image URLs
  app.get("/api/debug-news", async (req, res) => {
    try {
      if (!newsCache) {
        newsCache     = await fetchHeadlines(10);
        newsCacheTime = Date.now();
      }
      res.json(newsCache.map(a => ({
        title: a.title?.slice(0, 60),
        image: a.image,
      })));
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // /api/debug-image — test if THIS SERVER can reach Pollinations.AI
  app.get("/api/debug-image", async (req, res) => {
    const testUrl = "https://image.pollinations.ai/prompt/test?width=64&height=64&nologo=true";
    const result = { testUrl, timestamp: new Date().toISOString() };

    try {
      const start = Date.now();
      const r = await fetch(testUrl, { signal: AbortSignal.timeout(10000) });
      result.serverReachable = r.ok;
      result.httpStatus      = r.status;
      result.responseTimeMs  = Date.now() - start;
      result.contentType     = r.headers.get("content-type");
      result.message = r.ok
        ? "✅ Server CAN reach Pollinations.AI. If browser still can't load images, it's a client-side network/firewall/extension issue, not a server issue."
        : `⚠️ Server reached Pollinations but got HTTP ${r.status} — service may be degraded.`;
    } catch (err) {
      result.serverReachable = false;
      result.error = err.message;
      result.message = "❌ Server CANNOT reach Pollinations.AI. This means your server's network/firewall is blocking image.pollinations.ai. Check firewall rules, VPN, or corporate proxy settings.";
    }

    res.json(result);
  });
}

app.listen(PORT, () =>
  console.log(`🌏 Asia Economic Lens → http://localhost:${PORT}`)
);
