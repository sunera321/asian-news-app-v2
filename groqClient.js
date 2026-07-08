// groqClient.js — Multi-provider AI client with batch processing
// Priority order: Gemini → Mistral → Groq
// Splits 10 news items into batches of 5 to avoid token truncation

import dotenv from "dotenv";
import { COUNTRIES } from "./countries.js";

dotenv.config();

// ─── Provider definitions ─────────────────────────────────────────────────────
const PROVIDERS = [
  {
    name: "Gemini",
    envKey: "GEMINI_API_KEY",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.5-flash",
    maxTokens: 8000,
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: "Mistral",
    envKey: "MISTRAL_API_KEY",
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small-latest",
    maxTokens: 8000,
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: "Groq",
    envKey: "GROQ_API_KEY",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.1-8b-instant",
    maxTokens: 8000,
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
];

// ─── Active providers (those with API keys in .env) ──────────────────────────
const activeProviders = PROVIDERS.filter((p) => !!process.env[p.envKey]);

if (activeProviders.length === 0) {
  console.error("❌  No AI API keys found. Set GEMINI_API_KEY, MISTRAL_API_KEY, or GROQ_API_KEY in .env");
} else {
  console.log(`✅  AI providers loaded: ${activeProviders.map((p) => p.name).join(" → ")}`);
}

// ─── Fallback text ────────────────────────────────────────────────────────────
const FALLBACK_IMPACT = (countryName) =>
  `This development may affect ${countryName} through trade flows, commodity prices, investor sentiment, or regional policy spillovers.`;

// ─── Build prompt for a batch of news items ───────────────────────────────────
function buildPrompt(newsBatch, countryCode) {
  const c = COUNTRIES[countryCode];
  const newsText = newsBatch
    .map((n, i) => `${i + 1}. TITLE: ${n.title} | SUMMARY: ${n.description}`)
    .join("\n");

  return `You are a senior economic analyst specialising in Asian markets.

COUNTRY: ${c.name}
ECONOMY: ${c.economy}
CURRENCY: ${c.currency}
KEY FACTORS: ${c.keyFactors}

BBC NEWS ITEMS (${newsBatch.length} items):
${newsText}

CRITICAL: Output ONLY raw JSON starting with { and ending with }. No markdown. No fences. No text before or after.

Analyse each of the ${newsBatch.length} news items above. Write a 2-sentence economic impact for ${c.name}.
Be concrete — mention real sectors, trade links, or policies. Never say "could affect the economy".

Return this exact JSON structure with ${newsBatch.length} objects in newsAnalysis:
{
  "newsAnalysis": [
    {
      "title": "copy title here",
      "description": "copy description here",
      "impact": "your specific 2-sentence analysis",
      "sectors": ["Sector1", "Sector2"],
      "sentiment": "neutral"
    }
  ]
}
sentiment options: positive, negative, neutral, mixed`;
}

// ─── Robust JSON extractor (handles fences, truncation, preamble) ─────────────
function extractJSON(raw) {
  if (!raw || typeof raw !== "string") return null;

  // Strip markdown fences
  let text = raw
    .replace(/^[\s\n\r]*```(?:json)?[\s\n\r]*/i, "")
    .replace(/[\s\n\r]*```[\s\n\r]*$/i, "")
    .trim();

  const start = text.indexOf("{");
  if (start === -1) {
    console.warn("[JSON] No opening brace. Raw:", raw.slice(0, 200));
    return null;
  }

  // Bracket-depth walk to find matching closing brace
  let depth = 0, inString = false, escaped = false, end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped)              { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true; continue; }
    if (ch === '"')           { inString = !inString; continue; }
    if (inString)             continue;
    if (ch === "{")           depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
  }

  if (end === -1) {
    console.warn("[JSON] Truncated response (no closing brace). Length:", raw.length);
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    console.warn("[JSON] Parse error:", err.message, "| snippet:", text.slice(start, start + 200));
    return null;
  }
}

