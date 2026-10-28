// Builds the final videos from out/raw.mp4 + out/timeline.json + audio/<beat>.wav.
//   out/zenop-onboarding.mp4        subtitles burned in
//   out/zenop-onboarding-clean.mp4  no subtitles
//   out/zenop-onboarding.srt        subtitle file
// Audio is placed at each beat's recorded start, mixed, loudness-normalised, then forced to 48 kHz stereo AAC.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEMO_DIR, FFMPEG, FFPROBE, OUT_DIR } from './lib/demo-env.mjs';

const AUDIO_DIR = path.join(DEMO_DIR, 'audio');
const RAW = path.join(OUT_DIR, 'raw.mp4');
const timeline = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'timeline.json'), 'utf8'));
const durations = JSON.parse(fs.readFileSync(path.join(AUDIO_DIR, 'durations.json'), 'utf8'));
const NAME = 'zenop-onboarding';

function run(args, label) {
  const res = spawnSync(FFMPEG, ['-y', '-v', 'error', ...args], { cwd: OUT_DIR, stdio: ['ignore', 'inherit', 'inherit'] });
  if (res.status !== 0) throw new Error(`ffmpeg failed: ${label}`);
}
function probe(file, entries, stream = 'v:0') {
  const res = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', stream, '-show_entries', entries, '-of', 'default=nw=1', file], { encoding: 'utf8' });
  return Object.fromEntries(res.stdout.trim().split(/\r?\n/).filter(Boolean).map((l) => l.split('=')));
}

const videoSeconds = Number(probe(RAW, 'format=duration').duration);
console.log(`Raw video: ${videoSeconds.toFixed(1)}s, ${timeline.beats.length} beats`);

// 1. Narration track: every beat at its start time, mixed without amix's level halving.
const inputs = [];
const filters = [];
timeline.beats.forEach((b, i) => {
  inputs.push('-i', path.join(AUDIO_DIR, `${b.beat}.wav`));
  const ms = Math.round(b.start * 1000);
  filters.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`);
});
filters.push(`${timeline.beats.map((_, i) => `[a${i}]`).join('')}amix=inputs=${timeline.beats.length}:normalize=0:dropout_transition=0,apad,atrim=0:${videoSeconds.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[out]`);
run([...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', 'narration.wav'], 'narration mix');

// 2. Subtitles: each beat's sentence cues shifted to the beat's start.
const srtTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const cues = [];
for (const b of timeline.beats) {
  for (const c of durations[b.beat].cues) cues.push({ start: b.start + c.start / 1000, end: b.start + c.end / 1000, text: c.text });
}
// Long sentences wrap onto two lines at the nearest space to the middle.
const wrap = (t) => {
  if (t.length <= 62) return t;
  const mid = Math.floor(t.length / 2);
  const left = t.lastIndexOf(' ', mid);
  const right = t.indexOf(' ', mid);
  const cut = right === -1 || (left !== -1 && mid - left < right - mid) ? left : right;
  return `${t.slice(0, cut)}\n${t.slice(cut + 1)}`;
};
fs.writeFileSync(path.join(OUT_DIR, `${NAME}.srt`), cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${wrap(c.text)}\n`).join('\n'));

// 3. Clean copy (no subtitles) and the subtitled copy.
const audioOut = ['-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
run(['-i', RAW, '-i', 'narration.wav', '-map', '0:v:0', '-c:v', 'copy', ...audioOut, '-movflags', '+faststart', '-shortest', `${NAME}-clean.mp4`], 'clean video');
const style = "FontName=Segoe UI,FontSize=15,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BackColour=&H96000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=12";
run(['-i', RAW, '-i', 'narration.wav', '-map', '0:v:0', '-vf', `subtitles=${NAME}.srt:force_style='${style}'`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', ...audioOut, '-movflags', '+faststart', '-shortest', `${NAME}.mp4`], 'subtitled video');

for (const f of [`${NAME}.mp4`, `${NAME}-clean.mp4`]) {
  const a = probe(path.join(OUT_DIR, f), 'stream=codec_name,sample_rate,channels', 'a:0');
  const v = probe(path.join(OUT_DIR, f), 'stream=codec_name,width,height,r_frame_rate');
  console.log(`${f}: video ${v.codec_name} ${v.width}x${v.height} @ ${v.r_frame_rate} | audio ${a.codec_name} ${a.sample_rate} Hz, ${a.channels} ch`);
}
console.log(`Chapters → see out/chapters.txt`);

// 4. Chapter list with timestamps, from the beats that open a chapter.
const { BEATS, chapterTitle } = await import('./narration.mjs');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const chapters = BEATS.filter((b) => b.chapter).map((b) => {
  const t = timeline.beats.find((x) => x.beat === b.id);
  // The title card plays just before the beat's narration.
  return `${mmss(Math.max(0, (t?.start ?? 0) - 2.8))}  ${chapterTitle(b)}`;
});
fs.writeFileSync(path.join(OUT_DIR, 'chapters.txt'), `${chapters.join('\n')}\n`);
console.log(chapters.join('\n'));
