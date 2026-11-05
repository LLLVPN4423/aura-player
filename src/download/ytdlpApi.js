/** Client API cho tính năng dán link (cần serve.js local) */

export async function getYtdlpStatus() {
  const res = await fetch('/api/ytdlp/status');
  if (!res.ok) throw new Error('Server không hỗ trợ tải link');
  return res.json();
}

export async function startDownload({ url, mode, quality }) {
  const res = await fetch('/api/ytdlp/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, mode, quality }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Không bắt đầu được tải');
  return data;
}

export async function getJob(id) {
  const res = await fetch(`/api/ytdlp/jobs/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Job không tồn tại');
  return data;
}

export async function listDownloads() {
  const res = await fetch('/api/ytdlp/files');
  if (!res.ok) throw new Error('Không liệt kê được file');
  return res.json();
}

export async function fetchDownloadAsFile(name) {
  const res = await fetch(`/downloads/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error('Không đọc được file đã tải');
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'audio/mpeg' });
}

export function isLocalServer() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || /^192\.168\./.test(h) || /^10\./.test(h);
}
