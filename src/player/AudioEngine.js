/**
 * AudioEngine — Hi-Fi path: EQ · Crossfeed · Balance · Limiter · Crossfade · Loudness
 * Tối ưu thiết bị yếu qua PERF_PRESETS
 */

export const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

export const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [6, 4, 2, 0, 0, 0, 0, 0, 0, 0],
  vocal: [-2, -1, 0, 2, 4, 3, 1, 0, 0, -1],
  acoustic: [3, 2, 0, 1, 2, 1, 2, 3, 2, 1],
  night: [2, 1, 0, -1, -2, -1, 0, 1, -2, -3],
  bright: [-1, 0, 0, 0, 1, 2, 3, 4, 3, 2],
};

export const PERF_PRESETS = {
  high: { fftSize: 2048, fps: 60, bars: 72, waveformPoints: 180 },
  balanced: { fftSize: 1024, fps: 30, bars: 48, waveformPoints: 96 },
  low: { fftSize: 512, fps: 15, bars: 28, waveformPoints: 48 },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.mediaA = null;
    this.mediaB = null;
    this.sourceA = null;
    this.sourceB = null;
    this.trackGainA = null;
    this.trackGainB = null;
    this.active = 'A';

    this.eqFilters = [];
    this.eqEnabled = true;
    this.crossfeed = null;
    this.crossfeedGain = null;
    this.panner = null;
    this.preamp = null;
    this.limiter = null;
    this.master = null;
    this.analyser = null;

    this.objectUrlA = null;
    this.objectUrlB = null;

    this.perfMode = 'balanced';
    this.userVolume = 0.85;
    this.loudnessGainDb = 0;
    this.crossfadeSec = 0;
    this.crossfeedAmount = 0;
    this.balance = 0;
    this.limiterOn = true;
    this.pureMode = false;
    this.fadeMs = 280;

    this._freqData = null;
    this._timeData = null;
    this._raf = 0;
    this._lastFrame = 0;
    this._listeners = new Map();
    this._eqInput = null;
    this._sum = null;
  }

  get mediaElement() {
    return this.active === 'A' ? this.mediaA : this.mediaB;
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this._listeners.get(event)?.delete(fn);
  }

  emit(event, payload) {
    this._listeners.get(event)?.forEach((fn) => fn(payload));
  }

  attachMedia(elA, elB) {
    this.mediaA = elA;
    this.mediaB = elB;
    for (const el of [elA, elB]) {
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      el.volume = 1;
    }
  }

  async ensureCtx() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'playback' });
      this._buildGraph();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  _buildGraph() {
    this.trackGainA = this.ctx.createGain();
    this.trackGainB = this.ctx.createGain();
    this.trackGainA.gain.value = 1;
    this.trackGainB.gain.value = 0;

    this._sum = this.ctx.createGain();
    this._sum.gain.value = 1;
    this.trackGainA.connect(this._sum);
    this.trackGainB.connect(this._sum);

    // Bauer-style crossfeed nhẹ cho headphone
    this.crossfeed = this.ctx.createChannelSplitter(2);
    this.crossfeedGain = this.ctx.createGain();
    this.crossfeedGain.gain.value = 0;
    const merge = this.ctx.createChannelMerger(2);
    const delayL = this.ctx.createDelay(0.001);
    const delayR = this.ctx.createDelay(0.001);
    delayL.delayTime.value = 0.0003;
    delayR.delayTime.value = 0.0003;

    this._sum.connect(this.crossfeed);
    this.crossfeed.connect(merge, 0, 0);
    this.crossfeed.connect(merge, 1, 1);
    this.crossfeed.connect(this.crossfeedGain, 0);
    this.crossfeed.connect(this.crossfeedGain, 1);
    this.crossfeedGain.connect(delayR);
    this.crossfeedGain.connect(delayL);
    delayR.connect(merge, 0, 1);
    delayL.connect(merge, 0, 0);

    this._postCross = this.ctx.createGain();
    merge.connect(this._postCross);

    this.eqFilters = EQ_FREQS.map((freq, i) => {
      const f = this.ctx.createBiquadFilter();
      f.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1.1;
      f.gain.value = 0;
      return f;
    });

    let node = this._postCross;
    this._eqInput = this.eqFilters[0];
    for (const f of this.eqFilters) {
      node.connect(f);
      node = f;
    }
    this._eqOut = node;

    this.panner = this.ctx.createStereoPanner();
    this.preamp = this.ctx.createGain();
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1.5;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.userVolume;
    this.analyser = this.ctx.createAnalyser();
    this._applyPerf();

    this._eqOut.connect(this.panner);
    this.panner.connect(this.preamp);
    this.preamp.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this._bypassLimiter = false;
  }

  _wireSources() {
    if (!this.sourceA && this.mediaA) {
      this.sourceA = this.ctx.createMediaElementSource(this.mediaA);
      this.sourceA.connect(this.trackGainA);
    }
    if (!this.sourceB && this.mediaB) {
      this.sourceB = this.ctx.createMediaElementSource(this.mediaB);
      this.sourceB.connect(this.trackGainB);
    }
  }

  _applyPerf() {
    const p = PERF_PRESETS[this.perfMode] || PERF_PRESETS.balanced;
    if (this.analyser) {
      this.analyser.fftSize = p.fftSize;
      this.analyser.smoothingTimeConstant = this.perfMode === 'low' ? 0.88 : 0.75;
      this._freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this._timeData = new Uint8Array(this.analyser.fftSize);
    }
    this._targetFrameMs = 1000 / p.fps;
    this._bars = p.bars;
    this._wavePoints = p.waveformPoints;
  }

  setPerfMode(mode) {
    this.perfMode = mode in PERF_PRESETS ? mode : 'balanced';
    this._applyPerf();
    this.emit('perf', this.perfMode);
  }

  async loadFile(file, { crossfade = null } = {}) {
    await this.ensureCtx();
    this._wireSources();

    const cf = crossfade ?? this.crossfadeSec;
    const useB = this.active === 'A';
    const nextSlot = useB ? 'B' : 'A';
    const nextMedia = nextSlot === 'A' ? this.mediaA : this.mediaB;
    const nextGain = nextSlot === 'A' ? this.trackGainA : this.trackGainB;
    const curGain = this.active === 'A' ? this.trackGainA : this.trackGainB;
    const urlKey = nextSlot === 'A' ? 'objectUrlA' : 'objectUrlB';

    if (this[urlKey]) URL.revokeObjectURL(this[urlKey]);
    this[urlKey] = URL.createObjectURL(file);
    nextMedia.src = this[urlKey];

    await new Promise((resolve, reject) => {
      const onMeta = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error(`Không giải mã được: ${file.name}`));
      };
      const cleanup = () => {
        nextMedia.removeEventListener('loadedmetadata', onMeta);
        nextMedia.removeEventListener('error', onErr);
      };
      nextMedia.addEventListener('loadedmetadata', onMeta);
      nextMedia.addEventListener('error', onErr);
      nextMedia.load();
    });

    const now = this.ctx.currentTime;
    if (cf > 0.05 && !this.mediaElement.paused && this.mediaElement.src) {
      nextGain.gain.cancelScheduledValues(now);
      curGain.gain.cancelScheduledValues(now);
      nextGain.gain.setValueAtTime(0, now);
      nextGain.gain.linearRampToValueAtTime(1, now + cf);
      curGain.gain.setValueAtTime(curGain.gain.value, now);
      curGain.gain.linearRampToValueAtTime(0, now + cf);
      await nextMedia.play();
      const prev = this.mediaElement;
      setTimeout(() => {
        try {
          prev.pause();
          prev.removeAttribute('src');
          prev.load();
        } catch {
          /* */
        }
      }, cf * 1000 + 50);
    } else {
      nextGain.gain.setValueAtTime(1, now);
      curGain.gain.setValueAtTime(0, now);
      try {
        const prev = this.mediaElement;
        if (prev && prev !== nextMedia) {
          prev.pause();
        }
      } catch {
        /* */
      }
    }

    this.active = nextSlot;
    return {
      duration: nextMedia.duration,
      sampleRate: this.ctx.sampleRate,
    };
  }

  async play() {
    await this.ensureCtx();
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0.0001, now);
    g.exponentialRampToValueAtTime(Math.max(0.0001, this._effectiveVolume()), now + this.fadeMs / 1000);
    await this.mediaElement.play();
    this._startAnalysisLoop();
  }

  async pause({ fade = true } = {}) {
    if (!this.mediaElement) return;
    if (fade && this.ctx) {
      const g = this.master.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, g.value), now);
      g.exponentialRampToValueAtTime(0.0001, now + this.fadeMs / 1000);
      await new Promise((r) => setTimeout(r, this.fadeMs));
    }
    this.mediaElement.pause();
  }

  seek(t) {
    if (this.mediaElement && Number.isFinite(t)) {
      this.mediaElement.currentTime = Math.max(0, Math.min(t, this.mediaElement.duration || t));
    }
  }

  _effectiveVolume() {
    const loudLin = Math.pow(10, this.loudnessGainDb / 20);
    return Math.max(0, Math.min(1.5, this.userVolume * loudLin));
  }

  setVolume(v) {
    this.userVolume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this._effectiveVolume(), this.ctx.currentTime, 0.02);
    }
  }

  setLoudnessGainDb(db) {
    if (this.pureMode) {
      this.loudnessGainDb = 0;
    } else {
      this.loudnessGainDb = Math.max(-18, Math.min(18, db));
    }
    this.setVolume(this.userVolume);
  }

  setCrossfade(sec) {
    this.crossfadeSec = Math.max(0, Math.min(12, sec));
  }

  setCrossfeed(amount) {
    this.crossfeedAmount = Math.max(0, Math.min(1, amount));
    const apply = this.pureMode ? 0 : this.crossfeedAmount;
    if (this.crossfeedGain) {
      this.crossfeedGain.gain.setTargetAtTime(apply * 0.45, this.ctx?.currentTime || 0, 0.05);
    }
  }

  setBalance(v) {
    this.balance = Math.max(-1, Math.min(1, v));
    if (this.panner) this.panner.pan.setTargetAtTime(this.balance, this.ctx?.currentTime || 0, 0.03);
  }

  setLimiter(on) {
    this.limiterOn = on;
    if (!this.limiter) return;
    const active = on && !this.pureMode;
    this.limiter.threshold.value = active ? -1.5 : 0;
    this.limiter.ratio.value = active ? 12 : 1;
  }

  /**
   * Pure / Direct — tắt EQ, crossfeed, loudness, limiter.
   * Volume + balance + crossfade vẫn giữ (không tô màu tonal).
   */
  setPureMode(on) {
    this.pureMode = !!on;
    if (this.pureMode) {
      this.applyEqGains(EQ_PRESETS.flat);
      if (this.crossfeedGain) {
        this.crossfeedGain.gain.setTargetAtTime(0, this.ctx?.currentTime || 0, 0.05);
      }
      this.loudnessGainDb = 0;
      this.setVolume(this.userVolume);
      if (this.limiter) {
        this.limiter.threshold.value = 0;
        this.limiter.ratio.value = 1;
      }
    } else {
      this.setCrossfeed(this.crossfeedAmount);
      this.setLimiter(this.limiterOn);
    }
    this.emit('pure', this.pureMode);
  }

  setEqBand(index, db) {
    if (this.pureMode) return;
    if (!this.eqFilters[index]) return;
    this.eqFilters[index].gain.value = Math.max(-12, Math.min(12, db));
  }

  setEqEnabled(on) {
    this.eqEnabled = on;
    if (!on) this.applyEqGains(EQ_PRESETS.flat);
  }

  applyEqGains(gains) {
    const list = gains || EQ_PRESETS.flat;
    list.forEach((g, i) => {
      if (!this.eqFilters[i]) return;
      this.eqFilters[i].gain.value = Math.max(-12, Math.min(12, g));
    });
  }

  applyEqPreset(name) {
    if (this.pureMode) return;
    this.applyEqGains(EQ_PRESETS[name] || EQ_PRESETS.flat);
  }

  resetEq() {
    this.applyEqGains(EQ_PRESETS.flat);
  }

  getEqFreqs() {
    return EQ_FREQS.slice();
  }

  getEqGains() {
    return this.eqFilters.map((f) => f.gain.value);
  }

  _startAnalysisLoop() {
    cancelAnimationFrame(this._raf);
    const tick = (now) => {
      this._raf = requestAnimationFrame(tick);
      if (!this.analyser || this.mediaElement?.paused) return;
      if (now - this._lastFrame < this._targetFrameMs) return;
      this._lastFrame = now;

      this.analyser.getByteFrequencyData(this._freqData);
      this.analyser.getByteTimeDomainData(this._timeData);

      let sumSq = 0;
      let peak = 0;
      const td = this._timeData;
      for (let i = 0; i < td.length; i++) {
        const v = (td[i] - 128) / 128;
        const a = Math.abs(v);
        if (a > peak) peak = a;
        sumSq += v * v;
      }

      this.emit('analysis', {
        frequency: this._freqData,
        timeDomain: this._timeData,
        peak,
        rms: Math.sqrt(sumSq / td.length),
        bars: this._bars,
        wavePoints: this._wavePoints,
        sampleRate: this.ctx.sampleRate,
        fftSize: this.analyser.fftSize,
      });
    };
    this._raf = requestAnimationFrame(tick);
  }

  stopAnalysis() {
    cancelAnimationFrame(this._raf);
  }

  async decodeFull(file) {
    await this.ensureCtx();
    const buf = await file.arrayBuffer();
    return this.ctx.decodeAudioData(buf.slice(0));
  }

  async fadeToSilence(durationSec) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.exponentialRampToValueAtTime(0.0001, now + Math.max(0.5, durationSec));
    await new Promise((r) => setTimeout(r, Math.max(0.5, durationSec) * 1000));
    this.mediaElement?.pause();
  }

  destroy() {
    this.stopAnalysis();
    this.mediaA?.pause();
    this.mediaB?.pause();
    if (this.objectUrlA) URL.revokeObjectURL(this.objectUrlA);
    if (this.objectUrlB) URL.revokeObjectURL(this.objectUrlB);
    this.ctx?.close();
    this.ctx = null;
  }
}
