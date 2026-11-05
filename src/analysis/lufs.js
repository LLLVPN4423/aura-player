/**
 * Integrated loudness gần ITU-R BS.1770-4 (LUFS)
 * — K-weighting + absolute/relative gating, tối ưu máy yếu bằng hop/downsample.
 */

const ABS_GATE = -70;
const REL_GATE_LU = -10;
const BLOCK_MS = 400;
const OVERLAP = 0.75;
/** Hằng số BS.1770: LUFS = -0.691 + 10*log10(mean square) */
const LUFS_OFFSET = -0.691;

/** Biquad coeffs @ sampleRate — high-shelf ~ +4 dB @ 1500 Hz (K stage 1) */
function kShelfCoeffs(sr) {
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / sr);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0_ = 1 + K / Q + K * K;
  return {
    b0: (Vh + (Vb * K) / Q + K * K) / a0_,
    b1: (2 * (K * K - Vh)) / a0_,
    b2: (Vh - (Vb * K) / Q + K * K) / a0_,
    a1: (2 * (K * K - 1)) / a0_,
    a2: (1 - K / Q + K * K) / a0_,
  };
}

/** High-pass ~38 Hz (K stage 2) */
function kHpCoeffs(sr) {
  const f0 = 38.13547087602444;
  const Q = 0.5003270373238773;
  const K = Math.tan((Math.PI * f0) / sr);
  const a0_ = 1 + K / Q + K * K;
  return {
    b0: 1 / a0_,
    b1: (-2) / a0_,
    b2: 1 / a0_,
    a1: (2 * (K * K - 1)) / a0_,
    a2: (1 - K / Q + K * K) / a0_,
  };
}

function applyBiquad(input, c) {
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const { b0, b1, b2, a1, a2 } = c;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

function kWeight(channel, sr) {
  return applyBiquad(applyBiquad(channel, kShelfCoeffs(sr)), kHpCoeffs(sr));
}

function meanSquareBlocks(samples, sr, { hopFactor = 1 } = {}) {
  const block = Math.max(1, Math.round((sr * BLOCK_MS) / 1000 / hopFactor) * hopFactor);
  const hop = Math.max(1, Math.round(block * (1 - OVERLAP)));
  const blocks = [];
  for (let i = 0; i + block <= samples.length; i += hop) {
    let s = 0;
    for (let j = 0; j < block; j += hopFactor) {
      const v = samples[i + j];
      s += v * v;
    }
    const n = Math.ceil(block / hopFactor);
    blocks.push(s / n);
  }
  return blocks;
}

function gating(meanSquares) {
  if (!meanSquares.length) return null;

  const loudOf = (ms) => (ms <= 1e-12 ? -Infinity : LUFS_OFFSET + 10 * Math.log10(ms));

  // Absolute gate
  let gated = meanSquares.filter((ms) => loudOf(ms) > ABS_GATE);
  if (!gated.length) return null;

  const absMean = gated.reduce((a, b) => a + b, 0) / gated.length;
  const relThresh = loudOf(absMean) + REL_GATE_LU;

  gated = gated.filter((ms) => loudOf(ms) > relThresh);
  if (!gated.length) return null;

  const finalMean = gated.reduce((a, b) => a + b, 0) / gated.length;
  return loudOf(finalMean);
}

/**
 * @returns {number|null} Integrated loudness (LUFS)
 */
export function measureIntegratedLufs(audioBuffer, { lowPower = false } = {}) {
  const sr = audioBuffer.sampleRate;
  const chN = audioBuffer.numberOfChannels;
  const len = audioBuffer.length;

  // Giới hạn phân tích ~3 phút đầu / giữa để máy yếu vẫn ổn
  const maxSamples = Math.min(len, Math.floor(sr * (lowPower ? 90 : 180)));
  const start = len > maxSamples ? Math.floor((len - maxSamples) / 2) : 0;

  const hopFactor = lowPower ? 4 : 2;
  const channelMS = [];

  for (let c = 0; c < Math.min(chN, 2); c++) {
    const raw = audioBuffer.getChannelData(c).subarray(start, start + maxSamples);
    // Copy vì subarray có thể gắn buffer gốc; filter cần mảng độc lập
    const slice = new Float32Array(raw.length);
    // Downsample thô trước K-weight khi lowPower
    if (lowPower) {
      const ds = Math.floor(raw.length / 2);
      const tiny = new Float32Array(ds);
      for (let i = 0; i < ds; i++) tiny[i] = raw[i * 2];
      const weighted = kWeight(tiny, sr / 2);
      channelMS.push(meanSquareBlocks(weighted, sr / 2, { hopFactor: 2 }));
    } else {
      slice.set(raw);
      const weighted = kWeight(slice, sr);
      channelMS.push(meanSquareBlocks(weighted, sr, { hopFactor }));
    }
  }

  const nBlocks = Math.min(...channelMS.map((a) => a.length));
  if (nBlocks < 4) return null;

  // Stereo: tổng mean-square có trọng số G=1 (BS.1770), không chia trung bình
  const combined = new Array(nBlocks);
  for (let i = 0; i < nBlocks; i++) {
    let s = 0;
    for (const ch of channelMS) s += ch[i];
    combined[i] = s;
  }

  return gating(combined);
}

/** Gain đưa integrated LUFS về target (mặc định −14 như streaming) */
export function lufsNormGainDb(lufs, target = -14) {
  if (!Number.isFinite(lufs)) return 0;
  // Clamp nhẹ hơn RMS thô — tránh “đè” động
  return Math.max(-10, Math.min(10, target - lufs));
}
