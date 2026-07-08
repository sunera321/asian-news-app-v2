// scriptGen.js — Transforms raw news into 100% original AI-written video scripts
// NO country focus. Global audience. Script is fully rewritten by Gemini —
// NOT paraphrasing BBC — a completely new piece of economic journalism.

import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env", import.meta.url).pathname });

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MISTRAL_KEY = process.env.MISTRAL_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

const CHANNEL_NAME   = "EcoAnalyzer";
const CHANNEL_HANDLE = "@EcoAnalyzer";
const CHANNEL_SLOGAN = "Global economics. Simply explained.";

// Video formats for different posting strategies
const FORMATS = {
  short: { words: 140, seconds: 55,  label: "Shorts"   },  // TikTok/Shorts — under 60s
  long:  { words: 280, seconds: 110, label: "Standard" },  // YouTube standard
};

const SCRIPT_PROVIDERS = [
  {
    name: "Gemini",
    enabled: Boolean(GEMINI_KEY),
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-2.5-flash",
    authHeader: { Authorization: `Bearer ${GEMINI_KEY}` },
  },
  {
    name: "Mistral",
    enabled: Boolean(MISTRAL_KEY),
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small-latest",
    authHeader: { Authorization: `Bearer ${MISTRAL_KEY}` },
  },
  {
    name: "Groq",
    enabled: Boolean(GROQ_KEY),
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.1-8b-instant",
    authHeader: { Authorization: `Bearer ${GROQ_KEY}` },
  },
].filter((provider) => provider.enabled);

export async function generateScript(newsItems, format = "short") {
  const fmt        = FORMATS[format] || FORMATS.short;
  const topStories = newsItems.slice(0, 1);
  const primaryStory = topStories[0];

  if (!primaryStory) {
    throw new Error("No news story available for script generation");
  }

  // Feed Gemini only the raw facts — it rewrites everything from scratch
  const storiesText = `HEADLINE: ${primaryStory.title}\nCONTEXT: ${primaryStory.description}`;

  const prompt = `You are a senior financial journalist writing an original video script for a YouTube channel called "${CHANNEL_NAME}".

RAW NEWS FACTS FOR A SINGLE STORY (use these as source material only — do NOT copy them):
${storiesText}

YOUR TASK:
Transform this one story into a ${fmt.words}-word original video script. This must stay focused on the same news event from start to finish. You are a journalist, not a summariser.

SCRIPT FORMAT (return exactly these labels):

HOOK (CRITICAL — this must stop a scrolling thumb in 2 seconds):
[Write a SHORT PUNCHY QUESTION that creates instant curiosity. The question must be directly about this story's impact on the viewer's money, job, or future. Examples:
- "Could YOUR savings disappear because of this one policy?"
- "Why are millions of jobs about to vanish — and is yours next?"
- "What if the price of everything you buy just doubled overnight?"
- "Is your country about to pay the price for Europe's biggest mistake?"
The question MUST relate to the actual story. It must feel personal and urgent. NEVER use "Today" or "In this video". Maximum 12 words.]

INTRO:
[2 sentences. Directly answer the hook question with a surprising fact or number. Then explain why this matters globally. The answer should be MORE alarming than the question implied.]

STORY 1:
[5 sentences. Stay on this same story only. Explain economic significance, who is affected, what happens next, and the broader market implication.]

OUTRO:
[1 punchy sentence that ends with a direct question to the viewer encouraging a comment. Example: "Drop a comment — do you think your country will feel this too?" Then on a new line: "Follow ${CHANNEL_HANDLE} for your daily economic edge."]

RULES:
- Never mention BBC, Reuters, or any source by name
- Write as if SPOKEN aloud — contractions, short sentences, natural rhythm
- Add economic insight beyond what's in the facts (you are the expert)
- Global perspective — relevant to viewers in any country
- Do not introduce a second or third news story
- No jargon without explanation
- Total: exactly ${fmt.words} words ±10

After the script, add this section EXACTLY:

IMAGE PROMPTS:
PROMPT1: [A specific, vivid Pollinations AI image prompt for this story. Wide shot. Example: "Aerial view of California avocado farm at golden hour, rows of green trees, drone photography, ultra realistic, no text"]
PROMPT2: [Close-up detail shot relevant to this exact story. Example: "Close-up of avocado fruit on tree branch, shallow depth of field, natural morning light, documentary photography, no text"]
PROMPT3: [Human/economic impact shot. Example: "Worried farmer in baseball cap examining avocado trees, candid documentary photo, warm afternoon light, no text"]
PROMPT4: [Abstract/data concept for this story. Example: "Dollar bills and avocados arranged on dark surface, overhead flat lay, dramatic lighting, no text"]

Make all 4 prompts SPECIFIC to THIS story, not generic. No text/watermarks in any prompt.`;

  try {
    if (SCRIPT_PROVIDERS.length === 0) {
      throw new Error("No AI providers configured");
    }

    for (const provider of SCRIPT_PROVIDERS) {
      try {
        const raw = await requestScriptFromProvider(provider, prompt);
        return parseScript(raw, topStories, fmt, format, provider.name);
      } catch (providerError) {
        console.error(`[Script] ${provider.name} failed:`, providerError.message);
      }
    }

    throw new Error("All script providers failed");

  } catch (err) {
    console.error("[Script] Provider chain failed:", err.message);
    return buildFallbackScript(topStories, fmt, format);
  }
}

