import { AudioEngine, PERF_PRESETS, EQ_PRESETS, EQ_FREQS } from '../player/AudioEngine.js';
import { HEADPHONE_PRESETS } from '../player/headphones.js';
import { Playlist } from '../player/Playlist.js';
import {
  ACCEPT_ATTR,
  isLikelyAudio,
  formatBytes,
  formatTime,
  probeBrowserSupport,
  extOf,
} from '../player/formats.js';
import { analyzeTrack, qualityBadge, lufsNormGainDb } from '../analysis/metrics.js';
import { Visualizer } from './visualizer.js';
import { coverDataUrl, extractCoverFromFile } from './cover.js';
import { icons } from './icons.js';
import { DownloadPage } from './DownloadPage.js';

const SETTINGS_KEY = 'aura-hifi-settings';

function detectPerfDefault() {
  const cores = navigator.hardwareConcurrency || 2;
  const mem = navigator.deviceMemory || 4;
  if (navigator.connection?.saveData || cores <= 2 || mem <= 2) return 'low';
  if (cores <= 4 || mem <= 4) return 'balanced';
  return 'high';
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

export class App {
  constructor(root) {
    this.root = root;
    this.engine = new AudioEngine();
    this.playlist = new Playlist();
    this.viz = null;
    this.playing = false;
    this.sideTab = 'queue';
    this.peaks = null;
    this.coverUrl = null;
    this.favorites = new Set(JSON.parse(localStorage.getItem('aura-favs') || '[]'));
    this.sleepTimer = null;
    this.sleepLeft = 0;
    this._toastTimer = 0;
    this._eqPreset = 'flat';
    this.settings = {
      perf: detectPerfDefault(),
      viz: true,
      analyze: true,
      crossfade: 0,
      crossfeed: 0,
      balance: 0,
      loudnessNorm: false,
      limiter: false,
      pure: false,
      headphone: 'flat',
      volume: 85,
      ...loadSettings(),
    };
    this._eqPreset = this.settings.headphone || 'flat';

    this.render();
    this.bind();
    this.applySettings();
  }

  saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  applySettings() {
    this.engine.setPerfMode(this.settings.perf);
    this.engine.setCrossfade(Number(this.settings.crossfade) || 0);
    this.engine.setCrossfeed(Number(this.settings.crossfeed) || 0);
    this.engine.setBalance(Number(this.settings.balance) || 0);
    this.engine.setLimiter(!!this.settings.limiter);
    this.engine.setVolume((this.settings.volume || 85) / 100);
    this.engine.setPureMode(!!this.settings.pure);
    if (!this.settings.pure) {
      this.applyHeadphoneOrEq();
      this.applyLoudness();
    }
    if (this.viz) this.viz.setEnabled(this.settings.viz !== false);
    if (this.els?.volume) this.els.volume.value = String(this.settings.volume || 85);
    this.syncPureUi();
  }

  applyHeadphoneOrEq() {
    const hp = HEADPHONE_PRESETS[this.settings.headphone];
    if (hp && this.settings.headphone !== 'flat') {
      this.engine.applyEqGains(hp.gains);
      this._eqPreset = this.settings.headphone;
      return;
    }
    if (EQ_PRESETS[this._eqPreset]) this.engine.applyEqPreset(this._eqPreset);
    else this.engine.applyEqGains(EQ_PRESETS.flat);
  }

  setPure(on) {
    this.settings.pure = !!on;
    this.engine.setPureMode(this.settings.pure);
    if (!this.settings.pure) {
      this.engine.setCrossfeed(this.settings.crossfeed || 0);
      this.engine.setLimiter(!!this.settings.limiter);
      this.applyHeadphoneOrEq();
      this.applyLoudness();
    }
    this.saveSettings();
    this.syncPureUi();
    this.toast(this.settings.pure ? 'Pure on — đường tín hiệu ngắn nhất' : 'Pure off — DSP trở lại');
    if (this.sideTab === 'sound') this.renderStudio();
  }

  syncPureUi() {
    this.els?.pure?.classList.toggle('active', !!this.settings.pure);
    this.els?.hero?.classList.toggle('is-pure', !!this.settings.pure);
    if (this.els?.tier && this.settings.pure) {
      /* tier vẫn hiện quality file; badge phụ hiện Pure qua class */
    }
  }

  render() {
    this.root.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <h1>Aura</h1>
          <span>Premium Minimalist Hi‑Fi</span>
        </div>
        <div class="top-actions">
          <button class="btn btn-primary" id="btn-add" type="button">${icons.plus} Thêm nhạc</button>
          <button class="btn btn-yt" id="btn-fetch" type="button" title="Dán link YouTube / TikTok / …">${icons.link} YouTube</button>
          <button class="btn btn-ghost" id="btn-clear" type="button" title="Xóa hàng đợi">${icons.trash}</button>
        </div>
      </header>

      <div id="download-host" class="download-host" hidden aria-hidden="true"></div>

      <section class="hero" id="hero">
        <div class="art-wrap">
          <img id="cover" alt="" src="${coverDataUrl('Aura')}" />
          <div class="art-glow"></div>
        </div>
        <div class="player-main">
          <div class="meta-block">
            <div class="quality">
              <span class="pill" id="tier">Ready</span>
              <span id="badge">Chọn bài để bắt đầu</span>
            </div>
            <h2 class="track-title" id="title">Listening room</h2>
            <p class="track-sub" id="subtitle">FLAC · WAV · AAC · Opus · MP3 — kéo thả tệp vào đây</p>
          </div>

          <div class="seek-block">
            <canvas class="spectrum-line" id="spectrum"></canvas>
            <div class="seek-row">
              <span id="t-cur">0:00</span>
              <input type="range" id="seek" min="0" max="1000" value="0" />
              <span id="t-dur">0:00</span>
            </div>
          </div>

          <div class="transport">
            <div class="transport-core">
              <button class="icon-btn" id="btn-shuffle" type="button" title="Shuffle">${icons.shuffle}</button>
              <button class="icon-btn" id="btn-prev" type="button" title="Trước">${icons.prev}</button>
              <button class="play-btn" id="btn-play" type="button" title="Phát">${icons.play}</button>
              <button class="icon-btn" id="btn-next" type="button" title="Sau">${icons.next}</button>
              <button class="icon-btn" id="btn-repeat" type="button" title="Lặp">${icons.repeat}</button>
              <button class="icon-btn" id="btn-fav" type="button" title="Yêu thích">${icons.heart}</button>
              <button class="icon-btn pure-btn" id="btn-pure" type="button" title="Pure / Direct — tắt DSP">Pure</button>
              <button class="icon-btn" id="btn-sleep" type="button" title="Sleep timer">${icons.moon}</button>
            </div>
            <div class="vol-cluster">
              ${icons.volume}
              <input type="range" id="volume" min="0" max="100" value="${this.settings.volume}" />
            </div>
          </div>
        </div>
      </section>

      <div class="dock">
        <section class="panel">
          <div class="panel-head">
            <h3>Queue</h3>
            <span class="hint" id="queue-count">0 bài</span>
          </div>
          <div class="tab-body" id="queue-body"></div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h3>Studio</h3>
            <div class="tabs">
              <button class="tab active" data-tab="sound" type="button">Sound</button>
              <button class="tab" data-tab="lab" type="button">Lab</button>
              <button class="tab" data-tab="system" type="button">System</button>
            </div>
          </div>
          <div class="tab-body" id="studio-body"></div>
        </section>
      </div>

      <audio id="media-a" playsinline></audio>
      <audio id="media-b" playsinline></audio>
      <input type="file" id="file" class="hidden-file" multiple accept="${ACCEPT_ATTR}" />
      <div class="drop-overlay" id="drop"><p>Drop to listen</p></div>
      <div class="toast" id="toast"></div>
    `;

    this.els = {
      hero: this.root.querySelector('#hero'),
      cover: this.root.querySelector('#cover'),
      title: this.root.querySelector('#title'),
      subtitle: this.root.querySelector('#subtitle'),
      tier: this.root.querySelector('#tier'),
      badge: this.root.querySelector('#badge'),
      seek: this.root.querySelector('#seek'),
      tCur: this.root.querySelector('#t-cur'),
      tDur: this.root.querySelector('#t-dur'),
      play: this.root.querySelector('#btn-play'),
      volume: this.root.querySelector('#volume'),
      mediaA: this.root.querySelector('#media-a'),
      mediaB: this.root.querySelector('#media-b'),
      file: this.root.querySelector('#file'),
      queueBody: this.root.querySelector('#queue-body'),
      studioBody: this.root.querySelector('#studio-body'),
      queueCount: this.root.querySelector('#queue-count'),
      drop: this.root.querySelector('#drop'),
      toast: this.root.querySelector('#toast'),
      shuffle: this.root.querySelector('#btn-shuffle'),
      repeat: this.root.querySelector('#btn-repeat'),
      fav: this.root.querySelector('#btn-fav'),
      pure: this.root.querySelector('#btn-pure'),
      sleep: this.root.querySelector('#btn-sleep'),
      downloadHost: this.root.querySelector('#download-host'),
    };

    this.engine.attachMedia(this.els.mediaA, this.els.mediaB);
    this.viz = new Visualizer(this.root.querySelector('#spectrum'), null);
    this.downloadPage = new DownloadPage(this.els.downloadHost, {
      onBack: () => {},
      onImportFiles: (files) => this.addFiles(files),
      toast: (msg) => this.toast(msg),
    });
    this.renderQueue();
    this.renderStudio();
  }

  bind() {
    this.root.querySelector('#btn-add').onclick = () => this.els.file.click();
    this.root.querySelector('#btn-fetch').onclick = () => this.downloadPage.open();
    this.root.querySelector('#btn-clear').onclick = () => this.clearAll();

    this.els.file.onchange = () => {
      this.addFiles([...this.els.file.files]);
      this.els.file.value = '';
    };

    this.els.play.onclick = () => this.togglePlay();
    this.root.querySelector('#btn-prev').onclick = () => this.goPrev();
    this.root.querySelector('#btn-next').onclick = () => this.goNext();

    this.els.shuffle.onclick = () => {
      this.playlist.setShuffle(!this.playlist.shuffle);
      this.els.shuffle.classList.toggle('active', this.playlist.shuffle);
      this.toast(this.playlist.shuffle ? 'Shuffle on' : 'Shuffle off');
    };

    this.els.repeat.onclick = () => {
      const mode = this.playlist.cycleRepeat();
      this.els.repeat.classList.toggle('active', mode !== 'off');
      this.toast(mode === 'one' ? 'Lặp một bài' : mode === 'all' ? 'Lặp queue' : 'Tắt lặp');
    };

    this.els.fav.onclick = () => this.toggleFav();
    this.els.pure.onclick = () => this.setPure(!this.settings.pure);
    this.els.sleep.onclick = () => this.cycleSleep();

    this.els.seek.oninput = () => {
      const m = this.engine.mediaElement;
      const dur = m?.duration || 0;
      this.engine.seek((this.els.seek.value / 1000) * dur);
    };

    this.els.volume.oninput = () => {
      this.settings.volume = +this.els.volume.value;
      this.engine.setVolume(this.settings.volume / 100);
      this.saveSettings();
    };

    this.root.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.onclick = () => {
        this.sideTab = btn.dataset.tab;
        this.root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
        this.renderStudio();
      };
    });

    const onTime = () => this.onTime();
    const onEnded = () => this.onEnded();
    this.els.mediaA.addEventListener('timeupdate', onTime);
    this.els.mediaB.addEventListener('timeupdate', onTime);
    this.els.mediaA.addEventListener('ended', onEnded);
    this.els.mediaB.addEventListener('ended', onEnded);

    // Crossfade: bắt đầu bài kế trước khi hết
    this.els.mediaA.addEventListener('timeupdate', () => this.maybeCrossfade());
    this.els.mediaB.addEventListener('timeupdate', () => this.maybeCrossfade());

    this.engine.on('analysis', (a) => {
      this.viz.draw(a);
      if (this.sideTab === 'lab') this.updateLiveMeters(a);
    });

    this.playlist.subscribe(() => this.renderQueue());

    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragDepth++;
      this.els.drop.classList.add('show');
    });
    window.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) this.els.drop.classList.remove('show');
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      this.els.drop.classList.remove('show');
      const files = [...(e.dataTransfer?.files || [])].filter(isLikelyAudio);
      if (files.length) this.addFiles(files);
      else this.toast('Không có tệp audio');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.engine.stopAnalysis();
      else if (this.playing) this.engine._startAnalysisLoop();
    });

    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === 'ArrowRight') this.engine.seek((this.engine.mediaElement?.currentTime || 0) + 5);
      else if (e.code === 'ArrowLeft') this.engine.seek((this.engine.mediaElement?.currentTime || 0) - 5);
      else if (e.code === 'ArrowUp') {
        e.preventDefault();
        this.els.volume.value = Math.min(100, +this.els.volume.value + 5);
        this.els.volume.dispatchEvent(new Event('input'));
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        this.els.volume.value = Math.max(0, +this.els.volume.value - 5);
        this.els.volume.dispatchEvent(new Event('input'));
      } else if (e.key === 'n' || e.key === 'N') this.goNext();
      else if (e.key === 'p' || e.key === 'P') this.goPrev();
    });

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.goPrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.goNext());
      navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (d.seekTime != null) this.engine.seek(d.seekTime);
      });
    }
  }

  renderQueue() {
    const { items, index } = this.playlist.snapshot();
    this.els.queueCount.textContent = `${items.length} bài`;
    if (!items.length) {
      this.els.queueBody.innerHTML = `<div class="empty">Hàng đợi trống.<br/>Thêm nhạc hoặc kéo thả tệp.</div>`;
      return;
    }
    this.els.queueBody.innerHTML = `<ul class="playlist">${items
      .map((t, i) => {
        const fav = this.favorites.has(t.filename) ? ' ♥' : '';
        return `<li class="${i === index ? 'active' : ''}" data-id="${t.id}">
          <span class="idx">${String(i + 1).padStart(2, '0')}</span>
          <div>
            <div class="name">${escapeHtml(t.name)}${fav}</div>
            <div class="meta">${extOf(t.filename).toUpperCase()} · ${formatBytes(t.size)}</div>
          </div>
          <button class="rm" data-rm="${t.id}" type="button">${icons.close}</button>
        </li>`;
      })
      .join('')}</ul>`;

    this.els.queueBody.querySelectorAll('li').forEach((li) => {
      li.onclick = (e) => {
        if (e.target.closest('[data-rm]')) return;
        this.playTrack(this.playlist.select(li.dataset.id));
      };
    });
    this.els.queueBody.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.playlist.remove(btn.dataset.rm);
      };
    });
  }

  renderStudio() {
    const body = this.els.studioBody;
    if (this.sideTab === 'sound') {
      this.engine.ensureCtx().catch(() => {});
      const pure = !!this.settings.pure;
      const hp = HEADPHONE_PRESETS[this.settings.headphone] || HEADPHONE_PRESETS.flat;
      const gains = pure
        ? EQ_PRESETS.flat
        : this.engine.eqFilters?.length
          ? this.engine.getEqGains()
          : hp.gains;
      const freqs = EQ_FREQS;
      body.innerHTML = `
        <div class="stack">
          <div class="pure-card ${pure ? 'on' : ''}">
            <div>
              <strong>Pure / Direct</strong>
              <p>Tắt EQ · crossfeed · loudness · limiter — đường ngắn nhất trên web.</p>
            </div>
            <button type="button" class="btn ${pure ? 'btn-primary' : ''}" id="pure-toggle">${pure ? 'On' : 'Off'}</button>
          </div>
          <div class="dsp-block ${pure ? 'is-disabled' : ''}">
            <div class="field">
              <label class="lbl">Headphone EQ</label>
              <div class="eq-presets">
                ${Object.entries(HEADPHONE_PRESETS)
                  .map(
                    ([id, p]) =>
                      `<button type="button" class="chip ${this.settings.headphone === id ? 'active' : ''}" data-hp="${id}" title="${p.note}">${p.label}</button>`,
                  )
                  .join('')}
              </div>
              <p class="hint" id="hp-note">${hp.note} · xấp xỉ, không thay đo cá nhân</p>
            </div>
            <div class="field">
              <label class="lbl">Tone presets</label>
              <div class="eq-presets">
                ${Object.keys(EQ_PRESETS)
                  .map((k) => {
                    const on =
                      this.settings.headphone === 'flat' && this._eqPreset === k;
                    return `<button type="button" class="chip ${on ? 'active' : ''}" data-preset="${k}">${k}</button>`;
                  })
                  .join('')}
              </div>
            </div>
            <div class="eq-bands">
              ${freqs
                .map(
                  (f, i) => `
                <div class="eq-band">
                  <input type="range" min="-12" max="12" step="0.5" value="${gains[i] || 0}" data-band="${i}" ${pure ? 'disabled' : ''}/>
                  <span>${f >= 1000 ? f / 1000 + 'k' : f}</span>
                </div>`,
                )
                .join('')}
            </div>
            <div class="field">
              <label class="lbl">Crossfade</label>
              <div class="row">
                <input type="range" id="cf" min="0" max="8" step="0.5" value="${this.settings.crossfade}" />
                <span class="val" id="cf-v">${Number(this.settings.crossfade).toFixed(1)}s</span>
              </div>
            </div>
            <div class="field">
              <label class="lbl">Bauer crossfeed</label>
              <div class="row">
                <input type="range" id="xf" min="0" max="100" value="${Math.round((this.settings.crossfeed || 0) * 100)}" ${pure ? 'disabled' : ''}/>
                <span class="val" id="xf-v">${Math.round((this.settings.crossfeed || 0) * 100)}%</span>
              </div>
              <p class="hint">LP ~700 Hz + delay 0.32 ms — headphone bớt mệt, sân khấu tự nhiên hơn</p>
            </div>
            <div class="field">
              <label class="lbl">Balance</label>
              <div class="row">
                <input type="range" id="bal" min="-100" max="100" value="${Math.round((this.settings.balance || 0) * 100)}" />
                <span class="val" id="bal-v">${Math.round((this.settings.balance || 0) * 100)}</span>
              </div>
            </div>
            <label class="check"><input type="checkbox" id="norm" ${this.settings.loudnessNorm ? 'checked' : ''} ${pure ? 'disabled' : ''}/> Loudness normalize (LUFS / BS.1770 → −14)</label>
            <label class="check"><input type="checkbox" id="lim" ${this.settings.limiter ? 'checked' : ''} ${pure ? 'disabled' : ''}/> Soft limiter</label>
          </div>
        </div>`;

      body.querySelector('#pure-toggle').onclick = () => this.setPure(!this.settings.pure);

      body.querySelectorAll('[data-hp]').forEach((btn) => {
        btn.onclick = async () => {
          if (this.settings.pure) return this.toast('Tắt Pure để dùng EQ tai nghe');
          await this.engine.ensureCtx();
          this.settings.headphone = btn.dataset.hp;
          this._eqPreset = btn.dataset.hp;
          this.engine.applyEqGains(HEADPHONE_PRESETS[btn.dataset.hp].gains);
          this.saveSettings();
          this.renderStudio();
          this.toast(HEADPHONE_PRESETS[btn.dataset.hp].label);
        };
      });

      body.querySelector('#cf').oninput = (e) => {
        this.settings.crossfade = +e.target.value;
        this.engine.setCrossfade(this.settings.crossfade);
        body.querySelector('#cf-v').textContent = `${this.settings.crossfade.toFixed(1)}s`;
        this.saveSettings();
      };
      body.querySelector('#xf').oninput = (e) => {
        this.settings.crossfeed = +e.target.value / 100;
        this.engine.setCrossfeed(this.settings.crossfeed);
        body.querySelector('#xf-v').textContent = `${e.target.value}%`;
        this.saveSettings();
      };
      body.querySelector('#bal').oninput = (e) => {
        this.settings.balance = +e.target.value / 100;
        this.engine.setBalance(this.settings.balance);
        body.querySelector('#bal-v').textContent = e.target.value;
        this.saveSettings();
      };
      body.querySelector('#norm').onchange = (e) => {
        this.settings.loudnessNorm = e.target.checked;
        this.applyLoudness();
        this.saveSettings();
      };
      body.querySelector('#lim').onchange = (e) => {
        this.settings.limiter = e.target.checked;
        this.engine.setLimiter(this.settings.limiter);
        this.saveSettings();
      };
      body.querySelectorAll('[data-preset]').forEach((btn) => {
        btn.onclick = async () => {
          if (this.settings.pure) return this.toast('Tắt Pure để dùng tone EQ');
          await this.engine.ensureCtx();
          this.settings.headphone = 'flat';
          this._eqPreset = btn.dataset.preset;
          this.engine.applyEqPreset(this._eqPreset);
          this.saveSettings();
          this.renderStudio();
        };
      });
      body.querySelectorAll('[data-band]').forEach((input) => {
        input.oninput = async () => {
          if (this.settings.pure) return;
          await this.engine.ensureCtx();
          this._eqPreset = 'custom';
          this.settings.headphone = 'flat';
          this.engine.setEqBand(+input.dataset.band, +input.value);
          this.saveSettings();
        };
      });
    } else if (this.sideTab === 'lab') {
      const m = this.playlist.current?.meta;
      body.innerHTML = `
        <div class="stack">
          <canvas class="wave-mini" id="wave"></canvas>
          <div class="meters">
            <div class="meter"><label>Peak</label><strong id="m-peak">—</strong></div>
            <div class="meter"><label>RMS</label><strong id="m-rms">—</strong></div>
            <div class="meter"><label>BPM</label><strong id="m-bpm">${m?.bpm ?? '—'}</strong></div>
            <div class="meter"><label>${m?.loudUnit === 'LUFS' || Number.isFinite(m?.lufs) ? 'LUFS' : 'Loudness'}</label><strong id="m-lufs">${m && Number.isFinite(m.lufs) ? m.lufs.toFixed(1) : m && Number.isFinite(m.loud) ? m.loud.toFixed(1) : '—'} ${m?.loudUnit === 'LUFS' || Number.isFinite(m?.lufs) ? '' : m && Number.isFinite(m.loud) ? 'dB' : ''}</strong></div>
            <div class="meter"><label>Dynamic range</label><strong id="m-dr">${m?.dr != null ? m.dr.toFixed(1) + ' dB' : '—'}</strong></div>
            <div class="meter"><label>Channels</label><strong id="m-ch">${m?.channels ?? '—'}</strong></div>
          </div>
          <p class="hint">Lab hiển thị phân tích realtime + offline. Tắt trong System nếu máy yếu.</p>
        </div>`;
      this._labPeak = body.querySelector('#m-peak');
      this._labRms = body.querySelector('#m-rms');
      const wave = body.querySelector('#wave');
      if (wave) {
        this._waveViz = new Visualizer(this.root.querySelector('#spectrum'), wave);
        this._waveViz.setEnabled(true);
        if (this.peaks) {
          const mEl = this.engine.mediaElement;
          const p = mEl?.duration ? mEl.currentTime / mEl.duration : 0;
          this._waveViz.drawStaticPeaks(this.peaks, p);
        }
        wave.onclick = (e) => {
          const rect = wave.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const dur = this.engine.mediaElement?.duration || 0;
          if (dur) this.engine.seek(ratio * dur);
        };
      }
    } else {
      body.innerHTML = `
        <div class="stack">
          <div class="field">
            <label class="lbl">Hiệu năng</label>
            <div class="seg">
              <button type="button" data-perf="low">Thấp</button>
              <button type="button" data-perf="balanced">Cân bằng</button>
              <button type="button" data-perf="high">Cao</button>
            </div>
          </div>
          <label class="check"><input type="checkbox" id="viz-on" ${this.settings.viz !== false ? 'checked' : ''}/> Spectrum</label>
          <label class="check"><input type="checkbox" id="analyze-on" ${this.settings.analyze !== false ? 'checked' : ''}/> Phân tích BPM / DR khi mở bài</label>
          <div class="field">
            <label class="lbl">Giải mã trình duyệt</label>
            <div class="support-list" id="support"></div>
          </div>
          <p class="hint">FFT ${PERF_PRESETS[this.engine.perfMode].fftSize} · ${PERF_PRESETS[this.engine.perfMode].fps} fps · Space / ←→ / ↑↓ / N P</p>
        </div>`;
      body.querySelectorAll('[data-perf]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.perf === this.engine.perfMode);
        btn.onclick = () => {
          this.settings.perf = btn.dataset.perf;
          this.engine.setPerfMode(this.settings.perf);
          this.saveSettings();
          this.renderStudio();
          this.toast(`Hiệu năng: ${btn.textContent}`);
        };
      });
      body.querySelector('#viz-on').onchange = (e) => {
        this.settings.viz = e.target.checked;
        this.viz.setEnabled(e.target.checked);
        this.saveSettings();
      };
      body.querySelector('#analyze-on').onchange = (e) => {
        this.settings.analyze = e.target.checked;
        this.saveSettings();
      };
      const support = probeBrowserSupport();
      body.querySelector('#support').innerHTML = Object.entries(support)
        .map(
          ([k, v]) =>
            `<div><span>${k.toUpperCase()}</span><span class="badge ${v}">${v === 'full' ? 'OK' : v === 'partial' ? '?' : '—'}</span></div>`,
        )
        .join('');
    }
  }

  updateLiveMeters(a) {
    if (this._labPeak) this._labPeak.textContent = `${(a.peak * 100).toFixed(0)}%`;
    if (this._labRms) {
      const db = a.rms > 1e-6 ? (20 * Math.log10(a.rms)).toFixed(1) : '-∞';
      this._labRms.textContent = `${db} dB`;
    }
  }

  clearAll() {
    this.playlist.clear();
    this.engine.pause({ fade: false });
    this.playing = false;
    this.els.play.innerHTML = icons.play;
    this.els.hero.classList.remove('is-playing');
    this.els.title.textContent = 'Listening room';
    this.els.subtitle.textContent = 'Queue trống';
    this.els.tier.textContent = 'Ready';
    this.els.badge.textContent = 'Chọn bài để bắt đầu';
    this.peaks = null;
    this.viz.clear();
  }

  async addFiles(files) {
    const ok = files.filter(isLikelyAudio);
    if (!ok.length) return this.toast('Không có tệp audio hợp lệ');
    const before = this.playlist.items.length;
    this.playlist.addFiles(ok);
    this.toast(`+${ok.length} bài`);
    if (before === 0) await this.playTrack(this.playlist.current);
  }

  async togglePlay() {
    if (!this.playlist.current) return this.els.file.click();
    if (this.playing) {
      await this.engine.pause({ fade: true });
      this.playing = false;
      this.els.play.innerHTML = icons.play;
      this.els.hero.classList.remove('is-playing');
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else {
      try {
        await this.engine.play();
        this.playing = true;
        this.els.play.innerHTML = icons.pause;
        this.els.hero.classList.add('is-playing');
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      } catch (err) {
        this.toast(err.message || 'Không phát được');
      }
    }
  }

  goNext() {
    this._crossfading = false;
    const t = this.playlist.next();
    if (t) this.playTrack(t);
  }

  goPrev() {
    this._crossfading = false;
    const m = this.engine.mediaElement;
    if (m && m.currentTime > 3) {
      this.engine.seek(0);
      return;
    }
    const t = this.playlist.prev();
    if (t) this.playTrack(t);
  }

  onEnded() {
    if (this._crossfading || this._skipEnded) return;
    const next = this.playlist.next();
    if (next) this.playTrack(next, { fromEnded: true });
    else {
      this.playing = false;
      this.els.play.innerHTML = icons.play;
      this.els.hero.classList.remove('is-playing');
    }
  }

  maybeCrossfade() {
    const cf = this.engine.crossfadeSec;
    if (cf <= 0.05 || this._crossfading || this._skipEnded || !this.playing) return;
    const m = this.engine.mediaElement;
    if (!m?.duration || !Number.isFinite(m.duration)) return;
    if (m.duration - m.currentTime > cf + 0.15) return;
    const next = this.playlist.next();
    if (!next) return;
    this._crossfading = true;
    this._skipEnded = true;
    this.playTrack(next, { crossfade: cf }).finally(() => {
      this._crossfading = false;
      setTimeout(() => {
        this._skipEnded = false;
      }, (cf + 0.6) * 1000);
    });
  }

  async playTrack(track, opts = {}) {
    if (!track) return;
    this.els.title.textContent = track.name;
    this.els.subtitle.textContent = `${track.filename} · ${formatBytes(track.size)}`;
    this.els.fav.classList.toggle('active', this.favorites.has(track.filename));
    this.peaks = null;

    if (this.coverUrl?.startsWith('blob:')) URL.revokeObjectURL(this.coverUrl);
    this.coverUrl = coverDataUrl(track.name);
    this.els.cover.src = this.coverUrl;
    extractCoverFromFile(track.file).then((url) => {
      if (url && this.playlist.current?.id === track.id) {
        this.coverUrl = url;
        this.els.cover.src = url;
        this.updateMediaSession(track);
      }
    });

    try {
      const info = await this.engine.loadFile(track.file, { crossfade: opts.crossfade });
      this.els.tDur.textContent = formatTime(info.duration);

      // Graph vừa sẵn — gắn lại Pure / headphone EQ
      this.engine.setPureMode(!!this.settings.pure);
      if (!this.settings.pure) {
        this.applyHeadphoneOrEq();
        this.applyLoudness();
      }

      const q = qualityBadge({
        ext: extOf(track.filename),
        sampleRate: info.sampleRate,
      });
      this.els.tier.textContent = this.settings.pure ? 'Pure' : q.tier;
      this.els.badge.textContent = q.label;

      await this.engine.play();
      this.playing = true;
      this.els.play.innerHTML = icons.pause;
      this.els.hero.classList.add('is-playing');
      this.updateMediaSession(track, info.duration);

      if (this.settings.analyze !== false) this.runAnalyze(track);
      else this.applyLoudness();
    } catch (err) {
      this.playing = false;
      this.els.play.innerHTML = icons.play;
      this.els.hero.classList.remove('is-playing');
      this.toast(err.message || 'Lỗi giải mã');
    }
    this.renderQueue();
  }

  async runAnalyze(track) {
    try {
      const meta = await analyzeTrack(this.engine, track.file, {
        lowPower: this.engine.perfMode === 'low',
      });
      track.meta = meta;
      this.peaks = meta.peaks;
      if (this.playlist.current?.id !== track.id) return;

      const q = qualityBadge({
        ext: extOf(track.filename),
        sampleRate: meta.sampleRate,
        bitDepth: meta.bitDepth,
      });
      this.els.tier.textContent = q.tier;
      this.els.badge.textContent = q.label;
      this.applyLoudness();
      if (this.sideTab === 'lab') this.renderStudio();
    } catch {
      track.meta = track.meta || {};
      this.applyLoudness();
    }
  }

  applyLoudness() {
    if (this.settings.pure || !this.settings.loudnessNorm) {
      this.engine.setLoudnessGainDb(0);
      return;
    }
    const meta = this.playlist.current?.meta;
    const measured = Number.isFinite(meta?.lufs) ? meta.lufs : meta?.loud;
    this.engine.setLoudnessGainDb(lufsNormGainDb(measured, -14));
  }

  toggleFav() {
    const t = this.playlist.current;
    if (!t) return;
    if (this.favorites.has(t.filename)) this.favorites.delete(t.filename);
    else this.favorites.add(t.filename);
    localStorage.setItem('aura-favs', JSON.stringify([...this.favorites]));
    this.els.fav.classList.toggle('active', this.favorites.has(t.filename));
    this.renderQueue();
  }

  cycleSleep() {
    const steps = [0, 15, 30, 45, 60];
    const cur = this._sleepMinutes || 0;
    const next = steps[(steps.indexOf(cur) + 1) % steps.length];
    this._sleepMinutes = next;
    clearInterval(this.sleepTimer);
    this.els.sleep.classList.toggle('active', next > 0);
    if (!next) {
      this.toast('Sleep timer off');
      return;
    }
    this.sleepLeft = next * 60;
    this.toast(`Sleep ${next} phút`);
    this.sleepTimer = setInterval(() => {
      this.sleepLeft -= 1;
      if (this.sleepLeft <= 0) {
        clearInterval(this.sleepTimer);
        this.els.sleep.classList.remove('active');
        this._sleepMinutes = 0;
        this.engine.fadeToSilence(8).then(() => {
          this.playing = false;
          this.els.play.innerHTML = icons.play;
          this.els.hero.classList.remove('is-playing');
          this.toast('Good night');
        });
      }
    }, 1000);
  }

  updateMediaSession(track, duration) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artist: 'Aura Player',
      album: extOf(track.filename).toUpperCase(),
      artwork: this.coverUrl
        ? [{ src: this.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    });
    if (duration) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: this.engine.mediaElement?.currentTime || 0,
        });
      } catch {
        /* unsupported */
      }
    }
  }

  onTime() {
    const m = this.engine.mediaElement;
    if (!m?.duration) return;
    this.els.tCur.textContent = formatTime(m.currentTime);
    this.els.tDur.textContent = formatTime(m.duration);
    if (document.activeElement !== this.els.seek) {
      this.els.seek.value = String(Math.round((m.currentTime / m.duration) * 1000));
    }
    if (this._waveViz && this.peaks) {
      this._waveViz.drawStaticPeaks(this.peaks, m.currentTime / m.duration);
    }
  }

  toast(msg) {
    this.els.toast.textContent = msg;
    this.els.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.els.toast.classList.remove('show'), 2200);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
