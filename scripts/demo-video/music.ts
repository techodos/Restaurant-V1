/**
 * Generates an original, royalty-free background track (no samples, no third-party audio): a warm pad, soft
 * plucked arpeggio and sub bass at 92 BPM, written as a 44.1 kHz stereo WAV. Ours to use anywhere.
 * Usage: tsx scripts/demo-video/music.ts <out.wav> <seconds>
 */
import { writeFileSync } from "node:fs";

const [out, secondsArg] = process.argv.slice(2);
const seconds = Number(secondsArg ?? 180);
const rate = 44100;
const total = Math.ceil(seconds * rate);
const left = new Float32Array(total);
const right = new Float32Array(total);

const bpm = 92;
const beat = 60 / bpm;
const bar = beat * 4;
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// I – vi – IV – V in C, voiced warmly (Cmaj9, Am9, Fmaj7(9), G6/9)
const chords = [
  [48, 55, 59, 62, 64],
  [45, 52, 55, 59, 60],
  [41, 48, 52, 55, 57],
  [43, 50, 54, 57, 59],
];
const arp = [0, 2, 3, 4, 3, 2, 1, 2];

function addTone(start: number, dur: number, freq: number, gain: number, pan: number, attack: number, release: number, shape: "pad" | "pluck") {
  const s0 = Math.floor(start * rate);
  const n = Math.floor((dur + release) * rate);
  for (let i = 0; i < n && s0 + i < total; i++) {
    const t = i / rate;
    let env: number;
    if (shape === "pad") env = Math.min(1, t / attack) * (t > dur ? Math.max(0, 1 - (t - dur) / release) : 1);
    else env = Math.min(1, t / 0.004) * Math.exp(-t * 5.5);
    const ph = 2 * Math.PI * freq * t;
    const wave =
      shape === "pad"
        ? Math.sin(ph) * 0.7 + Math.sin(ph * 2.0015) * 0.18 + Math.sin(ph * 0.4995) * 0.12
        : Math.sin(ph) * 0.8 + Math.sin(ph * 2) * 0.15 * Math.exp(-t * 9);
    const v = wave * env * gain;
    left[s0 + i] = left[s0 + i]! + v * (1 - pan);
    right[s0 + i] = right[s0 + i]! + v * (1 + pan);
  }
}

for (let barStart = 0, k = 0; barStart < seconds; barStart += bar, k++) {
  const chord = chords[k % chords.length]!;
  // pad: each chord tone slightly detuned/panned, long attack, overlapping release
  chord.forEach((note, i) => addTone(barStart, bar, midi(note + 12), 0.045, (i % 2 ? 0.35 : -0.35), 1.2, 1.6, "pad"));
  // sub bass on the root
  addTone(barStart, bar * 0.95, midi(chord[0]! - 12), 0.07, 0, 0.3, 0.5, "pad");
  // plucked arpeggio in eighths, entering after the first 4 bars
  if (k >= 4) {
    for (let e = 0; e < 8; e++) addTone(barStart + e * beat * 0.5, 0.4, midi(chord[arp[e]!]! + 24), 0.05, e % 2 ? 0.25 : -0.25, 0, 0.4, "pluck");
  }
}

// gentle low-pass + simple stereo delay for space, then master fade in/out and normalise
function shapeChannel(ch: Float32Array, delaySec: number) {
  let lp = 0;
  const a = 0.18;
  for (let i = 0; i < total; i++) { lp += a * (ch[i]! - lp); ch[i] = lp; }
  const d = Math.floor(delaySec * rate);
  for (let i = d; i < total; i++) ch[i] = ch[i]! + ch[i - d]! * 0.28;
}
shapeChannel(left, 0.33);
shapeChannel(right, 0.41);
let peak = 0;
for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
const fadeIn = 2 * rate;
const fadeOut = 4 * rate;
const buf = Buffer.alloc(44 + total * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + total * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(rate, 24);
buf.writeUInt32LE(rate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(total * 4, 40);
for (let i = 0; i < total; i++) {
  const g = (0.8 / peak) * Math.min(1, i / fadeIn) * Math.min(1, (total - i) / fadeOut);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i]! * g)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i]! * g)) * 32767), 46 + i * 4);
}
writeFileSync(out!, buf);
console.log(`wrote ${out} (${seconds}s)`);
