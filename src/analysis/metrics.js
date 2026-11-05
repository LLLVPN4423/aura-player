import { estimateBpm, buildPeaks, roughLoudnessDb } from './bpm.js';
import { measureIntegratedLufs, lufsNormGainDb } from './lufs.js';

export { lufsNormGainDb };

/** Dynamic Range thô (dB) — peak vs RMS crest factor */
export function roughDynamicRange(audioBuffer) {
  const ch = audioBuffer.getChannelData(0);
  let peak = 0;
  let sum = 0;
  const step = Math.max(1, Math.floor(ch.length / 250000));
  let n = 0;
  for (let i = 0; i < ch.length; i += step) {
    const a = Math.abs(ch[i]);
    if (a > peak) peak = a;
    sum += ch[i] * ch[i];
    n++;
  }
  const rms = Math.sqrt(sum / n);
  if (rms < 1e-8 || peak < 1e-8) return null;
  return 20 * Math.log10(peak / rms);
}

export function qualityBadge({ ext, sampleRate, bitDepth }) {
  const e = (ext || '').toUpperCase();
  const sr = sampleRate || 0;
  const lossless = ['FLAC', 'WAV', 'AIFF', 'AIF', 'ALAC'].includes(e);
  let tier = 'Standard';
  if (lossless && sr >= 88200) tier = 'Hi-Res';
  else if (lossless && sr >= 44000) tier = 'Lossless';
  else if (['OPUS', 'AAC', 'M4A', 'OGG'].includes(e)) tier = 'Efficient';
  else if (e === 'MP3') tier = 'Lossy';

  const parts = [e || 'AUDIO'];
  if (sr) parts.push(`${(sr / 1000).toFixed(sr % 1000 ? 1 : 0)} kHz`);
  if (bitDepth) parts.push(`${bitDepth}-bit`);
  return { tier, label: parts.join(' · ') };
}

/** @deprecated dùng lufsNormGainDb — giữ alias tương thích */
export function loudnessNormGainDb(measuredDb, target = -14) {
  return lufsNormGainDb(measuredDb, target);
}

export async function analyzeTrack(engine, file, { lowPower = false } = {}) {
  const buffer = await engine.decodeFull(file);
  const bpm = estimateBpm(buffer, { maxDuration: lowPower ? 18 : 40, lowPower });
  let lufs = null;
  try {
    lufs = measureIntegratedLufs(buffer, { lowPower });
  } catch {
    lufs = null;
  }
  // Fallback RMS thô nếu LUFS fail (file rất ngắn / silent)
  const loudFallback = roughLoudnessDb(buffer);
  const loud = Number.isFinite(lufs) ? lufs : loudFallback;
  const dr = roughDynamicRange(buffer);
  const peaks = buildPeaks(buffer, lowPower ? 80 : 200);
  return {
    bpm,
    loud,
    lufs: Number.isFinite(lufs) ? lufs : null,
    loudUnit: Number.isFinite(lufs) ? 'LUFS' : 'dB(RMS)',
    dr,
    peaks,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    bitDepth: buffer.sampleRate >= 88200 ? 24 : 16,
    duration: buffer.duration,
  };
}
