// videoAssembler.js v8 — Real images as card backgrounds + text overlay
// Uses downloaded article/AI images as backgrounds, overlays text on top.
// Falls back to gradient cards if images unavailable.

import { exec, execSync } from "child_process";
import { writeFile, mkdir, rm } from "fs/promises";
import { existsSync, statSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { promisify } from "util";

const execAsync    = promisify(exec);
const OUTPUT_DIR   = new URL("output/videos",  import.meta.url).pathname;
const PIPELINE_DIR = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_PY  = path.join(PIPELINE_DIR, "cardRenderer.py");

function hasFfmpeg() {
  try { execSync("ffmpeg -version", { stdio:"ignore" }); return true; }
  catch { return false; }
}

async function getAudioDuration(fp) {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${fp}"`
  );
  return parseFloat(stdout.trim()) || 60;
}

// ── Render gradient cards via Python (fallback or text overlay cards) ──────
async function renderTextCards(script, tmpDir) {
  const sentiment = script.sentiment || "neutral";
  const accent    = sentiment==="negative"?"#DC2626":sentiment==="positive"?"#22C55E":"#3B82F6";
  const scheme    = sentiment==="negative"?"red":sentiment==="positive"?"green":"blue";
  const tag       = sentiment==="negative"?"▼  BREAKING":sentiment==="positive"?"▲  POSITIVE NEWS":"●  MARKET NEWS";

  const hook  = script.sections.hook   || "";
  const intro = script.sections.intro  || "";
  const s1    = script.sections.story1 || "";
  const s2    = script.sections.story2 || "";
  const s3    = script.sections.story3 || "";
  const outro = script.sections.outro  || "";

  const numMatch  = hook.match(/[\$£€]?\d[\d,\.]*\s*(billion|million|trillion|[BMTKbmtk%])\b/i);
  const bigNumber = numMatch ? numMatch[0].trim().toUpperCase() : null;

  const config = { cards: [
    { type:"hook",     headline:hook.slice(0,80), subtext:intro.slice(0,120), big_number:bigNumber, tag, accent },
    { type:"analysis", headline:s1.slice(0,90),   body:s2.slice(0,160), tag:"ECONOMIC IMPACT", num:"01", scheme, stat:s3.slice(0,80) },
    { type:"analysis", headline:s2.slice(0,90),   body:s3.slice(0,160), tag:"MARKET ANALYSIS",  num:"02", scheme:"amber", stat:"" },
    { type:"cta",      outro:outro.slice(0,100),  accent:"#3B82F6" },
  ]};

  const configFile = path.join(tmpDir, "cards_config.json");
  const cardsDir   = path.join(tmpDir, "cards");
  await mkdir(cardsDir, { recursive: true });
  await writeFile(configFile, JSON.stringify(config));

  const { stdout, stderr } = await execAsync(
    `python3 "${RENDERER_PY}" "${configFile}" "${cardsDir}"`,
    { timeout: 60_000 }
  );
  if (stderr && !stderr.includes("Warning"))
    console.warn("[Cards] Python stderr:", stderr.slice(0,200));

  const resultLine = stdout.split("\n").find(l => l.startsWith("RESULT:"));
  if (!resultLine) throw new Error("cardRenderer.py produced no RESULT line:\n"+stdout.slice(0,300));

  return JSON.parse(resultLine.replace("RESULT:","")).map(c=>({ filepath:c.path, type:c.type }));
}

// ── Blend real image with dark overlay so text stays readable ─────────────
async function blendImageWithOverlay(imgPath, outputPath, W, H) {
  // Scale image to fill frame, then darken it 55% for text readability
  const cmd = [
    `ffmpeg -y`,
    `-i "${imgPath}"`,
    `-vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},`,
    `format=rgb24,`,
    `colorchannelmixer=aa=0.45"`, // darken to 45% brightness
    `-frames:v 1`,
    `"${outputPath}"`,
  ].join(" ").replace(/\n/g,"");

  // Simpler approach: use overlay filter
  const cmd2 = [
    `ffmpeg -y`,
    `-i "${imgPath}"`,
    `-f lavfi -i "color=black:${W}x${H}"`,
    `-filter_complex "[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[img];`,
    `[img][1:v]blend=all_mode=multiply:all_opacity=0.5[out]"`,
    `-map "[out]" -frames:v 1`,
    `"${outputPath}"`,
  ].join(" ").replace(/\n/g,"");

  try {
    await execAsync(cmd2, { timeout:30_000 });
    if (existsSync(outputPath)) return true;
  } catch {}
  return false;
}

