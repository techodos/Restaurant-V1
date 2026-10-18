/**
 * Turns a recording (`<rec>/frames` + `<rec>/timeline.json` from record.ts) into finished MP4s with FFmpeg:
 * constant 30 fps, 1920×1080, H.264 + AAC, background music under the picture with fades.
 *
 *   tsx scripts/demo-video/assemble.ts <recDir> <out.mp4> <music.wav> [ranges.json]
 *
 * `ranges.json` (optional) = [[startMark, endMark], ...] using mark names (or seconds) from the timeline: only those
 * spans are kept, in order — that is how the short promo is cut from the same footage. FFmpeg comes from $FFMPEG or PATH.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Timeline } from "./recorder";

const [recDir, outFile, musicFile, rangesFile] = process.argv.slice(2);
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const timeline = JSON.parse(readFileSync(path.join(recDir!, "timeline.json"), "utf8")) as Timeline;
const at = (v: string | number) => {
  if (typeof v === "number") return v;
  const t = timeline.marks[v];
  if (t === undefined) throw new Error(`unknown mark "${v}" (have: ${Object.keys(timeline.marks).join(", ")})`);
  return t;
};
const ranges: [number, number][] = rangesFile
  ? (JSON.parse(readFileSync(rangesFile, "utf8")) as [string | number, string | number][]).map(([a, b]) => [at(a), at(b)])
  : [[0, timeline.end]];

// each frame shows from its timestamp until the next frame's (the last one until the end of the timeline)
const spans = timeline.frames.map((frame, i) => ({ file: frame.file, from: frame.at, to: timeline.frames[i + 1]?.at ?? timeline.end }));
const lines: string[] = [];
let duration = 0;
let last = "";
for (const [start, end] of ranges) {
  for (const span of spans) {
    const from = Math.max(span.from, start);
    const to = Math.min(span.to, end);
    if (to - from < 0.001) continue;
    const file = path.resolve(recDir!, "frames", span.file).replace(/\\/g, "/");
    lines.push(`file '${file}'`, `duration ${(to - from).toFixed(4)}`);
    duration += to - from;
    last = file;
  }
}
lines.push(`file '${last}'`); // concat demuxer: the last entry needs repeating for its duration to count
const listFile = outFile!.replace(/\.mp4$/i, ".frames.txt");
writeFileSync(listFile, lines.join("\n"));

const fadeOut = Math.max(0, duration - 3.5).toFixed(2);
const videoFadeOut = Math.max(0, duration - 0.8).toFixed(2);
execFileSync(
  ffmpeg,
  [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-i", musicFile!,
    "-filter_complex",
    `[0:v]fps=30,scale=1920:1080:flags=lanczos,format=yuv420p,fade=t=in:st=0:d=0.6,fade=t=out:st=${videoFadeOut}:d=0.8[v];` +
      `[1:a]atrim=0:${duration.toFixed(2)},asetpts=PTS-STARTPTS,volume=0.6,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOut}:d=3.5[a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "192k",
    "-t", duration.toFixed(2),
    outFile!,
  ],
  { stdio: "inherit" },
);
console.log(`wrote ${outFile} (${duration.toFixed(1)}s)`);
