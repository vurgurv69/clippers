# Clippers

Paste a video link → Clippers watches the whole thing → you get **40–60 second** shareable clips with colorful captions and **no watermarks**.

**No OpenAI / ChatGPT required.** Everything runs on your PC for free.

## What it does

1. Downloads the video (`yt-dlp`)
2. Transcribes with **local multilingual Whisper** (Arabic or English from speech)
3. Scores viral moments and writes **topic titles from what was said** (e.g. Messi scoring — not “Must Watch”)
4. Burns captions in the same language + colorful styling (`ffmpeg`)

## Setup

```bash
npm install
npm run setup:tools
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste a link, and wait for clips.

First transcription downloads the Whisper model once (~75MB). Later runs are faster.

## Optional env (`.env.local`)

```env
# Default is Xenova/whisper-tiny.en (fast, English)
# WHISPER_MODEL=Xenova/whisper-small.en
```

## Notes

- Works best with YouTube / public URLs `yt-dlp` supports
- Clips are stored under `.data/jobs/` on your machine
- No CapCut-style watermark — exports are clean MP4s
- Local Whisper is slower than paid cloud APIs on long videos; that's the tradeoff for free
