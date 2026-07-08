// voiceGen.js — Free TTS using Microsoft Edge's Read Aloud API
// No API key needed. Server-side only (not browser).
// Uses msedge-tts npm package.

import { mkdir } from "fs/promises";
import path from "path";
import { webcrypto as nodeWebCrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = nodeWebCrypto;
}

async function loadMsEdgeTTS() {
  return import("msedge-tts");
}

const OUTPUT_DIR = new URL("output/audio", import.meta.url).pathname;

// High-quality voices for news reading
const VOICES = {
  default:  "en-US-AndrewMultilingualNeural",   // clear male news voice
  female:   "en-US-EmmaMultilingualNeural",       // clear female news voice
  british:  "en-GB-RyanNeural",                   // British accent (more "news" feel)
};

export async function generateVoice(script, runId, voiceKey = "british") {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const voice    = VOICES[voiceKey] || VOICES.default;
  const filename = `${runId}_${Date.now()}.mp3`;
  const filepath = path.join(OUTPUT_DIR, filename);

  console.log(`[TTS] Generating audio with voice: ${voice}`);
  console.log(`[TTS] Text length: ${script.fullText.length} chars (~${script.wordCount} words)`);

  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await loadMsEdgeTTS();
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const { audioFilePath } = await tts.toFile(
      OUTPUT_DIR,
      script.fullText,
      {
        rate:   "+0%",    // normal speed
        pitch:  "-5%",    // slightly lower pitch — more authoritative
        volume: "+0%",
      }
    );

    // Rename to our filename convention
    const { rename } = await import("fs/promises");
    await rename(audioFilePath, filepath);

    // Get audio duration estimate (words / 140 wpm average for news)
    const estimatedDuration = Math.ceil((script.wordCount / 140) * 60);
    console.log(`[TTS] ✅ Audio saved: ${filepath} (${estimatedDuration}s estimated)`);

    return {
      filepath,
      filename,
      estimatedDuration,
      voice,
    };

  } catch (err) {
    console.error("[TTS] ❌ Edge TTS failed:", err.message);
    throw new Error(`Voice generation failed: ${err.message}`);
  }
}

// Generate per-section audio for more precise subtitle timing
export async function generateVoiceSections(script, countryCode) {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const { MsEdgeTTS, OUTPUT_FORMAT } = await loadMsEdgeTTS();
  const voice = VOICES.british;
  const tts   = new MsEdgeTTS();
  await tts.setMetadata(
    voice,
    OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
    { wordBoundaryEnabled: true }
  );

  const sections  = [];
  const sectionKeys = ["hook", "intro", "story1", "story2", "story3", "outro"];

  for (const key of sectionKeys) {
    const text = script.sections[key];
    if (!text) continue;

    const filename = `${countryCode}_${key}_${Date.now()}.mp3`;
    const filepath = path.join(OUTPUT_DIR, filename);

    try {
      const { audioFilePath } = await tts.toFile(OUTPUT_DIR, text, { rate: "+0%", pitch: "-5%" });
      const { rename } = await import("fs/promises");
      await rename(audioFilePath, filepath);
      sections.push({ key, text, filepath });
      console.log(`[TTS] ✅ Section "${key}" done`);
    } catch (err) {
      console.warn(`[TTS] ⚠️ Section "${key}" failed:`, err.message);
    }
  }

  return sections;
}