// ─── Call one provider ────────────────────────────────────────────────────────
async function callProvider(provider, prompt) {
  const apiKey = process.env[provider.envKey];
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...provider.authHeader(apiKey) },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: provider.maxTokens,
    }),
    signal: AbortSignal.timeout(40_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${provider.name} HTTP ${res.status}: ${body.slice(0, 160)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? null;
  if (!content) throw new Error(`${provider.name} returned empty content`);
  return content;
}

// ─── Try providers in order until one succeeds ────────────────────────────────
async function callWithFallback(prompt, label = "") {
  const errors = [];
  for (const provider of activeProviders) {
    try {
      console.log(`  → [${label}] Trying ${provider.name}...`);
      const text = await callProvider(provider, prompt);
      console.log(`  ✓ [${label}] ${provider.name} responded (${text.length} chars)`);
      return { text, providerName: provider.name };
    } catch (err) {
      console.warn(`  ✗ [${label}] ${provider.name} failed: ${err.message}`);
      errors.push(`${provider.name}: ${err.message}`);
    }
  }
  throw new Error(`All providers failed for [${label}]:\n${errors.join("\n")}`);
}

// ─── Process one batch of news items ─────────────────────────────────────────
async function processBatch(newsBatch, countryCode, batchLabel) {
  const prompt = buildPrompt(newsBatch, countryCode);
  const { text, providerName } = await callWithFallback(prompt, batchLabel);
  const parsed = extractJSON(text);

  if (!parsed || !Array.isArray(parsed.newsAnalysis)) {
    console.warn(`[${batchLabel}] JSON parse failed, using fallback for this batch`);
    return { items: null, providerName };
  }

  console.log(`  ✓ [${batchLabel}] Parsed ${parsed.newsAnalysis.length} items`);
  return { items: parsed.newsAnalysis, providerName };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function analyzeForCountry(news, countryCode) {
  const country = COUNTRIES[countryCode];
  if (!country) throw new Error(`Unknown country: ${countryCode}`);

  if (activeProviders.length === 0) {
    return buildFallback(news, country);
  }

  // Split into batches of 5 to stay well under token limits
  const BATCH_SIZE = 5;
  const batches = [];
  for (let i = 0; i < news.length; i += BATCH_SIZE) {
    batches.push(news.slice(i, i + BATCH_SIZE));
  }

  console.log(`[${countryCode}] Processing ${news.length} items in ${batches.length} batch(es)`);

  // Process all batches in parallel for speed
  const batchResults = await Promise.allSettled(
    batches.map((batch, idx) =>
      processBatch(batch, countryCode, `${countryCode}-batch${idx + 1}`)
    )
  );

  // Merge results — use fallback for any failed batch
  const providers = new Set();
  const newsAnalysis = news.map((item, globalIdx) => {
    const batchIdx = Math.floor(globalIdx / BATCH_SIZE);
    const itemIdx  = globalIdx % BATCH_SIZE;
    const result   = batchResults[batchIdx];

    if (result.status === "fulfilled" && result.value.items) {
      providers.add(result.value.providerName);
      const a = result.value.items[itemIdx] ?? {};
      return {
        title:       item.title,
        description: item.description,
        link:        item.link,
        pubDate:     item.pubDate,
          image:      item.image || null,
        impact:      a.impact || FALLBACK_IMPACT(country.name),
        sectors:     Array.isArray(a.sectors) ? a.sectors.slice(0, 4) : [],
        sentiment:   ["positive","negative","neutral","mixed"].includes(a.sentiment)
                       ? a.sentiment : "neutral",
      };
    }

    // Batch failed — use fallback for this item
    return {
      title:       item.title,
      description: item.description,
      link:        item.link,
      pubDate:     item.pubDate,
          image:      item.image || null,
      impact:      FALLBACK_IMPACT(country.name),
      sectors:     [],
      sentiment:   "neutral",
    };
  });

  return {
    country:     country.name,
    countryCode,
    emoji:       country.emoji,
    provider:    [...providers].join("+") || "fallback",
    newsAnalysis,
  };
}

// ─── Full fallback (no API available) ────────────────────────────────────────
function buildFallback(news, country) {
  return {
    country:     country.name,
    countryCode: country.code,
    emoji:       country.emoji,
    provider:    "fallback",
    newsAnalysis: news.map((item) => ({
      title:       item.title,
      description: item.description,
      link:        item.link,
      pubDate:     item.pubDate,
          image:      item.image || null,
      impact:      FALLBACK_IMPACT(country.name),
      sectors:     [],
      sentiment:   "neutral",
    })),
  };
}
