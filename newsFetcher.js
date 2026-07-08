// newsFetcher.js — Primary NewsData.io fetch with RSS fallback
import dotenv from "dotenv";
import Parser from "rss-parser";
dotenv.config();

const API_KEY  = process.env.NEWSDATA_API_KEY;
const BASE_URL = "https://newsdata.io/api/1/latest";
const parser = new Parser({
  timeout: 15_000,
  customFields: {
    item: [["media:content", "mediaContent", { keepArray: true }]],
  },
});

const RSS_FEEDS = [
  "https://news.google.com/rss/search?q=business%20OR%20economy%20OR%20markets%20when%3A1d&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=trade%20OR%20inflation%20OR%20oil%20OR%20stocks%20when%3A1d&hl=en-US&gl=US&ceid=US:en",
];

// Fetch global business/economy headlines with images
export async function fetchHeadlines(limit = 10) {
  if (!API_KEY) {
    console.warn("[NewsData] NEWSDATA_API_KEY not set — using RSS fallback");
    return fetchRssFallback(limit);
  }

  // Request business + economy news in English, prioritise top sources
  const params = new URLSearchParams({
    apikey:         API_KEY,
    category:       "business,world",
    language:       "en",
    prioritydomain: "top",          // top 10% news domains (BBC, Reuters, etc.)
    size:           String(limit),  // articles per request
  });

  try {
    const res = await fetch(`${BASE_URL}?${params}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`NewsData API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();

    if (data.status !== "success") {
      throw new Error(`NewsData error: ${data.results?.message || JSON.stringify(data)}`);
    }

    const articles = (data.results || []).slice(0, limit);
    const withImages = articles.filter(a => a.image_url).length;
    console.log(`[NewsData] Fetched ${articles.length} articles, ${withImages} with images`);

    return articles.map(normalizeNewsDataArticle);

  } catch (err) {
    console.error("[NewsData] Fetch failed:", err.message);
    console.warn("[NewsData] Falling back to RSS sources");
    return fetchRssFallback(limit);
  }
}

async function fetchRssFallback(limit) {
  const allItems = [];

  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const items = (feed.items || []).map(normalizeRssArticle).filter(isUsableArticle);
      console.log(`[RSS] Fetched ${items.length} items from ${feed.title || "feed"}`);
      allItems.push(...items);
      if (allItems.length >= limit * 2) break;
    } catch (err) {
      console.warn(`[RSS] Feed failed: ${err.message}`);
    }
  }

  const deduped = dedupeArticles(allItems).slice(0, limit);
  if (deduped.length > 0) {
    console.log(`[RSS] Using ${deduped.length} fallback articles`);
    return deduped;
  }

  console.warn("[RSS] No fallback articles available — using mock data");
  return getMockData(limit);
}

function normalizeNewsDataArticle(a) {
  return {
    title:       cleanText(a.title),
    description: cleanText(a.description || a.content?.slice(0, 240)),
    link:        a.link || "",
    pubDate:     a.pubDate || a.pubDateTZ || "",
    image:       a.image_url || null,
    source:      a.source_id || a.source_name || "NewsData",
    category:    a.category?.[0] || null,
  };
}

function normalizeRssArticle(item) {
  return {
    title: cleanText(item.title),
    description: cleanText(
      item.contentSnippet
      || item.content
      || item.summary
      || item.contentEncodedSnippet
      || ""
    ),
    link: item.link || item.guid || "",
    pubDate: item.pubDate || item.isoDate || "",
    image: extractRssImage(item),
    source: cleanText(item.creator || item.source?.name || "RSS"),
    category: item.categories?.[0] || "business",
  };
}

function extractRssImage(item) {
  const mediaUrl = item.mediaContent?.[0]?.$?.url || item.enclosure?.url;
  if (mediaUrl) return mediaUrl;

  const html = item.content || item.summary || "";
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || null;
}

function cleanText(text = "") {
  return String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableArticle(article) {
  return Boolean(article.title && article.description);
}

function dedupeArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = `${article.title.toLowerCase()}|${article.link}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Mock data for development when no API key is set
function getMockData(limit) {
  const mock = [
    { title: "US raises tariffs on European tech exports", description: "The US president says numerous European countries have been discussing bringing in such a levy.", link: "https://bbc.com", pubDate: new Date().toISOString(), image: null, source: "Mock" },
    { title: "Asia stock markets slide as tech shares slump", description: "Trading on South Korea's Kospi index was halted for the third time this week to prevent panic selling.", link: "https://bbc.com", pubDate: new Date().toISOString(), image: null, source: "Mock" },
    { title: "Oil prices fall to pre-war levels", description: "Brent crude dropped below $70 as OPEC+ signalled increased production targets for Q3.", link: "https://bbc.com", pubDate: new Date().toISOString(), image: null, source: "Mock" },
    { title: "Federal Reserve signals rate cut ahead", description: "Fed chair hinted at a September rate reduction as inflation data cools further than expected.", link: "https://bbc.com", pubDate: new Date().toISOString(), image: null, source: "Mock" },
    { title: "China manufacturing PMI contracts for second month", description: "Factory output shrank as domestic demand weakened and export orders fell sharply.", link: "https://bbc.com", pubDate: new Date().toISOString(), image: null, source: "Mock" },
  ];
  return mock.slice(0, limit);
}
