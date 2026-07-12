#!/usr/bin/env node
// addMusic.js — Add background music to an existing video file
//
// Usage:
//   node pipeline/addMusic.js                              # adds music to latest video
//   node pipeline/addMusic.js --video output/video.mp4    # specific video file
//   node pipeline/addMusic.js --music my_track.mp3        # custom music file
//   node pipeline/addMusic.js --volume 0.08               # adjust music volume (default 0.08)
//   node pipeline/addMusic.js --video vid.mp4 --preview   # preview 10s before full render

import { exec, execSync } from "child_process";
import { existsSync, readdirSync, statSync, copyFileSync } from "fs";
import { promisify } from "util";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

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

const volumeLevel = parseFloat(argMap.volume || "0.08");
const isPreview   = argMap.preview === true;
const musicArg    = argMap.music || null;
const videoArg    = argMap.video || null;
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// ── Find the video file ───────────────────────────────────
function findLatestVideo() {
  if (!existsSync(VIDEO_DIR)) throw new Error(`Video output dir not found: ${VIDEO_DIR}`);
  const files = readdirSync(VIDEO_DIR)
    .filter(f => f.endsWith(".mp4") && !f.includes("_music"))
    .map(f => ({ name: f, path: path.join(VIDEO_DIR, f), mtime: statSync(path.join(VIDEO_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) throw new Error("No MP4 files found in pipeline/output/videos/");
  return files[0].path;
}

// ── Find the music file ───────────────────────────────────
function findMusic(customMusicArg = null) {
  const targetMusicArg = customMusicArg || musicArg;
  if (targetMusicArg) {
    for (const base of [process.cwd(), PROJECT_ROOT, PIPELINE_DIR]) {
      const p = path.resolve(base, targetMusicArg);
      if (existsSync(p)) return p;
    }
    throw new Error(`Music file not found: ${targetMusicArg}`);
  }
  const defaults = [
    path.join(PROJECT_ROOT, "back.mp3"),
    path.join(PROJECT_ROOT, "music.mp3"),
    path.join(PROJECT_ROOT, "background.mp3"),
  ];
  for (const p of defaults) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "No music file found. Place back.mp3 in the project root, or use --music path/to/file.mp3"
  );
}

// ── Get audio/video duration ──────────────────────────────
async function getDuration(filepath) {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filepath}"`
  );
  return parseFloat(stdout.trim()) || 0;
}

// ── Check if video already has loud audio (voice) ─────────
async function getAudioInfo(filepath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -show_streams -select_streams a -of json "${filepath}"`
    );
    const data = JSON.parse(stdout);
    return data.streams?.length > 0;
  } catch {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────
export async function addBackgroundMusic(videoPath, options = {}) {
  const resolvedVideoPath = path.resolve(process.cwd(), videoPath);
  const volume = options.volumeLevel ?? volumeLevel;
  const previewMode = options.isPreview ?? isPreview;
  const customMusicPath = options.musicPath || null;
  const quiet = options.quiet === true;

  if (!quiet) {
    console.log("\n🎵 addMusic.js — Background Music Adder");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  }

  if (!existsSync(resolvedVideoPath)) throw new Error(`Video not found: ${resolvedVideoPath}`);
  if (!quiet) console.log(`📹 Video:  ${path.basename(resolvedVideoPath)}`);

  const musicPath = customMusicPath
    ? path.resolve(process.cwd(), customMusicPath)
    : findMusic(options.musicArg || null);

  if (!quiet) {
    console.log(`🎵 Music:  ${path.basename(musicPath)}`);
    console.log(`🔊 Volume: ${(volume * 100).toFixed(0)}%`);
  }

  const videoDur = await getDuration(resolvedVideoPath);
  const musicDur = await getDuration(musicPath);
  if (!quiet) {
    console.log(`⏱️  Video: ${videoDur.toFixed(1)}s | Music: ${musicDur.toFixed(1)}s\n`);
  }

  if (videoDur === 0) throw new Error("Could not determine video duration");

  const base    = path.basename(resolvedVideoPath, ".mp4");
  const outPath = path.join(VIDEO_DIR, `${base}_music.mp4`);

  const fadeOut  = Math.max(1, videoDur - 2).toFixed(1);
  const duration = previewMode ? "10" : videoDur.toFixed(3);

  const cmd = [
    "ffmpeg -y",
    `-i "${resolvedVideoPath}"`,
    `-i "${musicPath}"`,
    `-filter_complex "[1:a]atrim=0:${videoDur.toFixed(3)},afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOut}:d=2,volume=${volume},aformat=channel_layouts=stereo[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]"`,
    `-map 0:v -map "[aout]"`,
    `-c:v copy`,
    `-c:a aac -b:a 192k -ar 44100 -ac 2`,
    previewMode ? `-t ${duration}` : "",
    `-movflags +faststart`,
    `"${outPath}"`,
  ].filter(Boolean).join(" ");

  if (!quiet) {
    console.log(`⚙️  Processing${previewMode ? " (PREVIEW - 10s)" : ""}...`);
    if (previewMode) console.log("   (use without --preview for full video)\n");
  }

  const start = Date.now();
  const { stderr } = await execAsync(cmd, { timeout: 300_000 });

  if (!existsSync(outPath)) {
    throw new Error("Output file not created. ffmpeg error:\n" + stderr.slice(-500));
  }

  // Carry the metadata sidecar (title/description/tags) over to the _music
  // filename — otherwise youtubeUploader.js can't find it and falls back to
  // a filename-derived title when uploading this file.
  const metadataPath = resolvedVideoPath.replace(/\.mp4$/i, ".json");
  const outMetadataPath = outPath.replace(/\.mp4$/i, ".json");
  if (existsSync(metadataPath) && metadataPath !== outMetadataPath) {
    copyFileSync(metadataPath, outMetadataPath);
    if (!quiet) console.log(`📄 Metadata carried over: ${path.basename(outMetadataPath)}`);
  }

  const sizeMB  = (statSync(outPath).size / 1024 / 1024).toFixed(1);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!quiet) {
    console.log(`✅ Done in ${elapsed}s`);
    console.log(`📁 Output: ${outPath}`);
    console.log(`📦 Size:   ${sizeMB}MB\n`);

    const { stdout: probeOut } = await execAsync(
      `ffprobe -v quiet -show_entries stream=codec_name,channels -select_streams a -of compact "${outPath}"`
    );
    console.log(`🔍 Audio streams: ${probeOut.trim()}`);
    console.log("\n✅ Ready to upload!\n");
  }

  return outPath;
}

if (isDirectRun) {
  main().catch(err => {
    console.error("\n❌ Error:", err.message);
    process.exit(1);
  });
}

async function main() {
  const videoPath = videoArg ? path.resolve(process.cwd(), videoArg) : findLatestVideo();
  return addBackgroundMusic(videoPath, {
    volumeLevel,
    isPreview,
    musicArg,
  });
}