// ── Build ASS subtitles ────────────────────────────────────────────────────
function buildASS(script, dur, W, H) {
  const sz=52, mv=80, ml=50;
  const pad= n=>String(n).padStart(2,"0");
  const toT= ms=>{
    const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),
          s=Math.floor((ms%60000)/1000),c=Math.floor((ms%1000)/10);
    return `${h}:${pad(m)}:${pad(s)}.${pad(c)}`;
  };
  const text=[script.sections.hook,script.sections.intro,
              script.sections.story1,script.sections.story2,
              script.sections.story3,script.sections.outro]
             .filter(Boolean).join(" ");
  const words=text.split(/\s+/).filter(Boolean);
  const mspw=(dur*1000)/(words.length||1);
  const lines=[];
  for(let i=0;i<words.length;i+=5){
    const chunk=words.slice(i,i+5);
    lines.push({text:chunk.join(" "),s:i*mspw,e:Math.min(dur*1000,(i+chunk.length)*mspw+150)});
  }
  return [
    `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 2`,
    `[V4+ Styles]`,
    `Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding`,
    `Style: S,Arial Black,${sz},&H00FFFFFF,&H000000FF,&H00000000,&HB4000000,-1,0,0,0,100,100,0.3,0,4,0,0,2,${ml},${ml},${mv},1`,
    `[Events]`,
    `Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text`,
    ...lines.map(l=>`Dialogue: 0,${toT(l.s)},${toT(l.e)},S,,0,0,0,,{\\fad(60,60)}${l.text}`),
  ].join("\n");
}

// ── Background music ───────────────────────────────────────────────────────
async function prepareBgMusic(duration, outputPath) {
  // Search multiple locations for back.mp3
  const searchPaths = [
    path.join(PIPELINE_DIR, "..", "back.mp3"),        // project root
    path.join(PIPELINE_DIR, "back.mp3"),              // pipeline folder
    path.join(process.cwd(), "back.mp3"),             // cwd
    path.join(process.env.HOME||"", "back.mp3"),      // home dir
  ];

  let bgSrc = null;
  for (const p of searchPaths) {
    if (existsSync(p)) { bgSrc = p; break; }
  }

  console.log("[Music] Searching for back.mp3:");
  searchPaths.forEach(p => console.log(`  ${existsSync(p)?"✅":"❌"} ${p}`));

  if (!bgSrc) {
    console.warn("[Music] ⚠️  back.mp3 not found — using synthetic music");
    await execAsync([
      `ffmpeg -y`,
      `-f lavfi -i "sine=frequency=432:sample_rate=44100:duration=${duration}"`,
      `-f lavfi -i "sine=frequency=528:sample_rate=44100:duration=${duration}"`,
      `-filter_complex "[0:a][1:a]amix=inputs=2,volume=0.06,aformat=channel_layouts=stereo[a]"`,
      `-map "[a]" -c:a aac -b:a 128k "${outputPath}"`,
    ].join(" "), {timeout:30_000});
    console.log("[Music] ✅ Synthetic music created");
    return;
  }

  console.log(`[Music] ✅ Found at: ${bgSrc}`);
  const cmd = [
    `ffmpeg -y`,
    `-i "${bgSrc}"`,
    `-t ${duration.toFixed(3)}`,
    `-af "afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(1,duration-2).toFixed(1)}:d=2,volume=0.07,aformat=channel_layouts=stereo"`,
    `-c:a aac -b:a 128k -ar 44100`,
    `"${outputPath}"`,
  ].join(" ");

  const { stderr } = await execAsync(cmd, {timeout:60_000});
  if (!existsSync(outputPath)) {
    throw new Error("Music prep failed: " + stderr.slice(-200));
  }
  console.log(`[Music] ✅ Ready (${Math.round(statSync(outputPath).size/1024)}KB)`);
}

