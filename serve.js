import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8765;
const root = __dirname;
const downloadsDir = path.join(root, 'downloads');
const binDir = path.join(root, 'bin');

fs.mkdirSync(downloadsDir, { recursive: true });
fs.mkdirSync(binDir, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
};

/** @type {Map<string, object>} */
const jobs = new Map();

function findBinary(names) {
  for (const name of names) {
    for (const c of [path.join(binDir, name), path.join(binDir, `${name}.exe`)]) {
      if (fs.existsSync(c)) return c;
    }
  }
  for (const name of names) {
    try {
      const out = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], {
        encoding: 'utf8',
      });
      const first = out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)[0];
      if (first && fs.existsSync(first)) return first;
    } catch {
      /* */
    }
  }
  return null;
}

function probeTools() {
  const ytDlp = findBinary(['yt-dlp']);
  const ffmpeg = findBinary(['ffmpeg']);
  let version = null;
  if (ytDlp) {
    try {
      version = execFileSync(ytDlp, ['--version'], { encoding: 'utf8' }).trim();
    } catch {
      version = 'unknown';
    }
  }
  return { ytDlp, ffmpeg, version, available: !!ytDlp };
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function isSafeHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildArgs({ url, mode, quality, outTemplate }) {
  const args = [
    '--no-playlist',
    '--newline',
    '--no-warnings',
    '-o',
    outTemplate,
    '--restrict-filenames',
    '--windows-filenames',
  ];
  if (mode === 'audio') {
    args.push('-x', '--audio-format', 'mp3');
    args.push('--audio-quality', quality === 'balanced' ? '5' : '0');
  } else {
    args.push(
      '-f',
      quality === 'balanced' ? 'bv*[height<=720]+ba/b[height<=720]/b' : 'bv*+ba/b',
    );
    args.push('--merge-output-format', 'mp4');
  }
  args.push('--', url);
  return args;
}

function parseProgress(line) {
  const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  return m ? Number(m[1]) : null;
}

function startJob({ url, mode, quality }) {
  const tools = probeTools();
  if (!tools.ytDlp) {
    throw new Error('Chưa có yt-dlp. Chạy: winget install yt-dlp.yt-dlp');
  }

  const id = randomBytes(6).toString('hex');
  const outTemplate = path.join(downloadsDir, '%(title).180B [%(id)s].%(ext)s');
  const args = buildArgs({ url, mode, quality, outTemplate });
  const before = new Set(fs.readdirSync(downloadsDir));

  const job = {
    id,
    url,
    mode,
    quality,
    title: url,
    status: 'running',
    progress: 0,
    error: null,
    files: [],
    startedAt: Date.now(),
  };
  jobs.set(id, job);

  const child = spawn(tools.ytDlp, args, { cwd: root, windowsHide: true, env: { ...process.env } });

  let log = '';
  const onData = (buf) => {
    const text = buf.toString();
    log += text;
    for (const line of text.split(/\r?\n/)) {
      const p = parseProgress(line);
      if (p != null) job.progress = p;
      const dest = line.match(/\[download\] Destination: (.+)/);
      if (dest) job.title = path.basename(dest[1].trim());
      const extract = line.match(/\[ExtractAudio\] Destination: (.+)/);
      if (extract) job.title = path.basename(extract[1].trim());
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('close', (code) => {
    const after = fs.readdirSync(downloadsDir);
    const created = after.filter((f) => !before.has(f) && !f.endsWith('.part'));
    job.files = created;
    if (created[0]) job.title = created[0];
    if (code === 0 && created.length) {
      job.status = 'done';
      job.progress = 100;
    } else {
      job.status = 'error';
      job.error = (
        log
          .split(/\r?\n/)
          .filter(Boolean)
          .slice(-4)
          .join(' ') || `yt-dlp exit ${code}`
      ).slice(0, 400);
    }
  });

  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return job;
}

function listDownloadFiles() {
  return fs
    .readdirSync(downloadsDir)
    .filter((n) => !n.endsWith('.part') && !n.startsWith('.'))
    .map((name) => {
      const st = fs.statSync(path.join(downloadsDir, name));
      return { name, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function sendFile(res, full) {
  const ext = path.extname(full).toLowerCase();
  res.writeHead(200, {
    'Content-Type': mime[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', `http://127.0.0.1`);
  let urlPath = decodeURIComponent(u.pathname);

  if (urlPath === '/api/ytdlp/status' && req.method === 'GET') {
    const t = probeTools();
    return json(res, 200, {
      available: t.available,
      version: t.version,
      ffmpeg: !!t.ffmpeg,
      downloadsDir: 'downloads/',
    });
  }

  if (urlPath === '/api/ytdlp/download' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const url = String(body.url || '').trim();
      const mode = body.mode === 'video' ? 'video' : 'audio';
      const quality = body.quality === 'balanced' ? 'balanced' : 'best';
      if (!isSafeHttpUrl(url)) return json(res, 400, { error: 'URL không hợp lệ' });
      return json(res, 200, startJob({ url, mode, quality }));
    } catch (e) {
      return json(res, 500, { error: e.message || 'Lỗi' });
    }
  }

  if (urlPath === '/api/ytdlp/jobs' && req.method === 'GET') {
    return json(res, 200, [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 30));
  }

  if (urlPath.startsWith('/api/ytdlp/jobs/') && req.method === 'GET') {
    const job = jobs.get(urlPath.slice('/api/ytdlp/jobs/'.length));
    if (!job) return json(res, 404, { error: 'Không tìm thấy job' });
    return json(res, 200, job);
  }

  if (urlPath === '/api/ytdlp/files' && req.method === 'GET') {
    return json(res, 200, { files: listDownloadFiles() });
  }

  if (urlPath.startsWith('/downloads/') && req.method === 'GET') {
    const name = path.basename(urlPath.slice('/downloads/'.length));
    const full = path.join(downloadsDir, name);
    if (!full.startsWith(downloadsDir) || !fs.existsSync(full)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    return sendFile(res, full);
  }

  if (urlPath === '/') urlPath = '/index.html';
  const full = path.normalize(path.join(root, urlPath));
  if (!full.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(port, '0.0.0.0', () => {
  const tools = probeTools();
  console.log('');
  console.log('  Aura Player');
  console.log(`  Máy tính : http://localhost:${port}/`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  Điện thoại: http://${net.address}:${port}/`);
      }
    }
  }
  console.log(`  yt-dlp    : ${tools.available ? tools.version + ' ✓' : 'chưa có — winget install yt-dlp.yt-dlp'}`);
  console.log(`  ffmpeg    : ${tools.ffmpeg ? 'OK' : 'thiếu'}`);
  console.log('  Ctrl+C để dừng.');
  console.log('');
});
