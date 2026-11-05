/**
 * Preset EQ tai nghe — xấp xỉ hướng Harman / AutoEQ (10 band khớp EQ_FREQS).
 * Không thay thế đo đạc cá nhân; mục tiêu: đỡ lệch tonal mặc định của từng model.
 *
 * Bands: 60, 170, 310, 600, 1k, 3k, 6k, 12k, 14k, 16k (dB)
 */

export const HEADPHONE_PRESETS = {
  flat: {
    label: 'Flat',
    note: 'Không chỉnh',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  'sony-wh1000xm5': {
    label: 'Sony WH-1000XM5',
    note: 'Bớt bass bloom, rõ mid',
    gains: [-4, -3, -1.5, 0, 1.5, 2, 1, 0.5, 0, -0.5],
  },
  'sony-wh1000xm4': {
    label: 'Sony WH-1000XM4',
    note: 'Giảm V-shape ANC',
    gains: [-3.5, -2.5, -1, 0.5, 1.5, 2, 1.5, 0, -0.5, -1],
  },
  'apple-airpods-pro': {
    label: 'AirPods Pro',
    note: 'Làm phẳng bass/treble',
    gains: [-2.5, -2, -0.5, 0.5, 1, 1.5, 0.5, -1, -1.5, -2],
  },
  'sennheiser-hd600': {
    label: 'Sennheiser HD 600',
    note: 'Gần trung tính, nâng nhẹ presence',
    gains: [1, 0.5, 0, 0, 0.5, 1.5, 1, 0.5, 0, 0],
  },
  'sennheiser-hd560s': {
    label: 'Sennheiser HD 560S',
    note: 'Làm ấm nhẹ, dịu treble',
    gains: [1.5, 1, 0.5, 0, 0, 0.5, -0.5, -1, -1.5, -2],
  },
  'beyer-dt770': {
    label: 'Beyerdynamic DT 770',
    note: 'Bớt peak cao, êm hơn',
    gains: [0, -1, -1.5, 0, 1, 0.5, -1, -3, -3.5, -4],
  },
  'ath-m50x': {
    label: 'Audio-Technica M50x',
    note: 'Giảm harsh upper-mid',
    gains: [-1, -0.5, 0, 0.5, 0, -1, -2.5, -2, -1.5, -1],
  },
  'hyperx-cloud': {
    label: 'HyperX Cloud',
    note: 'Bớt V-shape gaming',
    gains: [-3, -2, -0.5, 1, 1.5, 1, -0.5, -2, -2.5, -3],
  },
  'samsung-buds': {
    label: 'Samsung Buds',
    note: 'Cân bass, dịu 6–8k',
    gains: [-2, -1.5, 0, 0.5, 1, 1, -1, -1.5, -1, -0.5],
  },
};

export function headphoneIds() {
  return Object.keys(HEADPHONE_PRESETS);
}
