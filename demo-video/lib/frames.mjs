// Pulls a frame every N seconds from the built video and lists what is being said at that moment,
// so each frame can be checked against the narration.   node lib/frames.mjs [seconds=15] [video]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FFMPEG, FFPROBE, OUT_DIR } from './demo-env.mjs';

const every = Number(process.argv[2] || 15);
const video = process.argv[3] || path.join(OUT_DIR, 'zenop-onboarding.mp4');
const dir = path.join(OUT_DIR, 'frames');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const duration = Number(spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' }).stdout);
const srt = fs.readFileSync(path.join(OUT_DIR, 'zenop-onboarding.srt'), 'utf8').split(/\r?\n\r?\n/).filter(Boolean).map((block) => {
  const [, times, ...text] = block.split(/\r?\n/);
  const toS = (t) => { const [h, m, rest] = t.split(':'); const [s, ms] = rest.split(','); return h * 3600 + m * 60 + Number(s) + ms / 1000; };
  const [a, b] = times.split(' --> ').map(toS);
  return { a, b, text: text.join(' ') };
});
const timeline = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'timeline.json'), 'utf8')).beats;

const lines = [];
for (let t = 2; t < duration; t += every) {
  const name = `f${String(Math.round(t)).padStart(4, '0')}.png`;
  spawnSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', 'scale=1280:-1', path.join(dir, name)]);
  const said = srt.find((c) => t >= c.a && t <= c.b) || [...srt].reverse().find((c) => c.a <= t);
  const beat = [...timeline].reverse().find((b) => b.start <= t);
  lines.push(`${name}  t=${t.toFixed(0)}s  beat=${beat?.beat || '-'}  "${said ? said.text : ''}"`);
}
fs.writeFileSync(path.join(dir, 'index.txt'), lines.join('\n'));
console.log(lines.join('\n'));