async function requestScriptFromProvider(provider, prompt) {
  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...provider.authHeader,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 800,
    }),
    signal: AbortSignal.timeout(40_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 180)}`);
  }

  const data = await res.json();
  const raw = extractMessageContent(data.choices?.[0]?.message?.content);
  if (!raw) {
    throw new Error("Empty response content");
  }

  return raw;
}

function extractMessageContent(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type === "text") return part.text || "";
      return "";
    })
    .join("")
    .trim();
}

// ── Extract AI-generated image prompts from script output ────
function extractImagePrompts(raw) {
  const prompts = [];
  // Find IMAGE PROMPTS section
  const sectionStart = raw.search(/IMAGE PROMPTS?/i);
  if (sectionStart === -1) return prompts;

  const section = raw.slice(sectionStart);
  // Extract PROMPT1-4
  for (let i = 1; i <= 4; i++) {
    const re = new RegExp("PROMPT" + i + ":?\\s*(.+?)(?=PROMPT" + (i+1) + ":|$)", "is");
    const match = section.match(re);
    if (match) {
      const cleaned = match[1]
        .replace(/^["[]+|["[\]]+$/g, "")
        .replace(/\n/g, " ")
        .trim();
      if (cleaned.length > 10) prompts.push(cleaned);
    }
  }
  return prompts;
}

// ── Parse Gemini output into structured script object ─────
function parseScript(raw, stories, fmt, format, providerName = "AI") {
  const normalizedRaw = normalizeScript(raw);
  const sections = {
    hook:   extractSection(normalizedRaw, ["HOOK"]),
    intro:  extractSection(normalizedRaw, ["INTRO"]),
    story1: extractSection(normalizedRaw, ["STORY 1", "STORY", "ANALYSIS", "BODY"]),
    story2: "",
    story3: "",
    story4: extractSection(normalizedRaw, ["STORY 4"]) || "",
    story5: extractSection(normalizedRaw, ["STORY 5"]) || "",
    outro:  extractSection(normalizedRaw, ["OUTRO", "CTA", "CALL TO ACTION"]),
  };

  if (!sections.story1) {
    sections.story1 = recoverBody(normalizedRaw, sections);
  }

  const fullText = buildFullText(sections);
  if (!sections.hook || !sections.intro || !sections.story1 || !sections.outro) {
    throw new Error("Incomplete script structure returned by provider");
  }

  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  console.log(`[Script] ✅ Generated ${wordCount} words via ${providerName} (target: ${fmt.words})`);
  console.log(`[Script] Hook: "${sections.hook.slice(0, 80)}..."`);

  // Extract AI-generated image prompts from the script output
  const aiImagePrompts = extractImagePrompts(normalizedRaw);
  console.log(`[Script] Image prompts generated: ${aiImagePrompts.length}/4`);

  const imageTopics = Array.from({ length: 4 }, (_, i) => ({
    title:       stories[0]?.title || "",
    description: stories[0]?.description || "",
    sectors:     stories[0]?.sectors || [],
    image:       stories[0]?.image || null,
    source:      stories[0]?.source || "",
    aiPrompt:    aiImagePrompts[i] || null,  // AI-written specific prompt
  }));

  return {
    channelName:  CHANNEL_NAME,
    channelSlogan: CHANNEL_SLOGAN,
    sections,
    fullText,
    wordCount,
    format,
    imageTopics,
    title:       buildTitle(sections.hook, fmt),
    description: buildDescription(fullText, sections),
    tags:        buildTags(stories),
    providerName,
    quality:     "ai",
  };
}

function extractSection(text, labels) {
  for (const label of labels) {
    const escapedLabel = escapeRegex(label);
    const regex = new RegExp(
      `(?:^|\\n)${escapedLabel}[^:\\n]*:\\s*([\\s\\S]*?)(?=\\n[A-Z0-9][A-Z0-9 ]*:\\s|$)`,
      "i"
    );
    const match = text.match(regex);
    if (match?.[1]) {
      return sanitizeSection(match[1]);
    }
  }

  return "";
}

function normalizeScript(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/\*\*/g, "")
    .replace(/\r/g, "")
    .trim();
}

function recoverBody(text, sections) {
  const consumed = new Set(
    [sections.hook, sections.intro, sections.outro]
      .filter(Boolean)
      .map((section) => sanitizeSection(section).toLowerCase())
  );

  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => sanitizeSection(part))
    .filter(Boolean)
    .filter((part) => !/^[A-Z0-9][A-Z0-9 ]*:\s*$/.test(part))
    .filter((part) => !consumed.has(part.toLowerCase()));

  return paragraphs.find((part) => part.split(/\s+/).filter(Boolean).length >= 12) || "";
}

function sanitizeSection(text) {
  return String(text)
    .replace(/^\s*[-*]\s*/gm, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── YouTube metadata builders ─────────────────────────────
function buildTitle(hook, fmt) {
  const date = new Date().toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  // Use first 8 words of hook as title — more clickable than generic
  const hookWords = hook
    .replace(/[“”"]/g, "")
    .split(/\s+/)
    .slice(0, 8)
    .join(" ")
    .trim();
  const suffix = fmt.label === "Shorts" ? " #Shorts" : "";
  return `${hookWords} | ${date}${suffix}`.slice(0, 100);
}

function buildDescription(fullText, sections) {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return `${sections.hook}

