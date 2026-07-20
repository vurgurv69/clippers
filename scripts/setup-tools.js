/**
 * Downloads yt-dlp into /tools so Clippers can fetch videos.
 * Usage: npm run setup:tools
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const isWin = process.platform === "win32";
const fileName = isWin ? "yt-dlp.exe" : "yt-dlp";
const url = isWin
  ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
  : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

const toolsDir = path.join(__dirname, "..", "tools");
const outPath = path.join(toolsDir, fileName);

fs.mkdirSync(toolsDir, { recursive: true });

function follow(target, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(target, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirects < 5
        ) {
          res.resume();
          resolve(follow(res.headers.location, redirects + 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(outPath);
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          if (!isWin) fs.chmodSync(outPath, 0o755);
          console.log(`Saved ${outPath}`);
          resolve();
        });
      })
      .on("error", reject);
  });
}

follow(url).catch((err) => {
  console.error(err);
  process.exit(1);
});
