// WCAG 2.1 AA 对比度计算、判定、修正建议与交付包数据层

export const NORMAL_RATIO = 4.5;
export const LARGE_RATIO = 3;
/** 大字字号阈值（px）：常规 24px（18pt），粗体 18.67px（14pt） */
export const LARGE_PX = 24;
export const LARGE_BOLD_PX = 18.67;
const EPS = 1e-6;

export type Sample = {
  id: string;
  title: string;
  category: string;
  headingFont: string;
  bodyFont: string;
  fg: string; // 前景色 #rrggbb
  bg: string; // 背景色 #rrggbb
  minSize: number; // 最小使用字号 px
  bold: boolean; // 最小字号处是否为粗体（影响大字阈值）
};

export type ColorSuggestion = { hex: string; ratio: number };

export type Verdict = {
  ratio: number;
  normalPass: boolean; // 普通文字 ≥4.5:1
  largePass: boolean; // 大字 ≥3:1
  isLarge: boolean; // 当前最小字号是否按大字标准
  required: number; // 当前最小字号适用阈值
  applicablePass: boolean; // 在声明的最小字号下是否可交付
  normalGap: number; // 距 4.5:1 的差值
  largeGap: number; // 距 3:1 的差值
  colorFix: ColorSuggestion | null; // 建议前景色（保持色相）
  sizeFix: number | null; // 建议最小字号（大字达标但普通文字不达标时）
};

/** 交付包内单项：确认前为“上次校验结果”，确认后即为冻结快照 */
export type CheckItem = {
  sampleId: string;
  title: string;
  category: string;
  headingFont: string;
  bodyFont: string;
  fg: string;
  bg: string;
  minSize: number;
  bold: boolean;
  ratio: number;
  normalPass: boolean;
  largePass: boolean;
  isLarge: boolean;
  required: number;
  applicablePass: boolean;
  normalGap: number;
  largeGap: number;
  missing: boolean; // 源样例已被删除
};

export type DeliverablePackage = {
  id: string;
  name: string;
  createdAt: number;
  status: 'pending' | 'confirmed';
  lastCheckAt: number | null;
  confirmedAt: number | null;
  items: CheckItem[];
};

export type Store = { samples: Sample[]; packages: DeliverablePackage[] };

// ---------- 颜色工具 ----------

export function normalizeHex(input: string): string | null {
  let s = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    s = s.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return '#' + s.toLowerCase();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = normalizeHex(hex);
  if (!h) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const c = (n: number) =>
    Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number) {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue2rgb(h + 1 / 3) * 255, g: hue2rgb(h) * 255, b: hue2rgb(h - 1 / 3) * 255 };
}

// ---------- WCAG 对比度 ----------

