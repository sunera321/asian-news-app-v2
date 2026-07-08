// youtubeUploader.js — Uploads an MP4 to YouTube using Data API v3
// Free: 100 uploads/day on default quota (as of Dec 2025 change)
//
// SETUP (one-time):
//   1. Go to https://console.cloud.google.com
//   2. Enable "YouTube Data API v3"
//   3. Create OAuth 2.0 credentials (type: Desktop app)
//   4. Download client_secret.json
//   5. Run: node pipeline/youtubeUploader.js --auth
//      This opens your browser, you log in, it saves refresh token to .env
//
// After auth, uploads are fully automatic.

import { createReadStream, existsSync, readdirSync, statSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env", import.meta.url).pathname });

const CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;
const TOKEN_URL     = "https://oauth2.googleapis.com/token";
const UPLOAD_URL    = "https://www.googleapis.com/upload/youtube/v3/videos";

function parseArgs(argv = process.argv.slice(2)) {
  const argMap = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      argMap[key] = next;
      i++;
    } else {
      argMap[key] = true;
    }
  }
  return argMap;
}

function printUsage() {
  console.log("Usage:");
  console.log("  node pipeline/youtubeUploader.js --auth");
  console.log("  node pipeline/youtubeUploader.js --file pipeline/output/videos/video_1_1234.mp4");
  console.log("  npm run pipeline:upload -- --file pipeline/output/videos/video_1_1234.mp4");
  console.log("\nOptional flags:");
  console.log('  --title "title"         Override video title');
  console.log('  --description "text"     Override video description');
  console.log("  --tags tag1,tag2         Set tags as a comma-separated list");
  console.log("  --private                Upload as private");
  console.log("  --unlisted               Upload as unlisted");
  console.log("  --no-shorts              Upload as a regular video");
  console.log("  --dry-run                Show the target file and metadata without uploading");
}

