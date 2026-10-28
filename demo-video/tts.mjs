// Narration audio: one clip per beat, rendered sentence by sentence and joined with natural gaps.
// Writes audio/<beat>.wav (48 kHz stereo), audio/<beat>.srt and audio/durations.json. Unchanged beats are skipped.
//   node tts.mjs [--force] [beatId...]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BEATS, GAPS, VOICE, isKeyPoint, shownText, spokenText } from './narration.mjs';
import { APP_DIR, DEMO_DIR, FFMPEG } from './lib/demo-env.mjs';

const RATE = 48000;
const CHANNELS = 2;
const BYTES_PER_MS = (RATE * CHANNELS * 2) / 1000;
const AUDIO_DIR = path.join(DEMO_DIR, 'audio');
const TMP_DIR = path.join(AUDIO_DIR, 'tmp');
const DURATIONS = path.join(AUDIO_DIR, 'durations.json');

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = new Set(args.filter((a) => !a.startsWith('--')));
fs.mkdirSync(TMP_DIR, { recursive: true });
const durations = fs.existsSync(DURATIONS) ? JSON.parse(fs.readFileSync(DURATIONS, 'utf8')) : {};

const silence = (ms) => Buffer.alloc(Math.round(ms * BYTES_PER_MS / 4) * 4);
const hashOf = (beat) => crypto.createHash('sha1').update(JSON.stringify({ lines: beat.lines, VOICE, GAPS, v: 2 })).digest('hex');

function wavFromPcm(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(CHANNELS, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * CHANNELS * 2, 28); h.writeUInt16LE(CHANNELS * 2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Trims the voice's own leading/trailing silence so the gaps below are exactly what we chose.
function sentencePcm(wavPath) {
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse';
  const res = spawnSync(FFMPEG, ['-v', 'error', '-i', wavPath, '-af', trim, '-ar', String(RATE), '-ac', String(CHANNELS), '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
  if (res.status !== 0) throw new Error(`ffmpeg failed on ${wavPath}: ${res.stderr}`);
  return res.stdout;
}

// OpenAI voice, one request per sentence so each beat keeps its own timing.
// The key comes from OPENAI_API_KEY in the environment, else from CPQ12/.env.
function openaiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envFile = path.join(APP_DIR, '.env');
  const m = fs.existsSync(envFile) && fs.readFileSync(envFile, 'utf8').match(/^\s*OPENAI_API_KEY\s*=\s*["']?([^"'\r\n]+)/m);
  if (!m) throw new Error('VOICE uses OpenAI: set OPENAI_API_KEY in the environment or in CPQ12/.env');
  return m[1].trim();
}
async function openaiSay(text, out) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: VOICE.model, voice: VOICE.voice, speed: VOICE.rate, input: text, response_format: 'wav' }),
    });
    if (res.ok) { fs.writeFileSync(out, Buffer.from(await res.arrayBuffer())); return; }
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const msToSrt = (ms) => {
  const t = Math.max(0, Math.round(ms));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(t / 3600000))}:${p(Math.floor(t / 60000) % 60)}:${p(Math.floor(t / 1000) % 60)},${p(t % 1000, 3)}`;
};

let rendered = 0;
for (const beat of BEATS) {
  if (only.size && !only.has(beat.id)) continue;
  const hash = hashOf(beat);
  const wavOut = path.join(AUDIO_DIR, `${beat.id}.wav`);
  if (!force && durations[beat.id]?.hash === hash && fs.existsSync(wavOut)) continue;

  const items = beat.lines.map((line, i) => ({ text: spokenText(line), out: path.join(TMP_DIR, `${beat.id}-${i}.wav`) }));
  if (VOICE.engine === 'openai') {
    for (const item of items) await openaiSay(item.text, item.out);
  } else {
    const jobFile = path.join(TMP_DIR, `${beat.id}.json`);
    fs.writeFileSync(jobFile, JSON.stringify({ ...VOICE, items }));
    const ps = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(DEMO_DIR, 'lib/winsay-batch.ps1'), '-JobFile', jobFile], { encoding: 'utf8' });
    if (ps.status !== 0) throw new Error(`TTS failed for ${beat.id}: ${ps.stderr}`);
  }

  const parts = [];
  const cues = [];
  let cursor = 0;
  beat.lines.forEach((line, i) => {
    const pcm = sentencePcm(items[i].out);
    const len = pcm.length / BYTES_PER_MS;
    cues.push({ start: cursor, end: cursor + len, text: shownText(line) });
    parts.push(pcm);
    cursor += len;
    const last = i === beat.lines.length - 1;
    const gap = isKeyPoint(line) ? GAPS.keyPoint : last ? 0 : GAPS.sentence;
    if (gap) { parts.push(silence(gap)); cursor += gap; }
  });
  fs.writeFileSync(wavOut, wavFromPcm(Buffer.concat(parts)));
  fs.writeFileSync(path.join(AUDIO_DIR, `${beat.id}.srt`), cues.map((c, i) => `${i + 1}\n${msToSrt(c.start)} --> ${msToSrt(c.end)}\n${c.text}\n`).join('\n'));
  durations[beat.id] = { hash, duration: Math.round(cursor), cues };
  rendered += 1;
  console.log(`${beat.id}: ${(cursor / 1000).toFixed(1)}s`);
}

for (const id of Object.keys(durations)) if (!BEATS.some((b) => b.id === id)) delete durations[id];
fs.writeFileSync(DURATIONS, JSON.stringify(durations, null, 2));
fs.rmSync(TMP_DIR, { recursive: true, force: true });
const total = BEATS.reduce((s, b) => s + (durations[b.id]?.duration || 0), 0);
console.log(`Rendered ${rendered} beat(s); narration total ${(total / 60000).toFixed(2)} min`);
