import {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  Grid3X3,
  Package,
  PackagePlus,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react';

/* ---------------- 数据模型 ---------------- */

type Pair = {
  id: number;
  title: string;
  headingFont: string;
  bodyFont: string;
  fg: string; // 前景色
  bg: string; // 背景色
  minSize: number; // 最小使用字号 px
  bold: boolean; // 以粗体使用（影响大字判定）
  sampleHeading: string;
  sampleBody: string;
};

// 交付包条目：生成/重算时从配对快照而来，确认后不再变化
type PackItem = {
  pairId: number;
  title: string;
  headingFont: string;
  bodyFont: string;
  fg: string;
  bg: string;
  minSize: number;
  bold: boolean;
  ratio: number;
  target: number;
  isLarge: boolean;
  pass: boolean;
};

type Pack = {
  id: number;
  name: string;
  createdAt: number;
  status: 'draft' | 'confirmed';
  confirmedAt: number | null;
  items: PackItem[];
};

/* ---------------- WCAG 2.1 AA 对比度判定 ---------------- */

const NORMAL_TARGET = 4.5; // 普通文字
const LARGE_TARGET = 3; // 大字
const LARGE_PX = 24; // ≥24px 视为大字
const LARGE_BOLD_PX = 18.66; // ≥14pt(≈18.66px) 粗体视为大字

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function normalizeHex(input: string): string {
  const s = input.trim();
  if (!s) return s;
  return (s.startsWith('#') ? s : `#${s}`).toLowerCase();
}
function isValidHex(input: string): boolean {
  return HEX_RE.test(input.trim());
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function channelLum(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}
function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function largeEnough(minSize: number, bold: boolean): boolean {
  return minSize >= LARGE_PX || (bold && minSize >= LARGE_BOLD_PX);
}

type Verdict = {
  valid: boolean;
  ratio: number;
  target: number;
  isLarge: boolean;
  pass: boolean;
  gap: number; // 距达标还差多少
};

function judge(p: {fg: string; bg: string; minSize: number; bold: boolean}): Verdict {
  const isLarge = largeEnough(p.minSize, p.bold);
  const target = isLarge ? LARGE_TARGET : NORMAL_TARGET;
  if (!isValidHex(p.fg) || !isValidHex(p.bg)) {
    return {valid: false, ratio: 0, target, isLarge, pass: false, gap: target};
  }
  const ratio = contrastRatio(p.fg, p.bg);
  return {valid: true, ratio, target, isLarge, pass: ratio >= target, gap: Math.max(0, target - ratio)};
}

// 不达标时：把前景色向黑/白微调，给出能达标的最小改动建议
function suggestForeground(fg: string, bg: string, target: number): string | null {
  if (!isValidHex(fg) || !isValidHex(bg)) return null;
  const [r, g, b] = hexToRgb(fg);
  let best: {hex: string; step: number} | null = null;
  for (const [dr, dg, db] of [[0, 0, 0], [255, 255, 255]] as [number, number, number][]) {
    for (let step = 1; step <= 100; step++) {
      const t = step / 100;
      const mix = (c: number, d: number) => Math.round(c + (d - c) * t);
      const candidate = `#${[mix(r, dr), mix(g, dg), mix(b, db)]
        .map(v => v.toString(16).padStart(2, '0'))
        .join('')}`;
      if (contrastRatio(candidate, bg) >= target) {
        if (!best || step < best.step) best = {hex: candidate, step};
        break;
      }
    }
  }
  return best ? best.hex : null;
}

/* ---------------- 种子数据与持久化 ---------------- */

const FONTS = ['Fraunces', 'DM Sans', 'Space Grotesk', 'Newsreader', 'IBM Plex Sans', 'Playfair Display'];

const seedPairs: Pair[] = [
  {
    id: 1,
    title: '编辑的冷静',
    headingFont: 'Fraunces',
    bodyFont: 'DM Sans',
    fg: '#27363a',
    bg: '#f7f4ee',
    minSize: 16,
    bold: false,
    sampleHeading: '让文字慢下来',
    sampleBody: '好的排版为想法留出呼吸的空间。评审前，请确认每一组配对在最小字号下依然清晰可读。',
  },
  {
    id: 2,
    title: '工作室手记',
    headingFont: 'Space Grotesk',
    bodyFont: 'IBM Plex Sans',
    fg: '#8a7f6a',
    bg: '#f3efe9',
    minSize: 15,
    bold: false,
    sampleHeading: '为意外留出位置',
    sampleBody: '一组深思熟虑的配对能为最简洁的界面增添节奏。Try contrast in shape, not only size.',
  },
  {
    id: 3,
    title: '野外观测指南',
    headingFont: 'Playfair Display',
    bodyFont: 'Newsreader',
    fg: '#ffffff',
    bg: '#b37b57',
    minSize: 30,
    bold: false,
    sampleHeading: '小细节，长印象',
    sampleBody: 'Typography is the voice of a page. 字体的声音，决定了页面的气质。',
  },
  {
    id: 4,
    title: '夜间边注',
    headingFont: 'DM Sans',
    bodyFont: 'Space Grotesk',
    fg: '#d8e2dc',
    bg: '#27393b',
    minSize: 14,
    bold: false,
    sampleHeading: '在深色里保持清醒',
    sampleBody: '深色背景下，对比度往往比想象中掉得更快，务必实测后再交付。',
  },
  {
    id: 5,
    title: '边距低语',
    headingFont: 'Newsreader',
    bodyFont: 'DM Sans',
    fg: '#9aa5a1',
    bg: '#f7f7f4',
    minSize: 13,
    bold: false,
    sampleHeading: '浅灰不是安全色',
    sampleBody: '浅灰文字在浅色背景上常常不达标，是评审返工最常见的原因之一。',
  },
];

const LS = {pairs: 'a11y-pairs', packs: 'a11y-packs', selected: 'a11y-selected'};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});

