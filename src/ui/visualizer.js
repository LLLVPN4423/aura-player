/** Visualizer tối giản — spectrum dạng thanh mảnh + waveform overview */

export class Visualizer {
  constructor(spectrumCanvas, waveCanvas) {
    this.spectrum = spectrumCanvas;
    this.wave = waveCanvas;
    this.sCtx = spectrumCanvas.getContext('2d', { alpha: true });
    this.wCtx = waveCanvas?.getContext('2d', { alpha: true }) || null;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.enabled = true;
    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    if (spectrumCanvas.parentElement) this._ro.observe(spectrumCanvas.parentElement);
    if (waveCanvas?.parentElement) this._ro.observe(waveCanvas.parentElement);
  }

  _resize() {
    for (const c of [this.spectrum, this.wave].filter(Boolean)) {
      const rect = c.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * this._dpr));
      const h = Math.max(1, Math.floor(rect.height * this._dpr));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.clear();
  }

  clear() {
    this.sCtx.clearRect(0, 0, this.spectrum.width, this.spectrum.height);
    if (this.wCtx && this.wave) this.wCtx.clearRect(0, 0, this.wave.width, this.wave.height);
  }

  draw(analysis) {
    if (!this.enabled || !analysis) return;
    this._drawSpectrum(analysis);
  }

  _drawSpectrum({ frequency, bars }) {
    const ctx = this.sCtx;
    const w = this.spectrum.width;
    const h = this.spectrum.height;
    ctx.clearRect(0, 0, w, h);

    const n = Math.min(bars, frequency.length);
    const gap = Math.max(1.5 * this._dpr, 2);
    const barW = Math.max(1, (w - gap * (n - 1)) / n);
    const mid = h * 0.55;

    for (let i = 0; i < n; i++) {
      const idx = Math.floor((i / n) ** 1.35 * (frequency.length - 1));
      const v = frequency[idx] / 255;
      const bh = Math.max(this._dpr, v * h * 0.9);
      const x = i * (barW + gap);
      ctx.fillStyle = `rgba(196, 179, 150, ${0.18 + v * 0.55})`;
      ctx.fillRect(x, mid - bh * 0.55, barW, bh);
    }
  }

  drawStaticPeaks(peaks, progress = 0) {
    if (!this.wCtx || !this.wave || !peaks?.length) return;
    const ctx = this.wCtx;
    const w = this.wave.width;
    const h = this.wave.height;
    ctx.clearRect(0, 0, w, h);
    const mid = h / 2;
    const barW = w / peaks.length;
    const px = progress * w;

    for (let i = 0; i < peaks.length; i++) {
      const bh = Math.max(1, peaks[i] * mid * 0.92);
      const x = i * barW;
      ctx.fillStyle = x < px ? 'rgba(223, 210, 184, 0.85)' : 'rgba(138, 134, 128, 0.28)';
      ctx.fillRect(x, mid - bh, Math.max(1, barW * 0.65), bh * 2);
    }
  }

  destroy() {
    this._ro.disconnect();
  }
}
