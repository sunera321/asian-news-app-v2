// imageGen.js — Story-specific image generation
// Uses AI-written prompts from scriptGen.js when available.
// Falls back to keyword-based prompts if AI prompts not present.

import { writeFile, mkdir } from "fs/promises";
import { statSync } from "fs";
import path from "path";

const OUTPUT_DIR = new URL("output/images", import.meta.url).pathname;

const FORMATS = {
  shorts:  { width: 1080, height: 1920 },
  youtube: { width: 1280, height: 720  },
};

// Fallback: extract visual keywords from title
function extractKeywords(title) {
  if (!title) return "global economy financial news";
  const filler = /\b(the|a|an|is|are|has|have|been|to|of|in|on|at|by|for|with|that|this|it|its|was|will|be|new|says|said|now|just|after|before|as|but|how|why)\b/gi;
  return title.replace(filler," ").replace(/\s+/g," ").trim().split(" ").filter(w=>w.length>2).slice(0,8).join(" ");
}

// Fallback shot styles when no AI prompts available
const FALLBACK_STYLES = [
  { style: "cinematic wide shot, dramatic golden hour lighting, photojournalism, 8K, no text",       seedOff: 0     },
  { style: "close-up documentary photo, shallow depth of field, natural light, magazine quality, no text", seedOff: 29999 },
  { style: "aerial drone overhead view, geometric composition, vivid colours, ultra realistic, no text",   seedOff: 59999 },
  { style: "dramatic night scene, neon reflections, cinematic mood, high contrast photography, no text",   seedOff: 89999 },
];

function seedFromText(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return Math.abs(h) % 89999;
}

export async function generateImages(script, runId, format = "shorts") {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const { width, height } = FORMATS[format] || FORMATS.shorts;
  const imageTopics = script.imageTopics || [];
  const primaryTitle = imageTopics[0]?.title || script.sections?.hook || "global economy";
  const keywords     = extractKeywords(primaryTitle);
  const baseSeed     = seedFromText(primaryTitle);

  console.log(`[Images] Story: "${primaryTitle.slice(0,70)}"`);

  // Check if AI-generated prompts exist
  const hasAiPrompts = imageTopics.some(t => t.aiPrompt);
  if (hasAiPrompts) {
    console.log(`[Images] ✅ Using AI-generated story-specific prompts`);
  } else {
    console.log(`[Images] Using keyword fallback prompts: "${keywords}"`);
  }
  console.log(`[Images] Generating 4 images (${width}×${height})\n`);

  const results = [];

  for (let i = 0; i < 4; i++) {
    const topic    = imageTopics[i] || imageTopics[0] || {};
    const filename = `${runId}_img${i+1}.jpg`;
    const filepath = path.join(OUTPUT_DIR, filename);

    // Slot 0: try real article photo first
    if (i === 0 && topic.image) {
      console.log(`[Images] [1/4] Article photo: ${topic.image.slice(0,65)}...`);
      try {
        await downloadWithTimeout(topic.image, filepath, 20_000);
        const kb = Math.round(statSync(filepath).size / 1024);
        if (kb < 10) throw new Error(`Too small (${kb}KB)`);
        console.log(`[Images] ✅ [1/4] Article photo saved (${kb}KB)`);
        results.push({ index:0, filepath, source:"article" });
        await sleep(500);
        continue;
      } catch(err) {
        console.warn(`[Images] ⚠️  Article photo failed: ${err.message}`);
      }
    }

    // Build prompt — prefer AI-written, fall back to keyword template
    let prompt;
    if (topic.aiPrompt) {
      // Use the AI-generated specific prompt directly
      prompt = topic.aiPrompt;
      console.log(`[Images] [${i+1}/4] AI prompt: "${prompt.slice(0,70)}..."`);
    } else {
      // Fallback: keyword + style template
      const style = FALLBACK_STYLES[i % FALLBACK_STYLES.length];
      prompt = `${keywords}, ${style.style}`;
      console.log(`[Images] [${i+1}/4] Fallback: "${prompt.slice(0,70)}..."`);
    }

    const seed = (baseSeed + (i * 30000)) % 99991;
    const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
      + `?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux&enhance=true`;

    try {
      await downloadWithTimeout(url, filepath, 90_000);
      const kb = Math.round(statSync(filepath).size / 1024);
      if (kb < 20) throw new Error(`Too small (${kb}KB)`);
      console.log(`[Images] ✅ [${i+1}/4] Saved (${kb}KB)`);
      results.push({ index:i, filepath, source:"pollinations", prompt });
    } catch(err) {
      console.error(`[Images] ❌ [${i+1}/4] Failed: ${err.message}`);
      try {
        const fbUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(keywords + " news photography")}`
          + `?width=${width}&height=${height}&seed=${seed+3}&nologo=true&model=turbo`;
        await downloadWithTimeout(fbUrl, filepath, 45_000);
        console.log(`[Images] ✅ [${i+1}/4] Fallback saved`);
        results.push({ index:i, filepath, source:"turbo-fallback" });
      } catch(e2) {
        console.error(`[Images] ❌ [${i+1}/4] Fallback also failed`);
      }
    }

    if (i < 3) await sleep(2500);
  }

  console.log(`\n[Images] ${results.length}/4 images ready`);
  return results;
}

async function downloadWithTimeout(url, filepath, timeout) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AEL/2.0)" },
    signal:  AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 8000) throw new Error(`Response too small (${buf.byteLength}B)`);
  await writeFile(filepath, buf);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