function toPackItem(p: Pair): PackItem {
  const v = judge(p);
  return {
    pairId: p.id,
    title: p.title,
    headingFont: p.headingFont,
    bodyFont: p.bodyFont,
    fg: p.fg,
    bg: p.bg,
    minSize: p.minSize,
    bold: p.bold,
    ratio: Number(v.ratio.toFixed(2)),
    target: v.target,
    isLarge: v.isLarge,
    pass: v.pass,
  };
}

const go = (id: string) => document.getElementById(id)?.scrollIntoView({behavior: 'smooth', block: 'start'});

/* ---------------- 应用 ---------------- */

export default function App() {
  const [pairs, setPairs] = useState<Pair[]>(() => load(LS.pairs, seedPairs));
  const [packs, setPacks] = useState<Pack[]>(() => load(LS.packs, []));
  const [selected, setSelected] = useState<number[]>(() => load(LS.selected, []));
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  // 关掉页面再打开还能继续处理
  useEffect(() => localStorage.setItem(LS.pairs, JSON.stringify(pairs)), [pairs]);
  useEffect(() => localStorage.setItem(LS.packs, JSON.stringify(packs)), [packs]);
  useEffect(() => localStorage.setItem(LS.selected, JSON.stringify(selected)), [selected]);

  const judged = useMemo(() => {
    const m = new Map<number, Verdict>();
    pairs.forEach(p => m.set(p.id, judge(p)));
    return m;
  }, [pairs]);

  const failing = pairs.filter(p => !judged.get(p.id)!.pass);

  const updatePair = (id: number, patch: Partial<Pair>) =>
    setPairs(ps => ps.map(p => (p.id === id ? {...p, ...patch} : p)));

  const removePair = (id: number) => {
    setPairs(ps => ps.filter(p => p.id !== id));
    setSelected(s => s.filter(x => x !== id));
  };

  const toggleSelect = (id: number) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const createPair = () => {
    if (!newTitle.trim()) return;
    const id = Date.now();
    setPairs(ps => [
      ...ps,
      {
        id,
        title: newTitle.trim(),
        headingFont: 'Fraunces',
        bodyFont: 'DM Sans',
        fg: '#27363a',
        bg: '#ffffff',
        minSize: 16,
        bold: false,
        sampleHeading: '新的配对标题',
        sampleBody: '在这里放一句正文示例，用来检查这套配对在最小字号下的可读性。',
      },
    ]);
    setNewTitle('');
    setShowAdd(false);
  };

  // 勾选多套 → 生成交付包（草稿，允许含未达标项）
  const createPack = () => {
    const chosen = pairs.filter(p => selected.includes(p.id));
    if (!chosen.length) return;
    setPacks(ps => [
      ...ps,
      {
        id: Date.now(),
        name: `交付包 ${ps.length + 1}`,
        createdAt: Date.now(),
        status: 'draft',
        confirmedAt: null,
        items: chosen.map(toPackItem),
      },
    ]);
    setSelected([]);
    setTimeout(() => go('section-packs'), 60);
  };

  // 修正后只重算这一批；已确认的包不重算
  const recomputePack = (id: number) =>
    setPacks(ps =>
      ps.map(pk => {
        if (pk.id !== id || pk.status !== 'draft') return pk;
        const items = pk.items
          .map(it => pairs.find(p => p.id === it.pairId))
          .filter((p): p is Pair => Boolean(p))
          .map(toPackItem);
        return {...pk, items};
      }),
    );

  // 有任一项没通过就不能确认
  const confirmPack = (id: number) =>
    setPacks(ps =>
      ps.map(pk => {
        if (pk.id !== id || pk.status !== 'draft') return pk;
        if (!pk.items.length || pk.items.some(it => !it.pass)) return pk;
        return {...pk, status: 'confirmed', confirmedAt: Date.now()};
      }),
    );

  const removePack = (id: number) => setPacks(ps => ps.filter(pk => pk.id !== id));

  // 导出配色、字号与判定
  const exportPack = (pk: Pack) => {
    const data = {
      name: pk.name,
      standard: 'WCAG 2.1 AA（普通文字 ≥ 4.5:1；大字 ≥24px 或 ≥18.7px 粗体 ≥ 3:1）',
      status: pk.status === 'confirmed' ? '已确认' : '未确认（草稿）',
      createdAt: new Date(pk.createdAt).toISOString(),
      confirmedAt: pk.confirmedAt ? new Date(pk.confirmedAt).toISOString() : null,
      items: pk.items.map(it => ({
        title: it.title,
        headingFont: it.headingFont,
        bodyFont: it.bodyFont,
        foreground: it.fg,
        background: it.bg,
        minFontSizePx: it.minSize,
        bold: it.bold,
        textCategory: it.isLarge ? '大字' : '普通文字',
        contrastRatio: it.ratio,
        required: it.target,
        pass: it.pass,
      })),
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    a.download = `${pk.name}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="brand-mark">
            <Type size={18} />
          </div>
          <div>
            <b>Type Pairer</b>
            <small>无障碍交付</small>
          </div>
        </div>
        <div className="nav-section">
          <span>总览</span>
          <button className="nav" onClick={() => go('section-pairs')}>
            <Grid3X3 size={16} />
            全部配对 <b>{pairs.length}</b>
          </button>
          <button className="nav" onClick={() => go('section-fix')}>
            <AlertTriangle size={16} />
            待修正 <b className={failing.length ? 'warn-count' : ''}>{failing.length}</b>
          </button>
          <button className="nav" onClick={() => go('section-packs')}>
            <Package size={16} />
            交付包 <b>{packs.length}</b>
          </button>
        </div>
        <div className="standard">
          <span>判定标准 · WCAG 2.1 AA</span>
          <p>普通文字　对比度 ≥ 4.5 : 1</p>
          <p>大字（≥24px，或 ≥18.7px 粗体）≥ 3 : 1</p>
          <p className="dim">按每套的最小使用字号自动套用标准；未达标的配对会留在待修正区。</p>
        </div>
        <div className="aside-foot">
          <button className="nav">
            <Settings2 size={16} />
            偏好设置
          </button>
          <div className="profile">
            <div className="avatar">YL</div>
            <div>
              <b>Yuki Lin</b>
              <small>设计工作区</small>
            </div>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <div className="crumb">
              设计评审 / <b>无障碍交付样例</b>
            </div>
            <h1>字体配对对比度检查</h1>
            <p>为每套配对补齐前景色、背景色与最小使用字号，全部达标后勾选生成交付包。</p>
          </div>
          <div className="actions">
            <button className="outline" onClick={() => setShowAdd(true)}>
              <Plus size={15} />
              新建配对
            </button>
            <button className="primary" disabled={!selected.length} onClick={createPack}>
              <PackagePlus size={16} />
              生成交付包{selected.length ? `（${selected.length}）` : ''}
            </button>
          </div>
        </header>

        {/* ---------- 待修正区 ---------- */}
        {failing.length > 0 && (
          <section className="fix-zone" id="section-fix">
            <div className="fix-head">
              <AlertTriangle size={16} />
              <h2>待修正区</h2>
              <span>{failing.length} 套未达标，修正后才可能进入可确认的交付包</span>
            </div>
            {failing.map(p => {
              const v = judged.get(p.id)!;
              const sug = suggestForeground(p.fg, p.bg, v.target);
              return (
                <div className="fix-row" key={p.id}>
                  <span className="swatches">
                    <i className="sw" style={{background: p.fg}} />
                    <i className="sw" style={{background: p.bg}} />
                  </span>
                  <b>{p.title}</b>
                  <span>当前 {v.valid ? `${v.ratio.toFixed(2)} : 1` : '色值无效'}</span>
                  <span>
                    需调到 ≥ {v.target.toFixed(1)} : 1（{v.isLarge ? '大字' : '普通文字'}）
                  </span>
                  <span className="gap">差 {v.gap.toFixed(2)}</span>
                  {sug && (
                    <button className="suggest" onClick={() => updatePair(p.id, {fg: sug})}>
                      <Sparkles size={13} />
                      建议前景 {sug}
                      <i className="sw" style={{background: sug}} />
                      应用
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        )}
        {failing.length === 0 && pairs.length > 0 && (
          <div className="all-pass" id="section-fix">
            <Check size={14} />
            全部配对均已按各自最小字号达标，可以勾选生成交付包。
          </div>
        )}

        {/* ---------- 配对列表 ---------- */}
        <div className="section-head" id="section-pairs">
          <h2>配对列表</h2>
          <span>{pairs.length} 套 · 改动即时重新判定</span>
        </div>
        <div className="pair-grid">
          {pairs.map(p => {
            const v = judged.get(p.id)!;
            const validFg = isValidHex(p.fg);
            const validBg = isValidHex(p.bg);
            const previewSize = Math.max(11, Math.min(p.minSize, 18));
            return (
              <article key={p.id} className={`pair-card ${v.pass ? '' : 'failing'}`}>
                <div className="card-preview" style={{background: validBg ? p.bg : '#fff'}}>
                  <label className="pick">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                    选入交付包
                  </label>
                  <h3 style={{color: p.fg, fontFamily: p.headingFont}}>{p.sampleHeading}</h3>
                  <p style={{color: p.fg, fontFamily: p.bodyFont, fontSize: previewSize}}>{p.sampleBody}</p>
                </div>
                <div className="card-body">
                  <div className="card-title-row">
                    <input className="card-title" value={p.title} onChange={e => updatePair(p.id, {title: e.target.value})} />
                    <button className="icon-btn" title="删除配对" onClick={() => removePair(p.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="field-grid">
                    <label className="field">
                      标题字体
                      <select value={p.headingFont} onChange={e => updatePair(p.id, {headingFont: e.target.value})}>
                        {FONTS.map(f => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      正文字体
                      <select value={p.bodyFont} onChange={e => updatePair(p.id, {bodyFont: e.target.value})}>
                        {FONTS.map(f => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      前景色
                      <span className="color-field">
                        <input
                          type="color"
                          value={validFg ? normalizeHex(p.fg) : '#000000'}
                          onChange={e => updatePair(p.id, {fg: e.target.value})}
                        />
                        <input
                          className="hex"
                          maxLength={7}
                          value={p.fg}
                          onChange={e => updatePair(p.id, {fg: normalizeHex(e.target.value)})}
                        />
                      </span>
                    </label>
                    <label className="field">
                      背景色
                      <span className="color-field">
                        <input
                          type="color"
                          value={validBg ? normalizeHex(p.bg) : '#ffffff'}
                          onChange={e => updatePair(p.id, {bg: e.target.value})}
                        />
                        <input
                          className="hex"
                          maxLength={7}
                          value={p.bg}
                          onChange={e => updatePair(p.id, {bg: normalizeHex(e.target.value)})}
                        />
                      </span>
                    </label>
                    <label className="field">
                      最小使用字号
                      <span className="size-field">
                        <input
                          type="number"
                          min={10}
                          max={72}
                          value={p.minSize}
                          onChange={e =>
                            updatePair(p.id, {minSize: Math.max(1, Math.min(96, Number(e.target.value) || 0))})
                          }
                        />
                        <i>px</i>
                      </span>
                    </label>
                    <label className="field check-field">
                      <input
                        type="checkbox"
                        checked={p.bold}
                        onChange={e => updatePair(p.id, {bold: e.target.checked})}
                      />
                      以粗体使用（≥18.7px 可算大字）
                    </label>
                  </div>
                  {!v.valid ? (
                    <div className="verdict fail">
                      <span className="badge no">色值待补全</span>
                      <p className="applicable">请输入 6 位十六进制色值（如 #27363a）后再判定。</p>
                    </div>
                  ) : (
                    <div className={`verdict ${v.pass ? '' : 'fail'}`}>
                      <div className="ratio">
                        {v.ratio.toFixed(2)}
                        <small> : 1</small>
                      </div>
                      <div className="verdict-mid">
                        <div className="badges">
                          <span className={`badge ${v.ratio >= NORMAL_TARGET ? 'ok' : 'no'}`}>
                            普通文字 ≥4.5 {v.ratio >= NORMAL_TARGET ? '达标' : '未达标'}
                          </span>
                          <span className={`badge ${v.ratio >= LARGE_TARGET ? 'ok' : 'no'}`}>
                            大字 ≥3.0 {v.ratio >= LARGE_TARGET ? '达标' : '未达标'}
                          </span>
                        </div>
                        <p className="applicable">
                          按最小 {p.minSize}px{p.bold ? ' · 粗体' : ''} 判定为{v.isLarge ? '大字' : '普通文字'}，需 ≥{' '}
                          {v.target.toFixed(1)} : 1{v.pass ? '，已达标' : `，还差 ${v.gap.toFixed(2)}`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* ---------- 交付包 ---------- */}
        <div className="section-head" id="section-packs">
          <h2>交付包</h2>
          <span>任一项未达标都不能确认；已确认的包保留当时参数与结果</span>
        </div>
        {packs.length === 0 && (
          <div className="empty">
            <Package size={18} />
            还没有交付包。勾选上方配对，点击「生成交付包」。
          </div>
        )}
        {packs.map(pk => {
          const failCount = pk.items.filter(it => !it.pass).length;
          const allPass = pk.items.length > 0 && failCount === 0;
          const confirmed = pk.status === 'confirmed';
          return (
            <article key={pk.id} className={`pack ${confirmed ? 'confirmed' : ''}`}>
              <div className="pack-head">
                <div className="pack-title">
                  <b>{pk.name}</b>
                  <span>
                    生成于 {fmtTime(pk.createdAt)}
                    {confirmed && pk.confirmedAt ? ` · 确认于 ${fmtTime(pk.confirmedAt)}` : ''}
                  </span>
                </div>
                <span className={`pack-status ${confirmed ? 'ok' : allPass ? 'ready' : 'pending'}`}>
                  {confirmed ? '已确认 · 快照锁定' : allPass ? '全部达标 · 可确认' : `待修正 · ${failCount} 项未达标`}
                </span>
                <div className="pack-actions">
                  {!confirmed && (
                    <>
                      <button className="ghost" onClick={() => recomputePack(pk.id)} title="按当前配对参数重新计算本批">
                        <RefreshCw size={13} />
                        重算本批
                      </button>
                      <button
                        className="confirm"
                        disabled={!allPass}
                        title={allPass ? '确认后锁定本包参数与结果' : `还有 ${failCount} 项未达标，不能确认`}
                        onClick={() => confirmPack(pk.id)}>
                        <Check size={13} />
                        确认交付
                      </button>
                    </>
                  )}
                  <button className="ghost" onClick={() => exportPack(pk)}>
                    <Download size={13} />
                    导出
                  </button>
                  <button className="icon-btn" title="删除交付包" onClick={() => removePack(pk.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {!confirmed && failCount > 0 && (
                <div className="pack-warn">
                  有 {failCount} 项未达标：请在上方修正配对参数，然后点击「重算本批」；全部达标前无法确认。
                </div>
              )}
              {confirmed && <div className="pack-lock">已确认：以下为确认时的参数与判定快照，之后修改配对不影响本包。</div>}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>配对</th>
                      <th>配色（前景 / 背景）</th>
                      <th>最小字号</th>
                      <th>对比度</th>
                      <th>判定</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pk.items.map(it => (
                      <tr key={it.pairId} className={it.pass ? '' : 'fail'}>
                        <td>
                          {it.title}
                          <small>
                            {it.headingFont} / {it.bodyFont}
                          </small>
                        </td>
                        <td>
                          <span className="chip">
                            <i style={{background: it.fg}} />
                            {it.fg}
                          </span>
                          <span className="chip">
                            <i style={{background: it.bg}} />
                            {it.bg}
                          </span>
                        </td>
                        <td>
                          {it.minSize}px{it.bold ? ' · 粗体' : ''}
                        </td>
                        <td>{it.ratio.toFixed(2)} : 1</td>
                        <td>
                          <span className={`badge ${it.pass ? 'ok' : 'no'}`}>{it.pass ? '达标' : '未达标'}</span>
                          <small>
                            {it.isLarge ? '大字' : '普通文字'} ≥ {it.target.toFixed(1)} : 1
                            {it.pass ? '' : ` · 差 ${(it.target - it.ratio).toFixed(2)}`}
                          </small>
                        </td>
                      </tr>
                    ))}
                    {pk.items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="empty-cell">
                          本批配对均已删除，无可判定项。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
      </main>

      {showAdd && (
        <div className="backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>新建配对</h2>
            <label>
              配对名称
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="例如：安静的自信"
              />
            </label>
            <div className="modal-actions">
              <button className="outline" onClick={() => setShowAdd(false)}>
                取消
              </button>
              <button className="primary" onClick={createPair}>
                创建配对
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
