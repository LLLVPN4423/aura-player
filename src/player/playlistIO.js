/** Export / import playlist metadata (không cần backend) */

export function exportPlaylistJson(playlist) {
  const { items, shuffle, repeat } = playlist.snapshot();
  return {
    version: 1,
    app: 'aura-player',
    exportedAt: new Date().toISOString(),
    shuffle,
    repeat,
    tracks: items.map((t, i) => ({
      order: i,
      name: t.name,
      filename: t.filename,
      size: t.size,
      artist: t.tags?.artist || null,
      album: t.tags?.album || null,
      title: t.tags?.title || null,
    })),
  };
}

export function downloadJson(obj, filename = 'aura-playlist.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Sắp xếp lại queue hiện tại theo thứ tự filename trong JSON.
 * File chưa có trong queue → bỏ qua (user cần Thêm nhạc trước).
 * @returns {{ matched: number, missing: string[] }}
 */
export function applyPlaylistImport(playlist, data) {
  const tracks = data?.tracks;
  if (!Array.isArray(tracks)) throw new Error('JSON playlist không hợp lệ');

  const byName = new Map(playlist.items.map((t) => [t.filename.toLowerCase(), t]));
  const ordered = [];
  const missing = [];
  for (const row of tracks) {
    const key = String(row.filename || '').toLowerCase();
    const hit = byName.get(key);
    if (hit) {
      ordered.push(hit);
      byName.delete(key);
    } else missing.push(row.filename || row.name || '?');
  }
  // giữ phần còn lại ở cuối
  for (const t of byName.values()) ordered.push(t);

  playlist.items = ordered;
  if (playlist.index >= ordered.length) playlist.index = ordered.length ? 0 : -1;
  playlist._rebuildOrder();
  playlist._notify();
  return { matched: tracks.length - missing.length, missing };
}