${date} — ${CHANNEL_SLOGAN}

${fullText.slice(0, 300)}...


#GlobalEconomy #WorldNews #Economics #BusinessNews #Finance #Markets #Trading #EconomicAnalysis #EcoAnalyzer #Shorts #MoneyTips #InvestingNews #FinanceNews`;
}

function buildTags(stories) {
  const baseTags = [
    "global economy", "world news", "economics", "business news",
    "financial markets", "economic analysis", "market news",
    "world economic briefing", "finance", "investing", "trade",
    "economic forecast", "news briefing", "economy today",
  ];

  // Add topic-specific tags from story titles
  const topicTags = stories.flatMap(s => {
    const title = (s.title || "").toLowerCase();
    const tags  = [];
    if (/tariff|trade/.test(title))    tags.push("trade war", "tariffs");
    if (/tech|ai|chip/.test(title))    tags.push("technology stocks", "AI");
    if (/oil|energy/.test(title))      tags.push("oil prices", "energy markets");
    if (/fed|rate|inflation/.test(title)) tags.push("Federal Reserve", "interest rates", "inflation");
    if (/china/.test(title))           tags.push("China economy");
    if (/dollar|currency/.test(title)) tags.push("dollar", "forex");
    return tags;
  });

  return [...new Set([...baseTags, ...topicTags])].slice(0, 30);
}

// ── Fallback if Gemini fails ──────────────────────────────
function buildFallbackScript(stories, fmt, format) {
  const primary = stories[0];
  const sections = {
    hook: createFallbackHook(primary),
    intro: createFallbackIntro(primary),
    story1: createSingleStoryFallback(primary),
    story2: "",
    story3: "",
    story4: "",
    story5: "",
    outro: `Follow ${CHANNEL_HANDLE} for your daily economic edge.`,
  };
  const fullText = buildFullText(sections);

  return {
    channelName:  CHANNEL_NAME,
    channelSlogan: CHANNEL_SLOGAN,
    sections,
    fullText,
    wordCount:   fullText.split(/\s+/).length,
    format,
    imageTopics: Array.from({ length: 3 }, () => ({
      title: primary?.title || "",
      description: primary?.description || "",
      sectors: [],
      image: primary?.image || null,
      source: primary?.source || "",
    })),
    title:       buildTitle(sections.hook, fmt),
    description: buildDescription(fullText, sections),
    tags:        buildTags(stories),
    providerName: "deterministic-fallback",
    quality:     "fallback",
  };
}

function buildFullText(sections) {
  return [
    sections.hook,
    sections.intro,
    sections.story1,
    sections.story2,
    sections.story3,
    sections.story4,
    sections.story5,
    sections.outro,
  ].filter(Boolean).join(" ");
}

function createFallbackHook(story) {
  const topic = inferTopicLabel(story?.title || "");
  if (topic && topic !== "global risk sentiment") {
    return `A fresh shock in ${topic} is forcing global markets to rethink the outlook.`;
  }
  return "Global markets are repricing risk as a new wave of economic headlines lands.";
}

function createFallbackIntro(story) {
  const topic = inferTopicLabel(story?.title || "");
  return `This single development matters because ${topic || "global risk sentiment"} can quickly feed into pricing, confidence, and business decisions worldwide.`;
}

function createSingleStoryFallback(story) {
  if (!story) return "";
  const summary = sentenceCase(trimSentence(story.description || story.title || "Markets are reacting to new economic signals."));
  const lead = sentenceCase(trimSentence(story.title || "A major economic story is unfolding."));
  const topic = inferTopicLabel(story.title || "");
  return `${lead}. ${summary}. Investors will now watch how this shifts ${topic || "market sentiment"}, supply chains, and policy expectations over the next few sessions. Companies exposed to the story may need to rethink pricing, hiring, or inventory decisions. The broader risk is that one headline can spill into currencies, commodities, and capital flows much faster than expected.`;
}

function inferTopicLabel(title) {
  const lower = String(title).toLowerCase();
  if (/tariff|trade|export|import/.test(lower)) return "trade policy";
  if (/oil|gas|energy|opec|crude/.test(lower)) return "energy prices";
  if (/inflation|rate|fed|central bank/.test(lower)) return "interest-rate expectations";
  if (/market|stock|shares|index|bourse/.test(lower)) return "equity markets";
  if (/china|factory|manufacturing|pmi/.test(lower)) return "industrial demand";
  return "global risk sentiment";
}

function trimSentence(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.?!]+$/g, "");
}

function sentenceCase(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}
