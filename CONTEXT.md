# Aura Player — Project Context

> File này là nguồn ngữ cảnh cho người và AI khi tiếp tục phát triển dự án.
> Đọc trước khi sửa UI, audio engine, hoặc thêm tính năng.

---

## 1. Dự án là gì

**Aura** — trình nghe nhạc web (PWA tĩnh, không bắt buộc npm build) theo phong cách **Premium Minimalist Hi‑Fi**.

Mục tiêu sản phẩm:

- Đầy đủ chức năng nghe nhạc hiện đại + audiophile
- Hỗ trợ nhiều định dạng (theo codec trình duyệt)
- Phân tích âm thanh chuyên nghiệp (Lab)
- Chạy tốt trên điện thoại / máy cấu hình thấp (3 mức hiệu năng)

Tham chiếu thiết kế: dCS Mosaic, Devialet companion, Volumio Nova, Auris, B&O / Naim (listening-first, emotion over technical clutter).

---

## 2. Repo & deploy

- GitHub: https://github.com/LLLVPN4423/aura-player
- Live (GitHub Pages): https://lllvpn4423.github.io/aura-player/
- Branch deploy: `main` → Pages path `/`

## 3. Cách chạy local

```powershell
node serve.js
```

- Desktop: `http://localhost:8765/`
- Mobile (cùng Wi‑Fi): IP in ra trong terminal
- Không mở bằng `file://` (ES modules cần HTTP)
- PWA: `manifest.webmanifest` + `sw.js`

Không dùng Vite/npm trong setup hiện tại (tránh phụ thuộc esbuild trên Windows). Giữ stack **vanilla ES modules**.

---

## 4. Cấu trúc thư mục

```
music/
├── index.html
├── serve.js / serve.ps1
├── sw.js
├── manifest.webmanifest
├── favicon.svg
├── CONTEXT.md          ← file này
├── README.md
└── src/
    ├── main.js
    ├── styles/main.css
    ├── player/
    │   ├── AudioEngine.js   # Web Audio graph, EQ, crossfade, crossfeed…
    │   ├── Playlist.js
    │   └── formats.js
    ├── analysis/
    │   ├── bpm.js
    │   └── metrics.js       # DR, loudness norm, quality badge
    └── ui/
        ├── App.js           # UI + orchestration
        ├── visualizer.js
        ├── cover.js         # artwork trừu tượng + ID3 APIC
        └── icons.js
```

---

## 5. Design system — Premium Minimalist Hi‑Fi

**Nguyên tắc**

1. Listening-first: hero = artwork + title + transport là **một composition**
2. Kỹ thuật (EQ, meters, codec) nằm trong **Studio** — không làm ồn viewport chính
3. Ít chrome, nhiều khoảng trống, chữ lớn rõ
4. Motion ít nhưng có chủ đích (rise, art scale khi playing)

**Tokens** (`src/styles/main.css`)

| Token | Giá trị | Vai trò |
|-------|---------|---------|
| `--bg` | `#0c0c0b` | Nền charcoal ấm |
| `--surface` | `#171715` | Panel |
| `--text` | `#f2efe8` | Chữ chính |
| `--muted` | `#8a8680` | Phụ |
| `--accent` / `--accent-2` | `#c4b396` / `#dfd2b8` | Champagne / brushed metal |
| Font | Manrope 400–700 | Geometric sans, không Inter/Roboto |

**Tránh**

- Purple-on-white / indigo glow “AI default”
- Warm cream + terracotta serif broadsheet
- Cards dày trong hero, pill cluster, stat strip ồn
- Dark mode tím + multi-layer neon shadow

**Layout**

- `#app` max ~1120px
- `.hero` 2 cột (art | player) → 1 cột trên mobile
- `.dock` = Queue + Studio (Sound / Lab / System)

---

## 6. Audio architecture

### Graph (tóm tắt)

```
mediaA → trackGainA ─┐
mediaB → trackGainB ─┴→ sum → crossfeed → EQ(10) → panner → preamp → limiter → master → analyser → destination
```

- **Dual `<audio>`** (`media-a` / `media-b`) cho crossfade
- `MediaElementSource` chỉ tạo **một lần / element**
- Master fade in/out khi play/pause
- Sleep timer: `fadeToSilence`

