import { icons } from './icons.js';
import {
  getYtdlpStatus,
  startDownload,
  getJob,
  listDownloads,
  fetchDownloadAsFile,
  isLocalServer,
} from '../download/ytdlpApi.js';

/**
 * Trang dán link tải — Premium Minimalist, một cột dễ dùng
 */
export class DownloadPage {
  /**
   * @param {HTMLElement} host
   * @param {{ onBack: () => void, onImportFiles: (files: File[]) => void, toast: (s: string) => void }} hooks
   */
  constructor(host, hooks) {
    this.host = host;
    this.hooks = hooks;
    this.status = null;
    this.jobs = [];
    this._poll = null;
    this.mode = 'audio';
    this.quality = 'best';
  }

  async open() {
    this.host.hidden = false;
    this.host.setAttribute('aria-hidden', 'false');
    document.body.classList.add('download-open');
    await this.render();
    this.startPolling();
  }

  close() {
    this.stopPolling();
    this.host.hidden = true;
    this.host.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('download-open');
    this.hooks.onBack();
  }

  stopPolling() {
    clearInterval(this._poll);
    this._poll = null;
  }

  startPolling() {
    this.stopPolling();
    this._poll = setInterval(() => this.refreshJobsUi(), 1200);
  }

  async render() {
    let banner = '';
    try {
      if (!isLocalServer() && location.protocol === 'https:') {
        // GitHub Pages
        this.status = { available: false, reason: 'pages' };
      } else {
        this.status = await getYtdlpStatus();
      }
    } catch {
      this.status = { available: false, reason: 'offline' };
    }

    if (!this.status?.available) {
      banner =
        this.status?.reason === 'pages'
          ? `<div class="dl-banner">GitHub Pages không chạy yt-dlp. Dùng nút <strong>Cobalt</strong> trên thanh chính → <a href="https://cobalt.tools/" target="_blank" rel="noopener">cobalt.tools</a> tải file, rồi Thêm nhạc / kéo vào Queue. Hoặc chạy local: <code>node serve.js</code>.</div>`
          : `<div class="dl-banner">Chưa tìm thấy <strong>yt-dlp</strong>. Chạy <code>node serve.js</code> — server sẽ hướng dẫn cài, hoặc đặt <code>bin/yt-dlp.exe</code>. Trên web công khai: dùng <strong>Cobalt</strong>.</div>`;
    } else {
      banner = `<div class="dl-banner ok">Sẵn sàng · yt-dlp ${escapeHtml(this.status.version || '')}${this.status.ffmpeg ? ' · ffmpeg OK' : ' · thiếu ffmpeg (nên cài để ghép/convert)'}</div>`;
    }

    this.host.innerHTML = `
      <div class="dl-sheet">
        <header class="dl-head">
          <button type="button" class="btn btn-ghost" id="dl-back" title="Quay lại">${icons.close}</button>
          <div>
            <h2>YouTube &amp; link</h2>
            <p>Dán link YT / TikTok / SoundCloud… · tải về · thêm Queue</p>
          </div>
        </header>

        ${banner}

        <label class="dl-label" for="dl-url">Link</label>
        <textarea id="dl-url" class="dl-url" rows="3" placeholder="https://youtube.com/...&#10;https://soundcloud.com/...&#10;TikTok, Facebook, X…" spellcheck="false"></textarea>

        <div class="dl-row">
          <div class="field grow">
            <label class="lbl">Loại</label>
            <div class="seg" id="dl-mode">
              <button type="button" data-mode="audio" class="active">Nhạc (MP3)</button>
              <button type="button" data-mode="video">Video</button>
            </div>
          </div>
          <div class="field grow">
            <label class="lbl">Chất lượng</label>
            <div class="seg" id="dl-quality">
              <button type="button" data-q="best" class="active">Cao nhất</button>
              <button type="button" data-q="balanced">Cân bằng</button>
            </div>
          </div>
        </div>

        <button type="button" class="btn btn-primary dl-go" id="dl-start" ${this.status?.available ? '' : 'disabled'}>
          ${icons.plus} Bắt đầu tải
        </button>

        <section class="dl-section">
          <div class="dl-section-head">
            <h3>Đang tải</h3>
          </div>
          <ul class="dl-jobs" id="dl-jobs"><li class="dl-empty">Chưa có tác vụ</li></ul>
        </section>

        <section class="dl-section">
          <div class="dl-section-head">
            <h3>Đã tải</h3>
            <button type="button" class="btn" id="dl-refresh">Làm mới</button>
          </div>
          <ul class="dl-files" id="dl-files"><li class="dl-empty">Trống</li></ul>
        </section>
      </div>
    `;

    this.bind();
    await this.refreshFiles();
    await this.refreshJobsUi();
  }