function channelLuminance(c: number) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function luminanceRgb({ r, g, b }: { r: number; g: number; b: number }) {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

export function contrastOf(fgHex: string, bgHex: string): number {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return 0;
  return contrastRgb(fg, bg);
}

function contrastRgb(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number },
) {
  const l1 = luminanceRgb(fg);
  const l2 = luminanceRgb(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function isLargeSize(minSize: number, bold: boolean) {
  return bold ? minSize >= LARGE_BOLD_PX : minSize >= LARGE_PX;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------- 判定与修正建议 ----------

/** 在保持色相/饱和度不变的前提下，沿明度找最接近当前色的达标前景色 */
export function suggestForeground(
  fgHex: string,
  bgHex: string,
  target = NORMAL_RATIO,
): ColorSuggestion | null {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return null;
  if (contrastRgb(fg, bg) + EPS >= target) return null;

  const { h, s, l } = rgbToHsl(fg);
  const passAt = (L: number) => contrastRgb(hslToRgb(h, s, L), bg) >= target - EPS;
  const candidates: number[] = [];

  // 向深色方向：求仍能达标的最大明度
  if (passAt(0)) {
    let lo = 0;
    let hi = l;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (passAt(mid)) lo = mid;
      else hi = mid;
    }
    candidates.push(lo);
  }
  // 向浅色方向：求仍能达标的最小明度
  if (passAt(1)) {
    let lo = l;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (passAt(mid)) hi = mid;
      else lo = mid;
    }
    candidates.push(hi);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Math.abs(a - l) - Math.abs(b - l));
  const rgb = hslToRgb(h, s, candidates[0]);
  return { hex: rgbToHex(rgb), ratio: round2(contrastRgb(rgb, bg)) };
}

export function evaluate(sample: Pick<Sample, 'fg' | 'bg' | 'minSize' | 'bold'>): Verdict {
  const ratio = contrastOf(sample.fg, sample.bg);
  const isLarge = isLargeSize(sample.minSize, sample.bold);
  const required = isLarge ? LARGE_RATIO : NORMAL_RATIO;
  const normalPass = ratio + EPS >= NORMAL_RATIO;
  const largePass = ratio + EPS >= LARGE_RATIO;
  return {
    ratio: round2(ratio),
    normalPass,
    largePass,
    isLarge,
    required,
    applicablePass: ratio + EPS >= required,
    normalGap: round2(Math.max(0, NORMAL_RATIO - ratio)),
    largeGap: round2(Math.max(0, LARGE_RATIO - ratio)),
    colorFix: normalPass ? null : suggestForeground(sample.fg, sample.bg, NORMAL_RATIO),
    // 大字标准已过、普通文字不过：可通过提高最小字号解决
    sizeFix: !isLarge && largePass && !normalPass ? (sample.bold ? 19 : LARGE_PX) : null,
  };
}

export function checkSample(sample: Sample): CheckItem {
  const v = evaluate(sample);
  return {
    sampleId: sample.id,
    title: sample.title,
    category: sample.category,
    headingFont: sample.headingFont,
    bodyFont: sample.bodyFont,
    fg: sample.fg,
    bg: sample.bg,
    minSize: sample.minSize,
    bold: sample.bold,
    ratio: v.ratio,
    normalPass: v.normalPass,
    largePass: v.largePass,
    isLarge: v.isLarge,
    required: v.required,
    applicablePass: v.applicablePass,
    normalGap: v.normalGap,
    largeGap: v.largeGap,
    missing: false,
  };
}

/** 待修正包：仅重算这一批；源样例已删除则标记 missing */
export function recheckPackage(
  pkg: DeliverablePackage,
  samples: Sample[],
  now: number,
): DeliverablePackage {
  const map = new Map(samples.map((s) => [s.id, s]));
  return {
    ...pkg,
    lastCheckAt: now,
    items: pkg.items.map((it) => {
      const s = map.get(it.sampleId);
      if (!s) return { ...it, missing: true, applicablePass: false };
      return checkSample(s);
    }),
  };
}

export const STANDARD_NOTE =
  'WCAG 2.1 AA：普通文字（<24px，或粗体<18.67px）对比度 ≥4.5:1；大字（≥24px，或≥18.67px 粗体）≥3:1';

export function exportPayload(pkg: DeliverablePackage) {
  return {
    交付包: pkg.name,
    状态: pkg.status === 'confirmed' ? '已确认（参数与结果已冻结）' : '待修正（未确认）',
    标准: STANDARD_NOTE,
    生成时间: new Date(pkg.createdAt).toLocaleString('zh-CN'),
    确认时间: pkg.confirmedAt ? new Date(pkg.confirmedAt).toLocaleString('zh-CN') : null,
    上次校验时间: pkg.lastCheckAt ? new Date(pkg.lastCheckAt).toLocaleString('zh-CN') : null,
    导出时间: new Date().toLocaleString('zh-CN'),
    样例: pkg.items.map((it) => ({
      名称: it.title,
      分类: it.category,
      标题字体: it.headingFont,
      正文字体: it.bodyFont,
      前景色: it.fg,
      背景色: it.bg,
      最小字号px: it.minSize,
      最小字号pt: round2(it.minSize * 0.75),
      字重: it.bold ? 700 : 400,
      对比度: `${it.ratio.toFixed(2)}:1`,
      判定: {
        普通文字_4_5: it.normalPass ? '通过' : `不通过（差 ${it.normalGap.toFixed(2)}）`,
        大字_3: it.largePass ? '通过' : `不通过（差 ${it.largeGap.toFixed(2)}）`,
        当前最小字号按: it.isLarge ? '大字标准 ≥3:1' : '普通文字标准 ≥4.5:1',
        达标: it.missing ? false : it.applicablePass,
        备注: it.missing ? '源样例已删除' : '',
      },
    })),
  };
}

// ---------- 持久化 ----------

const STORE_KEY = 'a11y-type-deliverables-v1';

export function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const FONT_CHOICES = ['Fraunces', 'DM Sans', 'Space Grotesk', 'Newsreader', 'IBM Plex Sans'];

export function seedSamples(): Sample[] {
  return [
    {
      id: 's1',
      title: 'Editorial calm',
      category: 'Editorial',
      headingFont: 'Fraunces',
      bodyFont: 'DM Sans',
      fg: '#22302e',
      bg: '#f6f2ea',
      minSize: 16,
      bold: false,
    },
    {
      id: 's2',
      title: 'Studio notes',
      category: 'Portfolio',
      headingFont: 'Space Grotesk',
      bodyFont: 'DM Sans',
      fg: '#b3a48f',
      bg: '#efe9df',
      minSize: 14,
      bold: false,
    },
    {
      id: 's3',
      title: 'Field guide',
      category: 'Brand',
      headingFont: 'Newsreader',
      bodyFont: 'DM Sans',
      fg: '#7d8f86',
      bg: '#ffffff',
      minSize: 15,
      bold: false,
    },
    {
      id: 's4',
      title: 'Poster voice',
      category: 'Brand',
      headingFont: 'Fraunces',
      bodyFont: 'Space Grotesk',
      fg: '#76888a',
      bg: '#ffffff',
      minSize: 26,
      bold: false,
    },
  ];
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (Array.isArray(parsed.samples) && Array.isArray(parsed.packages)) return parsed;
    }
  } catch {
    /* 损坏数据回落为种子 */
  }
  return { samples: seedSamples(), packages: [] };
}

export function saveStore(store: Store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* 存储不可用时静默 */
  }
}
