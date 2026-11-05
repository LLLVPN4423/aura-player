/**
 * Ước lượng BPM từ AudioBuffer — thuật toán autocorrelation nhẹ
 * Trên máy yếu: downmix + downsample trước khi tính
 */

export function estimateBpm(audioBuffer, { maxDuration = 30, lowPower = false } = {}) {
  const sr = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;
  const take = Math.min(audioBuffer.length, Math.floor(sr * maxDuration));

  // Downmix mono
  const mono = new Float32Array(take);
  for (let c = 0; c < channels; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < take; i++) mono[i] += data[i] / channels;
  }

  // Downsample + envelope (RMS cửa sổ ngắn)
  const hop = lowPower ? Math.floor(sr / 100) : Math.floor(sr / 200);
  const win = hop * 2;
  const envLen = Math.floor((take - win) / hop);
  if (envLen < 64) return null;

  const env = new Float32Array(envLen);
  for (let i = 0; i < envLen; i++) {
    let s = 0;
    const off = i * hop;
    for (let j = 0; j < win; j++) {
      const v = mono[off + j];
      s += v * v;
    }
    env[i] = Math.sqrt(s / win);
  }

  // High-pass nhẹ trên envelope
  for (let i = envLen - 1; i > 0; i--) env[i] = Math.max(0, env[i] - env[i - 1] * 0.9);

  const envSr = sr / hop;
  const minBpm = 70;
  const maxBpm = 180;
  const minLag = Math.floor((60 / maxBpm) * envSr);
  const maxLag = Math.floor((60 / minBpm) * envSr);

  let bestLag = minLag;
  let bestCorr = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    const n = envLen - lag;
    for (let i = 0; i < n; i++) corr += env[i] * env[i + lag];
    corr /= n;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  let bpm = 60 / (bestLag / envSr);

  // Chuẩn hóa về khoảng hợp lý (gấp đôi / nửa)
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;

  return Math.round(bpm);
}

/** Peak waveform tĩnh cho canvas overview */
export function buildPeaks(audioBuffer, buckets = 200) {
  const ch = audioBuffer.getChannelData(0);
  const block = Math.floor(ch.length / buckets) || 1;
  const peaks = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const start = i * block;
    const end = Math.min(start + block, ch.length);
    for (let j = start; j < end; j++) {
      const a = Math.abs(ch[j]);
      if (a > max) max = a;
    }
    peaks[i] = max;
  }
  return peaks;
}

/** LUFS-ish rough loudness (integrated RMS dB) */
export function roughLoudnessDb(audioBuffer) {
  const ch = audioBuffer.getChannelData(0);
  let sum = 0;
  const step = Math.max(1, Math.floor(ch.length / 200000));
  let n = 0;
  for (let i = 0; i < ch.length; i += step) {
    sum += ch[i] * ch[i];
    n++;
  }
  const rms = Math.sqrt(sum / n);
  if (rms < 1e-8) return -Infinity;
  return 20 * Math.log10(rms);
}
