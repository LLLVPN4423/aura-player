# Aura Player — Project Context

> **Bắt buộc với mọi agent:** đọc file này *trước* khi làm việc; cập nhật file này *sau* mọi thay đổi có ý nghĩa.  
> Rule Cursor: `.cursor/rules/context-protocol.mdc` (`alwaysApply: true`).  
> Mục tiêu: hiểu đúng dự án, tránh làm lại, tiết kiệm token và thời gian.

---

## 0. Protocol agent

| Khi | Việc |
|-----|------|
| Bắt đầu task | Đọc CONTEXT (ưu tiên hơn quét cả repo) |
| Xong task | Ghi thay đổi vào đúng mục + **Changelog** bên dưới |
| Không chắc | Tra CONTEXT trước; chỉ mở code khi cần chi tiết |

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
| Loudness normalize | `analysis/lufs.js` → preamp | Integrated LUFS gần BS.1770, target −14; clamp ±10 dB |
| Bauer crossfeed | LP 700 Hz + delay 0.32 ms L↔R | 0–100%; Pure = off |
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

### Fetch (yt-dlp)

- UI: nút **Fetch** → `DownloadPage.js`
- API: `serve.js` `/api/ytdlp/*` + thư mục `downloads/`
- Chỉ local (`node serve.js`); Pages không hỗ trợ
- Binary: PATH hoặc `bin/yt-dlp.exe`

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
| Fetch qua yt-dlp local | UI dán link; không chạy trên GitHub Pages |
| Rule luôn đọc/ghi CONTEXT | Tiết kiệm token; đồng bộ kiến thức giữa các agent |

---

## 12. Changelog

### 2026-11-06

- Pure mode + Headphone EQ presets
- LUFS (BS.1770-ish) normalize + Bauer crossfeed
- Deploy GitHub Pages + repo `LLLVPN4423/aura-player`
- **Fetch:** nút cạnh Thêm nhạc, `DownloadPage`, API `/api/ytdlp/*` trong `serve.js`, thư mục `downloads/`
- Rule `.cursor/rules/context-protocol.mdc`: mọi agent phải đọc/ghi CONTEXT

---

*Cập nhật file này khi thay đổi kiến trúc, design tokens, hoặc hợp đồng audio graph.*
