#!/usr/bin/env node
// run_batch.js — Simple wrapper to run `node pipeline/run.js --news N` repeatedly
// Keeps the original `run.js` behavior (upload, metadata, music) and just sequences

import dotenv from "dotenv";
dotenv.config();

import { spawn } from "child_process";
import { appendFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PIPELINE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(PIPELINE_DIR, "..");
const LOG_DIR = path.join(ROOT, "logs");
mkdirSync(LOG_DIR, { recursive: true });

// CLI args
const argv = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) argMap[argv[i].slice(2)] = argv[i+1] || true;
}

const breakMins = parseInt(argMap.break || "10");
const startFrom = parseInt(argMap.start || "1");
const storiesArg = argMap.stories ? String(argMap.stories).split(",").map(s=>parseInt(s.trim())) : null;
const isDryRun = argMap["dry-run"] === true;
const isPrivate = argMap.private === true;

const storyNums = storiesArg || Array.from({ length: 10 }, (_, i) => i + startFrom);

function dateStamp() { return new Date().toISOString().slice(0,10); }
function timeStamp() { return new Date().toLocaleTimeString("en-GB", { hour12:false }); }
function log(msg) {
  const line = `[${timeStamp()}] ${msg}`;
  console.log(line);
  appendFileSync(path.join(LOG_DIR, `run_batch_${dateStamp()}.log`), line + "\n");
}

function runChild(args, label) {
  return new Promise((resolve, reject) => {
    log(`  ▶ ${label}`);
    const child = spawn(process.execPath, args, { cwd: ROOT, env: process.env });

    child.stdout.on('data', d => d.toString().split(/\r?\n/).forEach(l=>{ if(l) log(`    ${l}`); }));
    child.stderr.on('data', d => d.toString().split(/\r?\n/).forEach(l=>{ if(l) log(`    ${l}`); }));

    child.on('error', err => reject(err));
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Process exited ${code}`));
    });
  });
}

async function sleep(ms) { return new Promise(r=>setTimeout(r, ms)); }

async function main() {
  log(`RUN_BATCH — Stories: ${storyNums.join(", ")} | Break: ${breakMins}m | Mode: ${isDryRun?"DRY RUN":"LIVE"}`);

  for (let i = 0; i < storyNums.length; i++) {
    const story = storyNums[i];
    try {
      const runArgs = [path.join('pipeline', 'run.js'), '--news', String(story)];
      if (isDryRun) runArgs.push('--no-upload');
      if (isPrivate) runArgs.push('--private');

      await runChild(runArgs, `Run pipeline for story #${story}`);
      log(`  ✅ Story ${story} completed`);
    } catch (err) {
      log(`  ❌ Story ${story} failed: ${err.message}`);
    }

    if (i < storyNums.length - 1) {
      log(`  ⏸ Waiting ${breakMins} minutes before next story...`);
      await sleep(breakMins * 60 * 1000);
    }
  }

  log('RUN_BATCH complete');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
