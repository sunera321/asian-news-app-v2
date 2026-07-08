#!/usr/bin/env node
// daily.js — Full daily pipeline: 10 videos, music, YouTube upload
//
// Usage:
//   node pipeline/daily.js                  # run all 10 stories
//   node pipeline/daily.js --dry-run        # generate + music, skip upload
//   node pipeline/daily.js --stories 1,3,5  # specific story numbers only
//   node pipeline/daily.js --start 1        # start from story #1 (resume)
//   node pipeline/daily.js --break 10       # custom break in minutes (default 10)
//
// Cron example (run every day at 1:30 AM):
//   30 1 * * * cd /home/sunera/Desktop/Script/news/world-economic-briefing-FINAL/asian-news-app-v2 && node pipeline/daily.js >> logs/daily.log 2>&1

import dotenv from "dotenv";
dotenv.config();

import { execSync, exec, spawn } from "child_process";
import { existsSync, mkdirSync,
         readdirSync, statSync,
         appendFileSync }        from "fs";
import { promisify }             from "util";
import path                      from "path";
import { fileURLToPath }         from "url";

const execAsync    = promisify(exec);
const PIPELINE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT         = path.join(PIPELINE_DIR, "..");
const VIDEO_DIR    = path.join(PIPELINE_DIR, "output", "videos");
const LOG_DIR      = path.join(ROOT, "logs");

// ── Ensure dirs exist ─────────────────────────────────────
mkdirSync(VIDEO_DIR, { recursive: true });
mkdirSync(LOG_DIR,   { recursive: true });

// ── CLI args ──────────────────────────────────────────────
const args   = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) argMap[args[i].slice(2)] = args[i+1] || true;
}

const isDryRun    = argMap["dry-run"]  === true;
const breakMins   = parseInt(argMap.break  || "10");
const startFrom   = parseInt(argMap.start  || "1");
const storiesArg  = argMap.stories
  ? argMap.stories.split(",").map(n => parseInt(n.trim()))
  : null;

// Stories to process: either specific list, or 1–10 starting from --start
const storyNums = storiesArg || Array.from({ length: 10 }, (_, i) => i + startFrom);

// ── Logging ───────────────────────────────────────────────
const logFile = path.join(LOG_DIR, `daily_${dateStamp()}.log`);
function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}
function timeStamp() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}
function log(msg) {
  const line = `[${timeStamp()}] ${msg}`;
  console.log(line);
  appendFileSync(logFile, line + "\n");
}
function logSection(title) {
  const bar = "═".repeat(50);
  log(bar);
  log(`  ${title}`);
  log(bar);
}