  bind() {
    this.host.querySelector('#dl-back').onclick = () => this.close();
    this.host.querySelector('#dl-mode').onclick = (e) => {
      const btn = e.target.closest('[data-mode]');
      if (!btn) return;
      this.mode = btn.dataset.mode;
      this.host.querySelectorAll('#dl-mode button').forEach((b) => b.classList.toggle('active', b === btn));
    };
    this.host.querySelector('#dl-quality').onclick = (e) => {
      const btn = e.target.closest('[data-q]');
      if (!btn) return;
      this.quality = btn.dataset.q;
      this.host.querySelectorAll('#dl-quality button').forEach((b) => b.classList.toggle('active', b === btn));
    };
    this.host.querySelector('#dl-start').onclick = () => this.onStart();
    this.host.querySelector('#dl-refresh').onclick = () => this.refreshFiles();
    this.host.querySelector('#dl-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.onStart();
    });
  }

  async onStart() {
    const raw = this.host.querySelector('#dl-url').value.trim();
    const urls = raw.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (!urls.length) {
      this.hooks.toast('Dán ít nhất một link');
      return;
    }
    if (!this.status?.available) {
      this.hooks.toast('yt-dlp chưa sẵn sàng');
      return;
    }

    for (const url of urls) {
      try {
        const job = await startDownload({ url, mode: this.mode, quality: this.quality });
        this.jobs.unshift(job);
        this.hooks.toast('Đã xếp hàng tải');
      } catch (err) {
        this.hooks.toast(err.message || 'Lỗi tải');
      }
    }
    this.host.querySelector('#dl-url').value = '';
    await this.refreshJobsUi();
  }

  async refreshJobsUi() {
    const el = this.host.querySelector('#dl-jobs');
    if (!el) return;

    // Refresh active jobs from server
    const next = [];
    for (const j of this.jobs) {
      if (j.status === 'done' || j.status === 'error') {
        next.push(j);
        continue;
      }
      try {
        next.push(await getJob(j.id));
      } catch {
        next.push(j);
      }
    }
    this.jobs = next;

    // Also pull recent from server list if empty tracking
    try {
      const res = await fetch('/api/ytdlp/jobs');
      if (res.ok) {
        const all = await res.json();
        for (const j of all) {
          if (!this.jobs.some((x) => x.id === j.id)) this.jobs.push(j);
        }
      }
    } catch {
      /* */
    }

    if (!this.jobs.length) {
      el.innerHTML = `<li class="dl-empty">Chưa có tác vụ</li>`;
      return;
    }

    el.innerHTML = this.jobs
      .slice(0, 12)
      .map((j) => {
        const pct = Math.max(0, Math.min(100, Math.round(j.progress || 0)));
        const st =
          j.status === 'done'
            ? 'Xong'
            : j.status === 'error'
              ? 'Lỗi'
              : j.status === 'running'
                ? `${pct}%`
                : 'Chờ';
        return `<li class="dl-job ${j.status}">
          <div class="dl-job-top">
            <span class="dl-job-url">${escapeHtml(j.title || j.url)}</span>
            <span class="dl-job-st">${st}</span>
          </div>
          <div class="dl-bar"><i style="width:${j.status === 'done' ? 100 : pct}%"></i></div>
          ${j.error ? `<p class="dl-err">${escapeHtml(j.error)}</p>` : ''}
          ${
            j.status === 'done' && j.files?.length
              ? `<button type="button" class="btn dl-add" data-files="${escapeAttr(j.files.join('|'))}">Thêm vào Queue</button>`
              : ''
          }
        </li>`;
      })
      .join('');

    el.querySelectorAll('[data-files]').forEach((btn) => {
      btn.onclick = () => this.importNames(btn.dataset.files.split('|').filter(Boolean));
    });

    // Auto-refresh file list when something finishes
    if (this.jobs.some((j) => j.status === 'done')) this.refreshFiles();
  }

  async refreshFiles() {
    const el = this.host.querySelector('#dl-files');
    if (!el) return;
    if (!this.status?.available) {
      el.innerHTML = `<li class="dl-empty">—</li>`;
      return;
    }
    try {
      const { files } = await listDownloads();
      if (!files?.length) {
        el.innerHTML = `<li class="dl-empty">Chưa có file trong thư mục downloads/</li>`;
        return;
      }
      el.innerHTML = files
        .map(
          (f) => `<li class="dl-file">
          <div>
            <div class="name">${escapeHtml(f.name)}</div>
            <div class="meta">${formatSize(f.size)} · ${f.mtime ? new Date(f.mtime).toLocaleString() : ''}</div>
          </div>
          <button type="button" class="btn btn-primary" data-name="${escapeAttr(f.name)}">Thêm</button>
        </li>`,
        )
        .join('');
      el.querySelectorAll('[data-name]').forEach((btn) => {
        btn.onclick = () => this.importNames([btn.dataset.name]);
      });
    } catch {
      el.innerHTML = `<li class="dl-empty">Không đọc được downloads/</li>`;
    }
  }

  async importNames(names) {
    const files = [];
    for (const name of names) {
      try {
        files.push(await fetchDownloadAsFile(name));
      } catch (err) {
        this.hooks.toast(err.message || name);
      }
    }
    if (files.length) {
      this.hooks.onImportFiles(files);
      this.hooks.toast(`Đã thêm ${files.length} bài vào Queue`);
      this.close();
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