// ── MAIN ASSEMBLER ─────────────────────────────────────────────────────────
export async function assembleVideo(script, audioResult, imageResults, runId, format="shorts") {
  if (!hasFfmpeg()) throw new Error("ffmpeg not installed");

  await mkdir(OUTPUT_DIR, { recursive:true });
  const ts      = Date.now();
  const tmpDir  = path.join(OUTPUT_DIR, `tmp_${ts}`);
  await mkdir(tmpDir, { recursive:true });

  const isShorts = format !== "youtube";
  const W = isShorts ? 1080 : 1280;
  const H = isShorts ? 1920 :  720;
  const outFile  = path.join(OUTPUT_DIR, `${runId}_${ts}.mp4`);
  const assFile  = path.join(tmpDir, "subs.ass");
  const musicFile= path.join(tmpDir, "bgmusic.aac");
  const voiceFile= path.join(tmpDir, "voice_stereo.aac");
  const listFile = path.join(tmpDir, "segs.txt");

  try {
    const dur = await getAudioDuration(audioResult.filepath);
    console.log(`\n[Video] ══ v8 ══  ${dur.toFixed(1)}s | ${W}×${H} | ${imageResults?.length||0} images`);

    // ── Use all 4 real images — no text cards ─────────────────────────────
    const validImages = (imageResults||[]).filter(img =>
      img?.filepath && existsSync(img.filepath) &&
      statSync(img.filepath).size > 20000  // >20KB = real image
    );

    console.log(`[Video] Valid images: ${validImages.length}/${(imageResults||[]).length}`);
    validImages.forEach((img,i) => {
      const kb = Math.round(statSync(img.filepath).size/1024);
      console.log(`  [${i+1}] ${kb}KB — ${path.basename(img.filepath)}`);
    });

    if (validImages.length === 0) {
      throw new Error("No valid images found. Run with --news N to generate images first.");
    }

    // Use all available images — no text/CTA cards at all
    const segSources = validImages.map(img => img.filepath);

    const isImageFile = (fp) => {
      const ext = path.extname(fp||"").toLowerCase();
      return [".jpg",".jpeg",".png",".webp"].includes(ext);
    };

    // ── Subtitles ──────────────────────────────────────────────────────────
    await writeFile(assFile, buildASS(script, dur, W, H));

    // ── Music + voice ──────────────────────────────────────────────────────
    await prepareBgMusic(dur, musicFile);
    await execAsync(
      `ffmpeg -y -i "${audioResult.filepath}" -af "aformat=channel_layouts=stereo" -c:a aac -b:a 192k "${voiceFile}"`,
      {timeout:60_000}
    );
    console.log("[Video] ✅ Voice stereo");

    // ── Render each segment ────────────────────────────────────────────────
    const n      = segSources.length;
    const segDur = dur / n;
    const segFiles = [];

    // Ken Burns patterns — very subtle (max 1.03x) to avoid cropping content
    const KB = [
      `zoompan=z='min(zoom+0.0002,1.03)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=FRAMES:s=${W}x${H}:fps=25`,
      `zoompan=z='if(lte(on,1),1.03,max(1.0,zoom-0.0002))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=FRAMES:s=${W}x${H}:fps=25`,
      `zoompan=z='min(zoom+0.0002,1.03)':x='iw/2-(iw/zoom/2)':y='max(0,ih-ih/zoom)':d=FRAMES:s=${W}x${H}:fps=25`,
      `zoompan=z='1.0':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=FRAMES:s=${W}x${H}:fps=25`,
    ];

    for (let i = 0; i < n; i++) {
      const srcFile = segSources[i];
      const segFile = path.join(tmpDir, `seg_${i}.mp4`);
      const frames  = Math.max(25, Math.ceil(segDur * 25));
      const kb      = KB[i % KB.length].replace(/FRAMES/g, String(frames));

      if (isImageFile(srcFile)) {
        // Real photo or text card JPEG → scale + Ken Burns + subtitle overlay
        // For real photos: add a semi-transparent overlay so text is readable
        const isRealPhoto = validImages.some(v => v.filepath === srcFile);
        
        let vfChain;
        if (isRealPhoto) {
          // Real photo: scale, darken slightly, add text overlay bar
          const safeAss = assFile.replace(/\\/g,"/").replace(/:/g,"\\:");
          vfChain = [
            `scale=${W}:${H}:force_original_aspect_ratio=increase`,
            `crop=${W}:${H}`,
            `${kb}`,
            `setsar=1`,
            // Dark overlay at top and bottom for text readability
            `drawbox=x=0:y=0:w=${W}:h=200:color=black@0.7:t=fill`,
            `drawbox=x=0:y=${H-180}:w=${W}:h=180:color=black@0.7:t=fill`,
            `drawbox=x=0:y=${H-6}:w=${W}:h=6:color=red@0.9:t=fill`,
            `format=yuv420p`,
          ].join(",");
        } else {
          // Text card JPEG → just scale and Ken Burns, no extra overlay needed
          const safeAss = assFile.replace(/\\/g,"/").replace(/:/g,"\\:");
          vfChain = [
            `scale=${W}:${H}:force_original_aspect_ratio=increase`,
            `crop=${W}:${H}`,
            `${kb}`,
            `setsar=1`,
            `format=yuv420p`,
          ].join(",");
        }

        await execAsync([
          `ffmpeg -y -loop 1 -i "${srcFile}"`,
          `-t ${segDur.toFixed(3)}`,
          `-vf "${vfChain}"`,
          `-c:v libx264 -preset fast -crf 20 -r 25 -an`,
          `"${segFile}"`,
        ].join(" "), {timeout:120_000});
      } else {
        // MP4 card (shouldn't happen but handle gracefully)
        await execAsync(`ffmpeg -y -i "${srcFile}" -t ${segDur.toFixed(3)} -c:v libx264 -an "${segFile}"`,
                        {timeout:60_000});
      }

      if (!existsSync(segFile)) throw new Error(`Segment ${i} not created`);
      segFiles.push(segFile);
      const src_type = validImages.some(v=>v.filepath===srcFile) ? "📸 photo" : "🎨 card";
      console.log(`[Video] ✅ Segment ${i+1}/${n} (${src_type}): ${segDur.toFixed(1)}s`);
    }

    // ── Crossfade concat ───────────────────────────────────────────────────
    const fade = 0.4;
    let xf = "", prev="0:v", t=segDur-fade;
    for (let i=1; i<n; i++) {
      const out = i===n-1?"vslide":`v${i}`;
      xf += `[${prev}][${i}:v]xfade=transition=fade:duration=${fade}:offset=${t.toFixed(3)}[${out}];`;
      prev=out; t+=segDur-fade;
    }
    const slideLabel = n===1?"0:v":"vslide";

    // ── Subtitle overlay ───────────────────────────────────────────────────
    const safeAss = assFile.replace(/\\/g,"/").replace(/:/g,"\\:");

    // ── Final merge ────────────────────────────────────────────────────────
    const vi=n, mi=n+1;
    const fc=(xf||"")
      +`[${slideLabel}]ass='${safeAss}'[vout];`
      +`[${vi}:a]volume=1.0[voice];[${mi}:a]volume=0.08[music];`
      +`[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`;

    const finalCmd=[
      `ffmpeg -y`,
      segFiles.map(f=>`-i "${f}"`).join(" "),
      `-i "${voiceFile}" -i "${musicFile}"`,
      `-filter_complex "${fc}"`,
      `-map "[vout]" -map "[aout]"`,
      `-c:v libx264 -preset medium -crf 20 -profile:v high -r 25`,
      `-c:a aac -b:a 192k -ar 44100 -ac 2`,
      `-t ${dur.toFixed(3)} -pix_fmt yuv420p -movflags +faststart`,
      `"${outFile}"`,
    ].join(" ");

    console.log("[Video] Final render...");
    const {stderr} = await execAsync(finalCmd, {timeout:600_000});
    if (!existsSync(outFile)) throw new Error("Output missing: "+stderr.slice(-400));

    const sizeMB=(statSync(outFile).size/1024/1024).toFixed(1);
    console.log(`[Video] ✅ Done: ${outFile} (${sizeMB}MB, ${dur.toFixed(1)}s, stereo)`);
    return {filepath:outFile,filename:path.basename(outFile),duration:dur,sizeMB:parseFloat(sizeMB),format,width:W,height:H};

  } finally {
    await rm(tmpDir,{recursive:true,force:true}).catch(()=>{});
  }
}
