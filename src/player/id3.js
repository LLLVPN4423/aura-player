/** ID3v2 — title / artist / album / cover (MP3) */

function readSyncSafe(view, offset) {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

function decodeText(bytes, encoding, start, end) {
  const slice = bytes.subarray(start, end);
  try {
    if (encoding === 0) return new TextDecoder('latin1').decode(slice).replace(/\0/g, '').trim();
    if (encoding === 3) return new TextDecoder('utf-8').decode(slice).replace(/\0/g, '').trim();
    if (encoding === 1 || encoding === 2) {
      // UTF-16 with BOM or UTF-16BE
      return new TextDecoder('utf-16').decode(slice).replace(/\0/g, '').trim();
    }
  } catch {
    /* */
  }
  return new TextDecoder('latin1').decode(slice).replace(/\0/g, '').trim();
}

function textFrame(bytes, start, size, encoding) {
  return decodeText(bytes, encoding, start + 1, start + size);
}

/**
 * @returns {Promise<{ title?: string, artist?: string, album?: string, coverUrl?: string }>}
 */
export async function parseId3(file) {
  const out = {};
  try {
    if (!/\.mp3$/i.test(file.name) && file.type !== 'audio/mpeg') return out;
    const head = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
    const view = new DataView(head);
    const bytes = new Uint8Array(head);
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return out;

    const ver = bytes[3];
    let offset = 10;
    if (bytes[5] & 0x40) {
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

      const enc = bytes[frameStart];
      if (id === 'TIT2') out.title = textFrame(bytes, frameStart, size, enc);
      else if (id === 'TPE1') out.artist = textFrame(bytes, frameStart, size, enc);
      else if (id === 'TALB') out.album = textFrame(bytes, frameStart, size, enc);
      else if (id === 'APIC' && !out.coverUrl) {
        let i = frameStart + 1;
        while (i < frameStart + size && bytes[i] !== 0) i++;
        i += 1; // mime end
        i += 1; // pic type
        while (i < frameStart + size && bytes[i] !== 0) i++;
        i += 1;
        const img = bytes.slice(i, frameStart + size);
        if (img.length > 32) {
          out.coverUrl = URL.createObjectURL(new Blob([img], { type: 'image/jpeg' }));
        }
      }
      offset = frameStart + size;
    }
  } catch {
    /* ignore */
  }
  return out;
}
