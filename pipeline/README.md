# Asia Economic Lens — Video Pipeline

Fully automated: news → AI script → voice → images → MP4 → YouTube upload.

## Architecture

```
NewsData.io RSS          →  fetchHeadlines()
         ↓
Gemini AI Analysis       →  analyzeForCountry()
         ↓
Gemini Script Writer     →  generateScript()       [scriptGen.js]
         ↓
Microsoft Edge TTS       →  generateVoice()         [voiceGen.js]
         ↓
Pollinations.AI Images   →  generateImages()        [imageGen.js]
         ↓
ffmpeg Assembly          →  assembleVideo()         [videoAssembler.js]
         ↓
YouTube Data API v3      →  uploadToYouTube()       [youtubeUploader.js]
```

## Total Cost: $0

| Tool | Cost | Limit |
|---|---|---|
| NewsData.io | Free | 200 req/day |
| Gemini AI | Free | 1,500 req/day |
| Edge TTS | Free | No limit |
| Pollinations.AI | Free | No limit |
| ffmpeg | Free | No limit |
| YouTube API | Free | 100 uploads/day |

---

## Installation

### 1. Install ffmpeg

**Linux/Ubuntu:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Mac:**
```bash
brew install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html and add to PATH.

### 2. Install Node.js dependencies

```bash
cd asian-news-app
npm install msedge-tts
```

### 3. Set up YouTube API (one-time)

1. Go to https://console.cloud.google.com
2. Create a new project
3. Go to **APIs & Services → Library** → search "YouTube Data API v3" → Enable
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Desktop app**
6. Download the credentials

Add to your `.env`:
```
YOUTUBE_CLIENT_ID=your_client_id_here
YOUTUBE_CLIENT_SECRET=your_client_secret_here
```

Run the auth flow (one-time):
```bash
node pipeline/youtubeUploader.js --auth
```
This opens a browser, you log in with your YouTube channel account, paste the code back, and your refresh token is saved.

Add the printed `YOUTUBE_REFRESH_TOKEN=...` to your `.env`.

---

## Usage

### Test (generate video but don't upload):
```bash
node pipeline/run.js --country LK --no-upload
```

### Upload as private (for review before publishing):
```bash
node pipeline/run.js --country LK --private
```

### Upload publicly:
```bash
node pipeline/run.js --country LK
```

### Multiple countries:
```bash
node pipeline/run.js --country LK,IN,PK
```

### Fully automated daily schedule (all 15 countries):
```bash
node pipeline/run.js --schedule
```
Runs immediately, then daily at 08:00 AM.

### Run as a background service (Linux):
```bash
# Install PM2
npm install -g pm2

# Start scheduled pipeline
pm2 start pipeline/run.js --name "ael-pipeline" -- --schedule

# Auto-restart on reboot
pm2 startup
pm2 save
```

---

## Video Output Format

- **Resolution:** 1080×1920 (9:16 vertical — YouTube Shorts / TikTok)
- **Duration:** ~60-90 seconds
- **Format:** MP4 (H.264 + AAC)
- **Subtitles:** Burned in (white text, black outline)
- **Branding:** Country name overlay at top

## YouTube Monetisation

Requirements for the YouTube Partner Program:
- 1,000 subscribers **OR** 10M Shorts views in 90 days
- 4,000 watch hours (long videos) **OR** 10M Shorts views

Tips:
- Post consistently — daily uploads greatly accelerate growth
- Use the `--schedule` flag to automate daily posting
- Shorts tend to reach new audiences faster than standard videos
- AI-generated content is allowed but must be disclosed in description

## File Structure

```
pipeline/
├── run.js              ← Main entry point
├── scriptGen.js        ← AI script writer
├── voiceGen.js         ← Edge TTS voice generator
├── imageGen.js         ← Pollinations image downloader
├── videoAssembler.js   ← ffmpeg video builder
├── youtubeUploader.js  ← YouTube Data API uploader
├── README.md           ← This file
└── output/
    ├── audio/          ← Generated MP3 files
    ├── images/         ← Downloaded images
    └── videos/         ← Final MP4 files
```
