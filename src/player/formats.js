/** Định dạng audio được hỗ trợ + kiểm tra khả năng giải mã của trình duyệt */

export const SUPPORTED_EXTENSIONS = [
  'mp3', 'wav', 'ogg', 'oga', 'opus', 'aac', 'm4a', 'mp4',
  'flac', 'webm', 'aiff', 'aif', 'caf', 'wma',
];

export const ACCEPT_ATTR = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',') + ',audio/*';

const MIME_BY_EXT = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  flac: 'audio/flac',
  webm: 'audio/webm',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  caf: 'audio/x-caf',
  wma: 'audio/x-ms-wma',
};

export function extOf(name = '') {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function mimeFor(file) {
  if (file.type) return file.type;
  return MIME_BY_EXT[extOf(file.name)] || 'audio/*';
}

export function isLikelyAudio(file) {
  if (file.type?.startsWith('audio/')) return true;
  return SUPPORTED_EXTENSIONS.includes(extOf(file.name));
}

/** Probe canPlayType cho từng định dạng phổ biến */
export function probeBrowserSupport() {
  const a = document.createElement('audio');
  const tests = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg; codecs="vorbis"',
    opus: 'audio/ogg; codecs="opus"',
    aac: 'audio/aac',
    m4a: 'audio/mp4; codecs="mp4a.40.2"',
    flac: 'audio/flac',
    webm: 'audio/webm; codecs="opus"',
  };
  const result = {};
  for (const [key, mime] of Object.entries(tests)) {
    const v = a.canPlayType(mime);
    result[key] = v === 'probably' ? 'full' : v === 'maybe' ? 'partial' : 'none';
  }
  return result;
}

export function formatBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