// ── Helper: find latest video (not _music) ────────────────
function findLatestVideo() {
  const files = readdirSync(VIDEO_DIR)
    .filter(f => f.endsWith(".mp4") && !f.includes("_music"))
    .map(f => ({
      name:  f,
      path:  path.join(VIDEO_DIR, f),
      mtime: statSync(path.join(VIDEO_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path || null;
}

// ── Helper: find latest _music video ─────────────────────
function findLatestMusicVideo() {
  const files = readdirSync(VIDEO_DIR)
    .filter(f => f.endsWith("_music.mp4"))
    .map(f => ({
      name:  f,
      path:  path.join(VIDEO_DIR, f),
      mtime: statSync(path.join(VIDEO_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path || null;
}

// ── Helper: run command and stream output ─────────────────
async function run(cmd, label) {
  log(`  ▶ ${label} (streaming output...)`);

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, {
      cwd: ROOT,
      shell: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const logChunk = (chunk, isErr = false) => {
      const text = chunk.toString();
      if (!text) return;
      if (isErr) stderr += text; else stdout += text;
      text.split(/\r?\n/).forEach(line => {
        if (line.trim()) log(`    ${line}`);
      });
    };

    child.stdout.on("data", chunk => logChunk(chunk, false));
    child.stderr.on("data", chunk => logChunk(chunk, true));
    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) resolve(stdout + stderr);
      else reject(new Error(`Command failed with exit code ${code}: ${cmd}`));
    });
  });
}

// ── Sleep ─────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
function countdown(mins) {
  return new Promise(async (resolve) => {
    const total = mins * 60;
    for (let s = total; s > 0; s -= 30) {
      const remaining = Math.ceil(s / 60);
      log(`  ⏳ Break: ${remaining} min remaining...`);
      await sleep(Math.min(30_000, s * 1000));
    }
    resolve();
  });
}

// ── Single story pipeline ─────────────────────────────────
async function processstory(storyNum, index, total) {
  logSection(`STORY ${storyNum}  (${index + 1}/${total})`);
  const startTime = Date.now();
  const result    = { storyNum, success: false, url: null, error: null };

  try {
    // STEP 1 — Generate video
    log(`[1/3] Generating video for story #${storyNum}...`);
    await run(
      `node pipeline/run.js --news ${storyNum} --no-upload`,
      `Generate video (story #${storyNum})`
    );

    const rawVideo = findLatestVideo();
    if (!rawVideo) throw new Error("Video file not found after generation");
    log(`  ✅ Video created: ${path.basename(rawVideo)}`);

    // STEP 2 — Add music
    log(`[2/3] Adding background music...`);
    await run(
      `node pipeline/addMusic.js --video "${rawVideo}" --volume 0.05`,
      "Add music"
    );

    const musicVideo = findLatestMusicVideo();
    if (!musicVideo) throw new Error("Music video not found after processing");
    log(`  ✅ Music added: ${path.basename(musicVideo)}`);

    // STEP 3 — Upload (skip in dry-run)
    if (isDryRun) {
      log(`[3/3] SKIPPED upload (--dry-run)`);
      log(`  📁 File ready at: ${musicVideo}`);
      result.success = true;
    } else {
      log(`[3/3] Uploading to YouTube...`);
      const uploadOut = await run(
        `node pipeline/youtubeUploader.js --file "${musicVideo}"`,
        "Upload to YouTube"
      );

      // Extract URL from output
      const urlMatch = uploadOut.match(/https:\/\/youtube\.com\/\S+/);
      result.url = urlMatch ? urlMatch[0] : "uploaded (check YouTube Studio)";
      log(`  ✅ Uploaded: ${result.url}`);
      result.success = true;
    }

  } catch (err) {
    result.error = err.message;
    log(`  ❌ FAILED: ${err.message}`);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log(`  ⏱  Total time: ${elapsed}s`);
  return result;
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  const runDate = new Date().toLocaleString("en-GB");

  logSection(`WORLD ECONOMIC BRIEFING — DAILY PIPELINE`);
  log(`Date:      ${runDate}`);
  log(`Stories:   ${storyNums.join(", ")}`);
  log(`Mode:      ${isDryRun ? "DRY RUN (no upload)" : "LIVE (will upload)"}`);
  log(`Break:     ${breakMins} minutes between videos`);
  log(`Log file:  ${logFile}`);
  log("");

  const results = [];

  for (let i = 0; i < storyNums.length; i++) {
    const storyNum = storyNums[i];
    const result   = await processstory(storyNum, i, storyNums.length);
    results.push(result);

    // Break between stories (not after last one)
    if (i < storyNums.length - 1) {
      log("");
      log(`⏸  Taking ${breakMins}-minute break before next video...`);
      await countdown(breakMins);
      log("");
    }
  }

  // ── Final summary ──────────────────────────────────────
  logSection("DAILY PIPELINE COMPLETE — SUMMARY");

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  log(`✅ Successful: ${passed.length}/${results.length}`);
  if (failed.length) {
    log(`❌ Failed:     ${failed.length}/${results.length}`);
    failed.forEach(r => log(`   Story #${r.storyNum}: ${r.error}`));
  }

  log("");
  log("Published videos:");
  passed.forEach(r => {
    log(`  Story #${r.storyNum}: ${r.url || "(dry run)"}`);
  });

  log("");
  log(`Full log saved to: ${logFile}`);
  log("");
}

main().catch(err => {
  log(`\n💥 FATAL ERROR: ${err.message}`);
  process.exit(1);
});
