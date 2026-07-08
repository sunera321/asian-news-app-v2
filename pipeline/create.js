#!/usr/bin/env node
// pipeline/create.js — Full pipeline in one command
//
// Usage:
//   node pipeline/create.js                        # auto pick story #1
//   node pipeline/create.js --news 3               # pick story #3
//   node pipeline/create.js --news 3 --upload      # generate + add music + upload
//   node pipeline/create.js --news 3 --volume 0.12 # custom music volume
//   node pipeline/create.js --list                 # just show available stories

import { execSync, exec } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execAsync    = promisify(exec);
const PIPELINE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(PIPELINE_DIR, "..");
const VIDEO_DIR    = path.join(PIPELINE_DIR, "output", "videos");

// ── Parse CLI args ────────────────────────────────────────
const args   = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) argMap[args[i].slice(2)] = args[i+1] || true;
}

const newsNum  = argMap.news   || null;
const doUpload = argMap.upload === true;
const volume   = argMap.volume || "0.08";
const listOnly = argMap.list   === true;
const format   = argMap.format || "short";

// ── Find latest video in output dir ──────────────────────
function findLatestVideo(exclude = "") {
  if (!existsSync(VIDEO_DIR)) return null;
  return readdirSync(VIDEO_DIR)
    .filter(f => f.endsWith(".mp4") && !f.includes("_music") && f !== path.basename(exclude))
    .map(f => ({ f, t: statSync(path.join(VIDEO_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]?.f || null;
}

// ── Run a node script and stream its output ───────────────
function run(scriptPath, extraArgs = "", label = "") {
  const cmd = `node "${scriptPath}" ${extraArgs}`;
  if (label) {
    console.log(`\n${"═".repeat(50)}`);
    console.log(`  ${label}`);
    console.log(`${"═".repeat(50)}\n`);
  }
  // Stream output in real time
  execSync(cmd, { stdio: "inherit", cwd: PROJECT_ROOT });
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  console.log(`
╔══════════════════════════════════════════════════╗
║        🌍 World Economic Briefing                ║
║        One-Command Video Creator                 ║
╚══════════════════════════════════════════════════╝`);

  // ── STEP 0: just list stories ─────────────────────────
  if (listOnly) {
    console.log("\n📋 Fetching available stories...\n");
    run(
      path.join(PIPELINE_DIR, "run.js"),
      "--no-upload --count 0",
      ""
    );
    return;
  }

  const newsArg  = newsNum ? `--news ${newsNum}` : "";
  const fmtArg   = `--format ${format}`;

  // ── STEP 1: Generate video (no upload yet) ────────────
  run(
    path.join(PIPELINE_DIR, "run.js"),
    `${newsArg} ${fmtArg} --no-upload`,
    "STEP 1/3 — Generating Video"
  );

  // ── STEP 2: Add background music ──────────────────────
  const rawVideo = findLatestVideo();
  if (!rawVideo) {
    console.error("❌ Could not find generated video in pipeline/output/videos/");
    process.exit(1);
  }
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  STEP 2/3 — Adding Background Music`);
  console.log(`${"═".repeat(50)}\n`);
  console.log(`  Video:  ${rawVideo}`);
  console.log(`  Volume: ${(parseFloat(volume)*100).toFixed(0)}%\n`);

  run(
    path.join(PIPELINE_DIR, "addMusic.js"),
    `--video "${path.join(VIDEO_DIR, rawVideo)}" --volume ${volume}`,
    ""
  );

  // Find the music video (_music.mp4)
  const musicVideo = readdirSync(VIDEO_DIR)
    .filter(f => f.endsWith("_music.mp4"))
    .map(f => ({ f, t: statSync(path.join(VIDEO_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]?.f || null;

  if (!musicVideo) {
    console.error("❌ Music video not found after addMusic step");
    process.exit(1);
  }

  // ── STEP 3: Upload to YouTube (optional) ─────────────
  if (doUpload) {
    run(
      path.join(PIPELINE_DIR, "youtubeUploader.js"),
      `--file "${path.join(VIDEO_DIR, musicVideo)}"`,
      "STEP 3/3 — Uploading to YouTube"
    );
  } else {
    console.log(`\n${"═".repeat(50)}`);
    console.log(`  STEP 3/3 — Upload Skipped`);
    console.log(`${"═".repeat(50)}`);
    console.log(`\n  To upload manually:`);
    console.log(`  node pipeline/youtubeUploader.js --file "pipeline/output/videos/${musicVideo}"\n`);
  }

  // ── Summary ───────────────────────────────────────────
  const elapsed  = ((Date.now() - startTime) / 60000).toFixed(1);
  const sizeMB   = musicVideo
    ? (statSync(path.join(VIDEO_DIR, musicVideo)).size / 1024 / 1024).toFixed(1)
    : "?";

  console.log(`
╔══════════════════════════════════════════════════╗
║  ✅ COMPLETE in ${elapsed.padEnd(5)} minutes                  ║
╠══════════════════════════════════════════════════╣
║  📁 File:    ${musicVideo?.slice(0,35).padEnd(35)} ║
║  📦 Size:    ${(sizeMB + "MB").padEnd(35)} ║
║  📤 Uploaded: ${(doUpload ? "Yes ✅" : "No  (add --upload)").padEnd(34)}║
╚══════════════════════════════════════════════════╝
`);
}

main().catch(err => {
  console.error("\n❌ Pipeline failed:", err.message);
  process.exit(1);
});
