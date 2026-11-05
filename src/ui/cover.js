/** Artwork trừu tượng theo tên bài — phong cách Hi-Fi tối giản */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hsl(h, s, l) {
  return `hsl(${h % 360} ${s}% ${l}%)`;
}

export function coverDataUrl(seed, size = 512) {
  const h = hash(seed || 'aura');
  const h1 = h % 360;
  const h2 = (h1 + 28 + (h % 40)) % 360;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, hsl(h1, 18, 18));
  g.addColorStop(0.55, hsl(h2, 14, 12));
  g.addColorStop(1, hsl(h1 + 200, 10, 8));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Vòng đĩa hi-fi
  const cx = size * 0.5;
  const cy = size * 0.52;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${h1 + 40}, 28%, 62%, 0.55)`;
  ctx.lineWidth = size * 0.012;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${h1 + 40}, 35%, 72%, 0.9)`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.035, 0, Math.PI * 2);
  ctx.fillStyle = '#0c0c0b';
  ctx.fill();

  // Chữ monogram
  const letter = (seed || 'A').trim().charAt(0).toUpperCase() || 'A';
  ctx.fillStyle = `hsla(40, 30%, 88%, 0.92)`;
  ctx.font = `600 ${size * 0.14}px "Manrope", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, cx, size * 0.18);

  return canvas.toDataURL('image/jpeg', 0.86);
}

/** Parse ID3v2 APIC cover nếu có (MP3) */
export async function extractCoverFromFile(file) {
  try {
    if (!/\.mp3$/i.test(file.name) && file.type !== 'audio/mpeg') return null;
    const head = await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer();
    const view = new DataView(head);
    const bytes = new Uint8Array(head);
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;

    const ver = bytes[3];
    let offset = 10;
    if (bytes[5] & 0x40) {
      // extended header
      const ext = readSyncSafe(view, 10);
      offset += 4 + ext;
    }

    const tagSize = readSyncSafe(view, 6);
    const end = Math.min(10 + tagSize, bytes.length);

    while (offset + 10 < end) {
      const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      if (id === '\u0000\u0000\u0000\u0000') break;
      let size;
      if (ver === 4) size = readSyncSafe(view, offset + 4);
      else size = view.getUint32(offset + 4);
      const frameStart = offset + 10;
      if (size <= 0 || frameStart + size > end) break;

      if (id === 'APIC') {
        let i = frameStart;
        i += 1; // encoding
        while (i < frameStart + size && bytes[i] !== 0) i++; // mime
        i += 1;
        i += 1; // picture type
        // description
        while (i < frameStart + size && bytes[i] !== 0) i++;
        i += 1;
        const img = bytes.slice(i, frameStart + size);
        const blob = new Blob([img], { type: 'image/jpeg' });
        return URL.createObjectURL(blob);
      }
      offset = frameStart + size;
    }
  } catch {
    return null;
  }
  return null;
}

function readSyncSafe(view, offset) {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}
