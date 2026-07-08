#!/usr/bin/env node
// pipeline/run.js — World Economic Briefing — Fully automated video pipeline
//
// Usage:
//   node pipeline/run.js                      # one video (short, 55s)
//   node pipeline/run.js --format long        # one video (standard, 110s)
//   node pipeline/run.js --count 3            # 3 videos per run (different story sets)
//   node pipeline/run.js --no-upload          # generate only, no YouTube upload
//   node pipeline/run.js --private            # upload as private for review
//   node pipeline/run.js --schedule           # daily auto-run at 08:00 + 18:00

import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env", import.meta.url).pathname });

import { statSync } from "fs";
import { writeFile } from "fs/promises";
import { fetchHeadlines } from "../newsFetcher.js";
import { generateScript } from "./scriptGen.js";
import { generateVoice }  from "./voiceGen.js";
import { generateImages } from "./imageGen.js";
import { assembleVideo }  from "./videoAssembler.js";
import { addBackgroundMusic } from "./addMusic.js";
import { uploadToYouTube } from "./youtubeUploader.js";

// ── CLI args ──────────────────────────────────────────────
const args   = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) argMap[args[i].slice(2)] = args[i + 1] || true;
}

const format    = argMap.format   || "short";      // "short" | "long"
const count     = parseInt(argMap.count || "1");    // videos per run
const noUpload  = argMap["no-upload"] === true;
const privacy   = argMap.private ? "private" : "public";
const schedule  = argMap.schedule === true;
// --news N  → generate video for specific news item (1-based index)
// e.g. npm run pipeline:test -- --news 3  → use story #3
const newsIndex = argMap.news !== undefined ? parseInt(argMap.news) - 1 : null; // null = auto

async function saveVideoMetadata(videoResult, script, options = {}) {
  const metadataPath = videoResult.filepath.replace(/\.mp4$/i, ".json");
  const metadata = {
    title: script.title,
    description: script.description,
    tags: Array.isArray(script.tags) ? script.tags : [],
    privacyStatus: options.privacyStatus || "public",
    isShorts: options.isShorts !== false,
    createdAt: new Date().toISOString(),
  };

  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  return metadataPath;
}

// ── Single video pipeline ─────────────────────────────────
async function runOnce(newsItems, offset = 0, runId = 1) {
  const id  = `video_${runId}`;
  const log = (msg) => console.log(`[${id}] ${msg}`);
  const t0  = Date.now();

  // One video = one story. Multiple videos in the same run advance one story at a time.
  const storyWindow = newsItems.slice(offset, offset + 1);

  if (storyWindow.length < 1) {
    log("❌ Not enough stories for this slot, skipping");
    return null;
  }

  log(`Pipeline starting — format: ${format}, story ${offset + 1}`);

  try {
    // Step 1: Write original AI script
    log("Step 1/5 — Writing original AI script...");
    const script = await generateScript(storyWindow, format);
    log(`Script ready: ${script.wordCount} words`);
    log(`Title: "${script.title}"`);
    console.log("\n─── SCRIPT PREVIEW ──────────────────────────────");
    console.log(script.fullText.slice(0, 400) + "...");
    console.log("─────────────────────────────────────────────────\n");

    // Step 2: Generate voice narration
    log("Step 2/5 — Generating voice narration (Edge TTS)...");
    const audioResult = await generateVoice(script, id);
    log(`Audio: ~${audioResult.estimatedDuration}s`);

    // Step 3: Generate images
    log("Step 3/5 — Generating images (Pollinations.AI)...");
    const imageResults = await generateImages(script, id, format === "long" ? "youtube" : "shorts");
    log(`Images: ${imageResults.length} generated`);

    // Step 4: Assemble video
    log("Step 4/5 — Assembling video (ffmpeg)...");
    const videoResult = await assembleVideo(
      script, audioResult, imageResults, id,
      format === "long" ? "youtube" : "shorts"
    );
    log(`Video: ${videoResult.sizeMB}MB — ${videoResult.filepath}`);
    const metadataPath = await saveVideoMetadata(videoResult, script, {
      privacyStatus: privacy,
      isShorts: format === "short",
    });
    log(`Metadata saved: ${metadataPath}`);

    // Step 5: Add music and upload to YouTube
    let uploadResult = null;
    if (!noUpload) {
      log("Step 5/5 — Adding background music...");
      const musicVideoPath = await addBackgroundMusic(videoResult.filepath, {
        volumeLevel: 0.05,
        quiet: true,
      });
      const musicVideoStats = statSync(musicVideoPath);
      const uploadVideoResult = {
        ...videoResult,
        filepath: musicVideoPath,
        sizeMB: (musicVideoStats.size / 1024 / 1024).toFixed(1),
      };
      await saveVideoMetadata(uploadVideoResult, script, {
        privacyStatus: privacy,
        isShorts: format === "short",
      });
      log(`Music version ready: ${uploadVideoResult.filepath}`);
      log("Step 5/5 — Uploading to YouTube...");
      uploadResult = await uploadToYouTube(uploadVideoResult, script, {
        privacyStatus: privacy,
        isShorts:      format === "short",
      });
      log(`✅ Published: ${uploadResult.shortsUrl || uploadResult.url}`);
    } else {
      log("Step 4/4 — Upload skipped (--no-upload)");
      log(`📁 Video saved at: ${videoResult.filepath}`);
    }

    const elapsed = ((Date.now() - t0) / 60000).toFixed(1);
    log(`✅ Done in ${elapsed} minutes`);

    return { script, videoResult, uploadResult, elapsedMinutes: parseFloat(elapsed) };

  } catch (err) {
    console.error(`[${id}] ❌ Failed:`, err.message);
    console.error(err.stack);
    return null;
  }
}