### Tính năng Hi‑Fi đã có

| Feature | Nơi xử lý | Ghi chú |
|---------|-----------|---------|
| Crossfade 0–8s | AudioEngine + App.maybeCrossfade | Dual path |
| Loudness normalize | metrics + preamp gain | Target ~−14 dB RMS thô |
| Headphone crossfeed | ChannelSplitter/Merger | 0–100% |
| Balance | StereoPanner | −1…1 |
| Soft limiter | DynamicsCompressor | Bật/tắt trong Sound |
| EQ 10 band + presets | BiquadFilter chain | flat/bass/vocal/acoustic/night/bright |
| Quality badge | metrics.qualityBadge | Lossy / Lossless / Hi‑Res |
| BPM / DR / peaks | analysis/* | Offline decode; có thể N/A với vài codec |
| Sleep timer | App.cycleSleep | 15/30/45/60 + fade |
| Favorites | localStorage `aura-favs` | |
| Settings | localStorage `aura-hifi-settings` | |
| Media Session | App.updateMediaSession | Lock screen |
| **Pure / Direct** | `AudioEngine.setPureMode` | Tắt EQ + crossfeed + loudness + limiter |
| **Headphone EQ** | `src/player/headphones.js` | Preset xấp xỉ theo model; không thay AutoEQ đo đạc |

**Khuyến nghị nghe trung thực:** bật **Pure**.  
**Khuyến nghị headphone lệch tonal:** tắt Pure → chọn Headphone EQ gần model của bạn.

### Hiệu năng

`PERF_PRESETS`: `low` | `balanced` | `high` — FFT size, FPS, số bar spectrum.  
Tự chọn mặc định theo `hardwareConcurrency` / `deviceMemory` / Save-Data.

---

## 7. Định dạng & giới hạn trình duyệt

Hỗ trợ theo `canPlayType`: MP3, WAV, FLAC, AAC, M4A, OGG, Opus, WebM, AIFF…  
WMA / codec cũ có thể fail.  
Một số file chỉ play qua media element, `decodeAudioData` fail → Lab hiện N/A (không crash).

---

## 8. UX / i18n

- UI tiếng Việt + vài nhãn Hi‑Fi tiếng Anh ngắn (Queue, Studio, Lab, Sound, System, Ready…)
- Toast ngắn, không modal dày
- Phím: Space, ←/→, ↑/↓, N/P
- Drag & drop file audio

---

## 9. Quy ước khi code tiếp

1. **Giữ vanilla** — đừng kéo React/Vite trừ khi user yêu cầu rõ
2. **Hero sạch** — tính năng mới ưu tiên tab Sound/Lab/System hoặc icon transport phụ
3. **Máy yếu trước** — mọi visual/analysis phải tôn trọng `perfMode` / có thể tắt
4. **Không phá dual-media contract** — crossfade phụ thuộc 2 element + 2 MediaElementSource
5. **Settings persist** qua `aura-hifi-settings`
6. **CSS variables** — màu/spacing mới đi vào `:root`, không hardcode rải rác
7. **Commit** chỉ khi user yêu cầu

---

## 10. Việc nên / không nên làm tiếp

**Nên (nếu user hỏi)**

- Gapless chặt hơn (preload buffer)
- Lyrics / metadata tags đầy đủ hơn
- Theme sáng (light listening room) song song dark hiện tại
- Playlist export/import JSON
- AutoEQ / headphone profile (nặng — cân nhắc perf)

**Không tự ý**

- Vi phạm bản quyền / rip stream
- Thêm tracking nặng
- Đổi sang purple/glow generic AI look
- Build tool phức tạp nếu không cần

---

## 11. Lịch sử quyết định ngắn

| Quyết định | Lý do |
|------------|--------|
| Bỏ Vite → static + `serve.js` | esbuild EFTYPE trên Windows user |
| Dual audio cho crossfade | MediaElement không crossfade 1 nguồn |
| Artwork hash + ID3 APIC | Không phụ thuộc CDN / thư viện nặng |
| Lab tách khỏi hero | Đúng tinh thần Hi‑Fi minimalist |

---

*Cập nhật file này khi thay đổi kiến trúc, design tokens, hoặc hợp đồng audio graph.*