async function getAccessToken() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error(
      "Missing YouTube credentials. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN in .env\n" +
      "Run: node pipeline/youtubeUploader.js --auth to set up"
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type:    "refresh_token",
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

function resolveVideoPath(argMap) {
  const explicit = argMap.file || argMap.video;
  if (explicit) return path.resolve(process.cwd(), explicit);

  const outputDir = path.resolve(process.cwd(), "pipeline/output/videos");
  if (!existsSync(outputDir)) return null;

  const files = readdirSync(outputDir)
    .filter(name => name.toLowerCase().endsWith(".mp4"))
    .map(name => ({ name, fullPath: path.join(outputDir, name), mtimeMs: statSync(path.join(outputDir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files[0]?.fullPath || null;
}

async function loadMetadataFromFile(videoPath) {
  const metadataPath = videoPath.replace(/\.mp4$/i, ".json");
  if (!existsSync(metadataPath)) return null;
  const raw = await readFile(metadataPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildFallbackMetadata(videoPath) {
  const fileName = path.basename(videoPath, path.extname(videoPath));
  return {
    title: fileName.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    description: `Uploaded video from ${path.basename(videoPath)}`,
    tags: ["news", "video", "automation"],
    privacyStatus: "public",
    isShorts: true,
  };
}

async function buildUploadMetadata(videoPath, options = {}) {
  const savedMeta = await loadMetadataFromFile(videoPath);
  const fallback = buildFallbackMetadata(videoPath);

  const tags = Array.isArray(options.tags)
    ? options.tags
    : (typeof options.tags === "string"
        ? options.tags.split(",").map(tag => tag.trim()).filter(Boolean)
        : (Array.isArray(savedMeta?.tags) ? savedMeta.tags : fallback.tags));

  const privacyStatus = options.private
    ? "private"
    : options.unlisted
      ? "unlisted"
      : (savedMeta?.privacyStatus || fallback.privacyStatus);

  const isShorts = options["no-shorts"]
    ? false
    : (options.shorts === false ? false : (savedMeta?.isShorts ?? fallback.isShorts));

  return {
    title: options.title || savedMeta?.title || fallback.title,
    description: options.description || savedMeta?.description || fallback.description,
    tags,
    privacyStatus,
    isShorts,
  };
}

export async function uploadToYouTube(videoResult, script, options = {}) {
  const {
    privacyStatus = "public",
    isShorts      = true,
    categoryId    = "25",
    madeForKids   = false,
  } = options;

  console.log("[YouTube] Starting upload...");
  const accessToken = await getAccessToken();

  const title = String(script.title || "Generated video").slice(0, 100);
  const description = String(script.description || "").slice(0, 5000);
  const tags = Array.isArray(script.tags)
    ? script.tags.filter(Boolean).slice(0, 50)
    : String(script.tags || "")
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, 50);

  const metadata = {
    snippet: {
      title,
      description,
      tags,
      categoryId,
      defaultLanguage: "en",
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: madeForKids,
    },
  };

  const fileSize = statSync(videoResult.filepath).size;
  const initRes  = await fetch(
    `${UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization:           `Bearer ${accessToken}`,
        "Content-Type":          "application/json",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(fileSize),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Upload init failed (${initRes.status}): ${err.slice(0, 200)}`);
  }

  const uploadUri = initRes.headers.get("location");
  if (!uploadUri) throw new Error("No upload URI returned from YouTube");

  console.log(`[YouTube] Upload session created. File size: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);

  const CHUNK_SIZE  = 8 * 1024 * 1024;
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  let uploadedBytes = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start     = chunkIndex * CHUNK_SIZE;
    const end       = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
    const chunkSize = end - start + 1;
    const chunkBuffer = await readChunk(videoResult.filepath, start, chunkSize);

    const chunkRes = await fetch(uploadUri, {
      method: "PUT",
      headers: {
        Authorization:    `Bearer ${accessToken}`,
        "Content-Type":   "video/mp4",
        "Content-Range":  `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": String(chunkSize),
      },
      body: chunkBuffer,
    });

    uploadedBytes += chunkSize;
    const progress = Math.round((uploadedBytes / fileSize) * 100);
    console.log(`[YouTube] Upload progress: ${progress}% (${(uploadedBytes / 1024 / 1024).toFixed(1)}MB / ${(fileSize / 1024 / 1024).toFixed(1)}MB)`);

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      const data = await chunkRes.json();
      console.log(`[YouTube] ✅ Upload complete!`);
      console.log(`[YouTube] Video ID: ${data.id}`);
      console.log(`[YouTube] URL: https://youtube.com/watch?v=${data.id}`);
      if (isShorts) console.log(`[YouTube] Shorts URL: https://youtube.com/shorts/${data.id}`);
      return {
        videoId:   data.id,
        url:       `https://youtube.com/watch?v=${data.id}`,
        shortsUrl: `https://youtube.com/shorts/${data.id}`,
        title:     data.snippet?.title,
      };
    } else if (chunkRes.status !== 308) {
      const err = await chunkRes.text();
      throw new Error(`Chunk upload failed (${chunkRes.status}): ${err.slice(0, 200)}`);
    }
  }

  throw new Error("Upload finished all chunks but never got a 200/201 response");
}

export async function uploadExistingVideo(videoPath, options = {}) {
  const metadata = await buildUploadMetadata(videoPath, options);
  return uploadToYouTube({ filepath: videoPath }, {
    title: metadata.title,
    description: metadata.description,
    tags: metadata.tags,
  }, {
    privacyStatus: metadata.privacyStatus,
    isShorts: metadata.isShorts,
  });
}

async function readChunk(filepath, start, length) {
  return new Promise((resolve, reject) => {
    const stream  = createReadStream(filepath, { start, end: start + length - 1 });
    const chunks  = [];
    stream.on("data", chunk => chunks.push(chunk));
    stream.on("end",  ()    => resolve(Buffer.concat(chunks)));
    stream.on("error", err  => reject(err));
  });
}

async function runAuthFlow() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env first");
    console.error("Get these from: https://console.cloud.google.com → APIs & Services → Credentials");
    process.exit(1);
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?`
    + `client_id=${CLIENT_ID}`
    + `&redirect_uri=urn:ietf:wg:oauth:2.0:oob`
    + `&response_type=code`
    + `&scope=https://www.googleapis.com/auth/youtube.upload`
    + `&access_type=offline`
    + `&prompt=select_account`;

  console.log("\n🔑 YOUTUBE AUTH SETUP\n");
  console.log("1. Open this URL in your browser:");
  console.log(authUrl);
  console.log("\n2. Sign in with your YouTube channel account");
  console.log("3. Paste the auth code below:\n");

  process.stdout.write("Auth code: ");
  const { createInterface } = await import("readline");
  const code = await new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.once("line", line => { rl.close(); resolve(line.trim()); });
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type:    "authorization_code",
      redirect_uri:  "urn:ietf:wg:oauth:2.0:oob",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.refresh_token) {
    console.error("❌ No refresh token received:", tokens);
    process.exit(1);
  }

  console.log("\n✅ Auth successful! Add to your .env:\n");
  console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("\nYouTube uploads will now work automatically.");
}

async function runUploadCli() {
  const argMap = parseArgs(process.argv.slice(2));
  if (argMap.help || argMap.h) {
    printUsage();
    return;
  }

  if (argMap.auth) {
    await runAuthFlow();
    return;
  }

  const videoPath = resolveVideoPath(argMap);
  if (!videoPath) {
    throw new Error("No video file found. Pass --file <path> or generate one first.");
  }

  const metadata = await buildUploadMetadata(videoPath, argMap);
  console.log(`[Upload] Video file: ${videoPath}`);
  console.log(`[Upload] Title: ${metadata.title}`);

  if (argMap["dry-run"]) {
    console.log("[Upload] Dry run only — no upload was performed.");
    return;
  }

  await uploadExistingVideo(videoPath, argMap);
}

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);

// Only run the CLI portion when this file is executed directly (not when imported).
if (process.argv[1] === __filename) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
  } else if (argv[0] === "--auth") {
    runAuthFlow().catch(console.error);
  } else {
    runUploadCli().catch(console.error);
  }
}