// ── Run N videos per session ──────────────────────────────
async function runSession() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log(`║  🌍 World Economic Briefing Pipeline      ║`);
  console.log(`║  Format: ${format.padEnd(6)} | Videos: ${String(count).padEnd(2)} | ${privacy.padEnd(9)} ║`);
  console.log(`║  ${new Date().toLocaleString().padEnd(41)} ║`);
  console.log("╚══════════════════════════════════════════╝\n");

  // Fetch news ONCE and reuse across all videos in this session
  console.log("[Pipeline] Fetching global news...");
  const newsItems = await fetchHeadlines(10);
  console.log(`[Pipeline] Got ${newsItems.length} articles\n`);

  const results = [];
  for (let i = 0; i < count; i++) {
    // Offset one story at a time so each video maps to one article
    const offset = (newsIndex !== null) ? newsIndex : i;
    const result = await runOnce(newsItems, offset, i + 1);
    results.push(result);

    // Wait between videos to avoid API rate limits
    if (i < count - 1) {
      console.log("\n⏳ Waiting 45s before next video...\n");
      await new Promise(r => setTimeout(r, 45_000));
    }
  }

  console.log("\n══════════════ SESSION SUMMARY ══════════════");
  results.forEach((r, i) => {
    if (r) {
      const url = r.uploadResult?.shortsUrl || r.uploadResult?.url || r.videoResult?.filepath;
      console.log(`  ✅ Video ${i + 1} — ${r.elapsedMinutes}min — ${url}`);
      console.log(`     Title: "${r.script.title}"`);
    } else {
      console.log(`  ❌ Video ${i + 1} — Failed`);
    }
  });
  console.log("═════════════════════════════════════════════\n");

  return results;
}

// ── Scheduled mode — runs at 08:00 and 18:00 daily ───────
async function runScheduled() {
  console.log("📅 Scheduled mode — posting at 08:00 and 18:00 daily");
  console.log(`   Format: ${format} | Videos per run: ${count}\n`);

  // Run immediately
  await runSession();

  function msUntilNext() {
    const now    = new Date();
    const slots  = [8, 18]; // 08:00 and 18:00
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // Find next slot
    for (const h of slots) {
      const slotMin = h * 60;
      if (slotMin > nowMin) {
        const next = new Date(now);
        next.setHours(h, 0, 0, 0);
        return next - now;
      }
    }
    // Next is 08:00 tomorrow
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(8, 0, 0, 0);
    return next - now;
  }

  async function scheduleNext() {
    const ms = msUntilNext();
    const h  = Math.floor(ms / 3600000);
    const m  = Math.floor((ms % 3600000) / 60000);
    console.log(`⏰ Next run in ${h}h ${m}m`);

    setTimeout(async () => {
      await runSession();
      scheduleNext();
    }, ms);
  }

  scheduleNext();
}

// ── Entry point ───────────────────────────────────────────
if (schedule) {
  runScheduled().catch(console.error);
} else {
  runSession().catch(console.error);
}
