export class Playlist {
  constructor() {
    this.items = [];
    this.index = -1;
    this.shuffle = false;
    this.repeat = 'off'; // off | one | all
    this._order = [];
    this._listeners = new Set();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    this._listeners.forEach((fn) => fn(this.snapshot()));
  }

  snapshot() {
    return {
      items: this.items.slice(),
      index: this.index,
      current: this.current,
      shuffle: this.shuffle,
      repeat: this.repeat,
    };
  }

  get current() {
    return this.index >= 0 ? this.items[this.index] : null;
  }

  addFiles(files) {
    const added = [];
    for (const file of files) {
      const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`;
      const track = {
        id,
        file,
        name: file.name.replace(/\.[^.]+$/, ''),
        filename: file.name,
        size: file.size,
        type: file.type,
        meta: null,
      };
      this.items.push(track);
      added.push(track);
    }
    this._rebuildOrder();
    if (this.index < 0 && this.items.length) this.index = 0;
    this._notify();
    return added;
  }

  remove(id) {
    const i = this.items.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.items.splice(i, 1);
    if (this.index >= this.items.length) this.index = this.items.length - 1;
    if (!this.items.length) this.index = -1;
    else if (i < this.index) this.index -= 1;
    this._rebuildOrder();
    this._notify();
  }

  clear() {
    this.items = [];
    this.index = -1;
    this._order = [];
    this._notify();
  }

  select(id) {
    const i = this.items.findIndex((t) => t.id === id);
    if (i < 0) return null;
    this.index = i;
    this._notify();
    return this.current;
  }

  setShuffle(on) {
    this.shuffle = !!on;
    this._rebuildOrder();
    this._notify();
  }

  cycleRepeat() {
    this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
    this._notify();
    return this.repeat;
  }

  _rebuildOrder() {
    this._order = this.items.map((_, i) => i);
    if (this.shuffle) {
      for (let i = this._order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this._order[i], this._order[j]] = [this._order[j], this._order[i]];
      }
      // giữ bài đang phát ở đầu chuỗi shuffle
      if (this.index >= 0) {
        const pos = this._order.indexOf(this.index);
        if (pos > 0) {
          this._order.splice(pos, 1);
          this._order.unshift(this.index);
        }
      }
    }
  }

  next() {
    if (!this.items.length) return null;
    if (this.repeat === 'one') return this.current;
    const pos = this._order.indexOf(this.index);
    if (pos < this._order.length - 1) {
      this.index = this._order[pos + 1];
    } else if (this.repeat === 'all') {
      this._rebuildOrder();
      this.index = this._order[0];
    } else {
      return null;
    }
    this._notify();
    return this.current;
  }

  prev() {
    if (!this.items.length) return null;
    const pos = this._order.indexOf(this.index);
    if (pos > 0) this.index = this._order[pos - 1];
    else if (this.repeat === 'all') this.index = this._order[this._order.length - 1];
    this._notify();
    return this.current;
  }
}
