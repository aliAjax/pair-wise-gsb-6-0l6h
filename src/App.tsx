import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileCheck2,
  Lock,
  MinusCircle,
  PackagePlus,
  Plus,
  RefreshCw,
  Trash2,
  Type,
  XCircle,
} from 'lucide-react';
import {
  CheckItem,
  DeliverablePackage,
  FONT_CHOICES,
  NORMAL_RATIO,
  LARGE_RATIO,
  LARGE_PX,
  LARGE_BOLD_PX,
  Sample,
  Store,
  checkSample,
  evaluate,
  exportPayload,
  loadStore,
  normalizeHex,
  recheckPackage,
  saveStore,
  uid,
} from './lib/a11y';

export default function App() {
  const [store, setStore] = useState<Store>(loadStore);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'failing'>('all');

  useEffect(() => saveStore(store), [store]);

  const verdicts = useMemo(
    () => new Map(store.samples.map((s) => [s.id, evaluate(s)])),
    [store.samples],
  );

  const failing = store.samples.filter((s) => !verdicts.get(s.id)!.applicablePass);
  const confirmed = store.packages.filter((p) => p.status === 'confirmed');
  const pending = store.packages.filter((p) => p.status === 'pending');
  const visible = filter === 'failing' ? failing : store.samples;

  // ---------- 样例编辑 ----------

  const patchSample = (id: string, patch: Partial<Sample>) =>
    setStore((st) => ({
      ...st,
      samples: st.samples.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const addSample = () => {
    const s: Sample = {
      id: uid('s'),
      title: '新字体配对',
      category: 'Untitled',
      headingFont: FONT_CHOICES[0],
      bodyFont: FONT_CHOICES[1],
      fg: '#2c3a38',
      bg: '#f7f4ee',
      minSize: 16,
      bold: false,
    };
    setStore((st) => ({ ...st, samples: [...st.samples, s] }));
    setFilter('all');
  };

  const removeSample = (id: string) => {
    setStore((st) => ({ ...st, samples: st.samples.filter((s) => s.id !== id) }));
    setPicked((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
  };

  const togglePick = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // ---------- 交付包 ----------

  const createPackage = () => {
    const now = Date.now();
    const items = store.samples
      .filter((s) => picked.has(s.id))
      .map((s) => checkSample(s));
    const pkg: DeliverablePackage = {
      id: uid('pkg'),
      name: `交付包 ${now.toString().slice(-6)}`,
      createdAt: now,
      status: 'pending',
      lastCheckAt: now,
      confirmedAt: null,
      items,
    };
    setStore((st) => ({ ...st, packages: [...st.packages, pkg] }));
    setPicked(new Set());
    document
      .getElementById('to-fix')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const recheck = (id: string) =>
    setStore((st) => ({
      ...st,
      packages: st.packages.map((p) =>
        p.id === id ? recheckPackage(p, st.samples, Date.now()) : p,
      ),
    }));

  const confirmPkg = (id: string) =>
    setStore((st) => ({
      ...st,
      packages: st.packages.map((p) =>
        p.id === id && p.status === 'pending'
          ? { ...p, status: 'confirmed', confirmedAt: Date.now() }
          : p,
      ),
    }));

  const removePkgItem = (pkgId: string, sampleId: string) =>
    setStore((st) => ({
      ...st,
      packages: st.packages.map((p) =>
        p.id === pkgId ? { ...p, items: p.items.filter((i) => i.sampleId !== sampleId) } : p,
      ),
    }));

  const deletePkg = (id: string) =>
    setStore((st) => ({ ...st, packages: st.packages.filter((p) => p.id !== id) }));

  const renamePkg = (id: string, name: string) =>
    setStore((st) => ({
      ...st,
      packages: st.packages.map((p) => (p.id === id ? { ...p, name } : p)),
    }));

  const exportPkg = (pkg: DeliverablePackage) => {
    const blob = new Blob([JSON.stringify(exportPayload(pkg), null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${pkg.name.replace(/\s+/g, '-')}.json`;
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
            <b>Type A11y</b>
            <small>ACCESSIBLE PAIRINGS</small>
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <b>{store.samples.length}</b>
            <span>配对样例</span>
          </div>
          <div className="stat warn">
            <b>{failing.length}</b>
            <span>待修正</span>
          </div>
          <div className="stat ok">
            <b>{confirmed.length}</b>
            <span>已确认交付包</span>
          </div>
        </div>

        <div className="nav-section">
          <button
            className={filter === 'all' ? 'nav active' : 'nav'}
            onClick={() => setFilter('all')}
          >
            全部样例 <b>{store.samples.length}</b>
          </button>
          <button
            className={filter === 'failing' ? 'nav active' : 'nav'}
            onClick={() => setFilter('failing')}
          >
            <AlertTriangle size={15} />
            未达标样例 <b>{failing.length}</b>
          </button>
        </div>

        <div className="saved">
          <div className="saved-head">
            <span>交付包（{store.packages.length}）</span>
          </div>
          <div className="pkg-nav">
            {pending.map((p) => (
              <a key={p.id} href={`#pkg-${p.id}`} className="pkg-link pending-link">
                <RefreshCw size={12} />
                {p.name}
                <b>{p.items.filter((i) => !i.applicablePass).length || ''}</b>
              </a>
            ))}
            {confirmed.map((p) => (
              <a key={p.id} href={`#pkg-${p.id}`} className="pkg-link done-link">
                <CheckCircle2 size={12} />
                {p.name}
              </a>
            ))}
            {store.packages.length === 0 && (
              <p className="empty-note">勾选样例后可创建交付包</p>
            )}
          </div>
        </div>

        <div className="aside-foot">
          <div className="profile">
            <div className="avatar">YL</div>
            <div>
              <b>Yuki Lin</b>
              <small>编辑 · 设计评审前检查</small>
            </div>
          </div>
          <small className="save-note">✓ 数据保存在本机，关闭页面后仍可继续</small>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <div className="crumb">
              TYPE LIBRARY / <b>无障碍对比度交付</b>
            </div>
            <h1>把字体配对做成可交付的无障碍样例。</h1>
            <p>
              为每套配对补齐前景色、背景色与最小使用字号；系统按 WCAG 2.1 AA
              分别判定普通文字（≥{NORMAL_RATIO}:1）与大字（≥{LARGE_RATIO}:1）。
            </p>
          </div>
          <div className="actions">
            <button className="primary" onClick={addSample}>
              <Plus size={16} />
              新建样例
            </button>
          </div>
        </header>

        {/* 样例库 */}
        <section className="library">
          <div className="gallery-head">
            <div>
              <h2>配对样例库</h2>
              <span>
                {store.samples.length} 套 · {failing.length} 套待修正 ·{' '}
                {store.samples.length - failing.length} 套当前参数可交付
              </span>
            </div>
            <div className="bulk-bar">
              <label className="pick-all">
                <input
                  type="checkbox"
                  checked={
                    visible.length > 0 && visible.every((s) => picked.has(s.id))
                  }
                  onChange={() =>
                    setPicked((p) => {
                      const n = new Set(p);
                      const allOn = visible.every((s) => n.has(s.id));
                      visible.forEach((s) => (allOn ? n.delete(s.id) : n.add(s.id)));
                      return n;
                    })
                  }
                />
                全选当前列表
              </label>
              <button
                className="primary"
                disabled={picked.size === 0}
                onClick={createPackage}
              >
                <PackagePlus size={15} />
                生成交付包{picked.size ? `（${picked.size} 套）` : ''}
              </button>
            </div>
          </div>

          <div className="card-list">
            {visible.map((s) => {
              const v = verdicts.get(s.id)!;
              return (
                <SampleCard
                  key={s.id}
                  sample={s}
                  verdict={v}
                  picked={picked.has(s.id)}
                  onTogglePick={() => togglePick(s.id)}
                  onPatch={(patch) => patchSample(s.id, patch)}
                  onRemove={() => removeSample(s.id)}
                />
              );
            })}
            {visible.length === 0 && (
              <p className="empty-note big">没有未达标样例 —— 全部可交付。</p>
            )}
          </div>
        </section>

        {/* 待修正区 */}
        {(failing.length > 0 || pending.length > 0) && (
          <section id="to-fix" className="to-fix">
            <div className="section-head danger-head">
              <div>
                <h2>
                  <AlertTriangle size={18} />
                  待修正区
                </h2>
                <span>
                  未达标的样例留在这里，并标明差值与需要调到的目标；修正后只重算对应交付包，已确认的包不受影响。
                </span>
              </div>
            </div>

            {failing.length > 0 && (
              <div className="fix-groups">
                {failing.some(
                  (s) => !verdicts.get(s.id)!.normalPass && !verdicts.get(s.id)!.largePass,
                ) && (
                  <div className="fix-group">
                    <h3>
                      <XCircle size={14} />
                      普通文字与大字均不达标（须改颜色）
                    </h3>
                    {failing
                      .filter(
                        (s) =>
                          !verdicts.get(s.id)!.normalPass &&
                          !verdicts.get(s.id)!.largePass,
                      )
                      .map((s) => (
                        <FixRow
                          key={s.id}
                          sample={s}
                          onPatch={(patch) => patchSample(s.id, patch)}
                        />
                      ))}
                  </div>
                )}
                {failing.some((s) => {
                  const v = verdicts.get(s.id)!;
                  return v.largePass && !v.normalPass;
                }) && (
                  <div className="fix-group">
                    <h3>
                      <MinusCircle size={14} />
                      仅普通文字不达标（可改颜色，或把最小字号提到大字阈值）
                    </h3>
                    {failing
                      .filter((s) => {
                        const v = verdicts.get(s.id)!;
                        return v.largePass && !v.normalPass;
                      })
                      .map((s) => (
                        <FixRow
                          key={s.id}
                          sample={s}
                          onPatch={(patch) => patchSample(s.id, patch)}
                        />
                      ))}
                  </div>
                )}
              </div>
            )}

            {pending.map((pkg) => (
              <PendingPackageCard
                key={pkg.id}
                pkg={pkg}
                samples={store.samples}
                onRecheck={() => recheck(pkg.id)}
                onConfirm={() => confirmPkg(pkg.id)}
                onRemoveItem={(sid) => removePkgItem(pkg.id, sid)}
                onDelete={() => deletePkg(pkg.id)}
                onRename={(name) => renamePkg(pkg.id, name)}
              />
            ))}
          </section>
        )}

        {/* 已确认交付包（冻结快照） */}
        {confirmed.length > 0 && (
          <section className="confirmed">
            <div className="section-head">
              <div>
                <h2>
                  <FileCheck2 size={18} />
                  已确认交付包
                </h2>
                <span>
                  参数与判定已按确认时冻结；后续修改样例不会改变这些包，可随时导出配色、字号与判定。
                </span>
              </div>
            </div>
            {confirmed.map((pkg) => (
              <ConfirmedPackageCard key={pkg.id} pkg={pkg} onExport={() => exportPkg(pkg)} />
            ))}
          </section>
        )}

        <footer className="std-note">
          大字定义：常规字重 ≥{LARGE_PX}px（18pt），或粗体 ≥{LARGE_BOLD_PX}px（14pt）；以下按普通文字标准。
        </footer>
      </main>
    </div>
  );
}

/* ---------------- 样例卡片 ---------------- */

function SampleCard({
  sample,
  verdict,
  picked,
  onTogglePick,
  onPatch,
  onRemove,
}: {
  sample: Sample;
  verdict: ReturnType<typeof evaluate>;
  picked: boolean;
  onTogglePick: () => void;
  onPatch: (patch: Partial<Sample>) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(sample.title);
  useEffect(() => setTitle(sample.title), [sample.title]);

  return (
    <article className={picked ? 'pair picked' : 'pair'}>
      <div className="pair-top">
        <label className="pick-box" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={picked} onChange={onTogglePick} />
          纳入交付包
        </label>
        <button className="icon-btn danger" onClick={onRemove} title="删除样例">
          <Trash2 size={14} />
        </button>
      </div>

      <input
        className="title-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && onPatch({ title: title.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <input
        className="category-input"
        value={sample.category}
        onChange={(e) => onPatch({ category: e.target.value })}
      />

      <div className="swatch" style={{ background: sample.bg, color: sample.fg }}>
        <span
          className="swatch-heading"
          style={{
            fontFamily: sample.headingFont,
            fontSize: Math.max(13, Math.min(sample.minSize, 30)),
            fontWeight: sample.bold ? 700 : 500,
          }}
        >
          好字体，为阅读留出空间
        </span>
        <span className="swatch-body" style={{ fontFamily: sample.bodyFont }}>
          The quick brown fox · 配色与最小字号的真实预览
        </span>
      </div>

      <div className="field-row">
        <ColorField label="前景色" value={sample.fg} onChange={(fg) => onPatch({ fg })} />
        <ColorField label="背景色" value={sample.bg} onChange={(bg) => onPatch({ bg })} />
      </div>

      <div className="field-row three">
        <label className="mini-field">
          最小字号
          <span className="num-wrap">
            <input
              type="number"
              min={10}
              max={96}
              value={sample.minSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 10 && n <= 96) onPatch({ minSize: n });
              }}
            />
            px
          </span>
        </label>
        <div className="mini-field">
          字重
          <div className="seg">
            <button
              className={!sample.bold ? 'on' : ''}
              onClick={() => onPatch({ bold: false })}
            >
              常规
            </button>
            <button
              className={sample.bold ? 'on' : ''}
              onClick={() => onPatch({ bold: true })}
            >
              粗体
            </button>
          </div>
        </div>
      </div>

      <div className="field-row">
        <label className="mini-field grow">
          标题字体
          <select
            value={sample.headingFont}
            onChange={(e) => onPatch({ headingFont: e.target.value })}
          >
            {FONT_CHOICES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="mini-field grow">
          正文字体
          <select
            value={sample.bodyFont}
            onChange={(e) => onPatch({ bodyFont: e.target.value })}
          >
            {FONT_CHOICES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="verdict-row">
        <Badge
          label={`普通文字 ≥${NORMAL_RATIO}`}
          pass={verdict.normalPass}
          ratio={verdict.ratio}
          gap={verdict.normalGap}
        />
        <Badge
          label={`大字 ≥${LARGE_RATIO}`}
          pass={verdict.largePass}
          ratio={verdict.ratio}
          gap={verdict.largeGap}
        />
      </div>

      <div
        className={
          verdict.applicablePass ? 'applicable ok' : 'applicable bad'
        }
      >
        {verdict.applicablePass ? (
          <>
            <Check size={14} />
            当前最小字号 {sample.minSize}px（{verdict.isLarge ? '按大字标准' : '按普通文字标准'}）
            可交付
          </>
        ) : (
          <>
            <AlertTriangle size={14} />
            {sample.minSize}px
            {sample.bold ? ' 粗体' : ''}按{verdict.isLarge ? '大字' : '普通文字'}标准须 ≥
            {verdict.required}:1，差 {verdict.isLarge ? verdict.largeGap : verdict.normalGap}
            ，见待修正区
          </>
        )}
      </div>
    </article>
  );
}

function Badge({
  label,
  pass,
  ratio,
  gap,
}: {
  label: string;
  pass: boolean;
  ratio: number;
  gap: number;
}) {
  return (
    <div className={pass ? 'badge pass' : 'badge fail'}>
      <span className="badge-label">{label}</span>
      <b>{ratio.toFixed(2)}:1</b>
      {!pass && <small>差 {gap.toFixed(2)}</small>}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange?: (hex: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const h = normalizeHex(text);
    if (h) onChange?.(h);
    else setText(value);
  };
  return (
    <label className="mini-field grow">
      {label}
      <span className="color-wrap">
        <input
          type="color"
          value={normalizeHex(value) ?? '#000000'}
          onChange={(e) => onChange?.(e.target.value)}
        />
        <input
          className="hex-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          spellCheck={false}
        />
      </span>
    </label>
  );
}

/* ---------------- 待修正行 ---------------- */

function FixRow({
  sample,
  onPatch,
}: {
  sample: Sample;
  onPatch: (patch: Partial<Sample>) => void;
}) {
  const v = evaluate(sample);
  return (
    <div className="fix-row">
      <div className="fix-main">
        <div className="fix-swatch" style={{ background: sample.bg }}>
          <span style={{ color: sample.fg }}>Aa 文字样例</span>
        </div>
        <div>
          <b>{sample.title}</b>
          <small>
            {sample.fg} / {sample.bg} · 最小 {sample.minSize}px{sample.bold ? ' 粗体' : ''} ·
            当前 {v.ratio.toFixed(2)}:1
          </small>
          <p className="gap-line">
            {!v.normalPass && (
              <span className="gap-tag fail">
                普通文字 {v.ratio.toFixed(2)}:1 → 目标 {NORMAL_RATIO}:1，差 {v.normalGap.toFixed(2)}
              </span>
            )}
            {!v.largePass && (
              <span className="gap-tag fail">
                大字 {v.ratio.toFixed(2)}:1 → 目标 {LARGE_RATIO}:1，差 {v.largeGap.toFixed(2)}
              </span>
            )}
            {v.largePass && !v.normalPass && (
              <span className="gap-tag warn">
                或提高最小字号到 ≥{sample.bold ? Math.ceil(LARGE_BOLD_PX) : LARGE_PX}px
                （按大字标准 ≥{LARGE_RATIO}:1，已达标）
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="fix-actions">
        {v.colorFix && (
          <button
            className="chip-fix"
            onClick={() => onPatch({ fg: v.colorFix!.hex })}
            title="保持色相，仅调暗/提亮前景色"
          >
            <i style={{ background: v.colorFix.hex }} />
            前景色调到 {v.colorFix.hex}（{v.colorFix.ratio.toFixed(2)}:1）
          </button>
        )}
        {v.sizeFix !== null && (
          <button className="chip-fix alt" onClick={() => onPatch({ minSize: v.sizeFix! })}>
            最小字号调到 {v.sizeFix}px
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- 待确认交付包 ---------------- */

type StaleInfo = { stale: boolean; missing: boolean };

function packageHealth(
  pkg: DeliverablePackage,
  samples: Sample[],
): { allPass: boolean } & StaleInfo {
  const map = new Map(samples.map((s) => [s.id, s]));
  let stale = false;
  let missing = false;
  for (const it of pkg.items) {
    const s = map.get(it.sampleId);
    if (!s) {
      missing = true;
      stale = true;
      continue;
    }
    if (s.fg !== it.fg || s.bg !== it.bg || s.minSize !== it.minSize || s.bold !== it.bold) {
      stale = true;
    }
  }
  return { allPass: pkg.items.length > 0 && pkg.items.every((i) => i.applicablePass), stale, missing };
}

function PendingPackageCard({
  pkg,
  samples,
  onRecheck,
  onConfirm,
  onRemoveItem,
  onDelete,
  onRename,
}: {
  pkg: DeliverablePackage;
  samples: Sample[];
  onRecheck: () => void;
  onConfirm: () => void;
  onRemoveItem: (sampleId: string) => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const health = packageHealth(pkg, samples);
  const failCount = pkg.items.filter((i) => !i.applicablePass).length;
  const canConfirm = health.allPass && !health.stale;
  const [name, setName] = useState(pkg.name);
  useEffect(() => setName(pkg.name), [pkg.name]);

  return (
    <article id={`pkg-${pkg.id}`} className="pkg-card pending-card">
      <div className="pkg-head">
        <div className="pkg-title-wrap">
          <input
            className="pkg-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== pkg.name && onRename(name.trim())}
          />
          <span className="pkg-meta">
            {pkg.items.length} 套 · 上次校验{' '}
            {pkg.lastCheckAt ? new Date(pkg.lastCheckAt).toLocaleString('zh-CN') : '—'}
          </span>
        </div>
        <div className="pkg-tools">
          <button className="outline" onClick={onRecheck}>
            <RefreshCw size={13} />
            只重算这批
          </button>
          <button className="outline danger-text" onClick={onDelete}>
            <Trash2 size={13} />
            丢弃
          </button>
        </div>
      </div>

      {health.stale && (
        <div className="banner warn-banner">
          <AlertTriangle size={14} />
          {health.missing
            ? '有样例已从库中删除，且部分参数可能已改动 —— 请重算后再确认。'
            : '参数在上次校验后有改动，结果已过期 —— 请只重算这批再确认。'}
        </div>
      )}

      <PkgItems items={pkg.items} onRemoveItem={onRemoveItem} frozen={false} />

      <div className="pkg-foot">
        {failCount > 0 ? (
          <span className="block-reason">
            <XCircle size={14} />
            仍有 {failCount} 项未达到适用对比度阈值，不能确认；修正后点“只重算这批”。
          </span>
        ) : health.stale ? (
          <span className="block-reason warn-text">
            <AlertTriangle size={14} />
            全部项目此前通过，但结果已过期，重算后即可确认。
          </span>
        ) : (
          <span className="ready-text">
            <CheckCircle2 size={14} />
            全部通过，可以确认并冻结参数与结果。
          </span>
        )}
        <button className="primary" disabled={!canConfirm} onClick={onConfirm}>
          <Check size={15} />
          确认交付包
        </button>
      </div>
    </article>
  );
}

function PkgItems({
  items,
  onRemoveItem,
  frozen,
}: {
  items: CheckItem[];
  onRemoveItem?: (sampleId: string) => void;
  frozen: boolean;
}) {
  return (
    <div className="pkg-items">
      <div className="pkg-items-head">
        <span>样例</span>
        <span>前景 / 背景</span>
        <span>最小字号</span>
        <span>普通文字</span>
        <span>大字</span>
        <span />
      </div>
      {items.map((it) => (
        <div
          key={it.sampleId}
          className={it.applicablePass ? 'pkg-item' : 'pkg-item bad'}
        >
          <span className="pi-title">
            <i className="pi-dot" style={{ background: it.fg, borderColor: it.bg }} />
            <span>
              <b>{it.missing ? `${it.title}（已删除）` : it.title}</b>
              <small>
                {it.headingFont} + {it.bodyFont}
              </small>
            </span>
          </span>
          <span className="mono">
            {it.fg} / {it.bg}
          </span>
          <span className="mono">
            {it.minSize}px{it.bold ? ' 粗' : ''}
          </span>
          <Pill pass={it.normalPass} text={`${it.ratio.toFixed(2)}:1`} gap={it.normalGap} />
          <Pill pass={it.largePass} text={`${it.ratio.toFixed(2)}:1`} gap={it.largeGap} />
          <span className="pi-action">
            {!frozen && (
              <button
                className="icon-btn"
                title="从该包移除"
                onClick={() => onRemoveItem?.(it.sampleId)}
              >
                <Trash2 size={13} />
              </button>
            )}
            {frozen && <Lock size={13} className="lock" />}
          </span>
        </div>
      ))}
      {items.length === 0 && <p className="empty-note">该交付包已无样例，请丢弃后重建。</p>}
    </div>
  );
}

function Pill({ pass, text, gap }: { pass: boolean; text: string; gap: number }) {
  return (
    <span className={pass ? 'pill pass' : 'pill fail'}>
      {pass ? <Check size={11} /> : <XCircle size={11} />}
      {text}
      {!pass && <em>差{gap.toFixed(2)}</em>}
    </span>
  );
}

/* ---------------- 已确认交付包 ---------------- */

function ConfirmedPackageCard({
  pkg,
  onExport,
}: {
  pkg: DeliverablePackage;
  onExport: () => void;
}) {
  return (
    <article id={`pkg-${pkg.id}`} className="pkg-card confirmed-card">
      <div className="pkg-head">
        <div className="pkg-title-wrap">
          <b className="confirmed-name">
            <Lock size={14} />
            {pkg.name}
          </b>
          <span className="pkg-meta">
            {pkg.items.length} 套 · 确认于{' '}
            {pkg.confirmedAt ? new Date(pkg.confirmedAt).toLocaleString('zh-CN') : '—'} ·
            参数与判定已冻结
          </span>
        </div>
        <div className="pkg-tools">
          <button className="primary" onClick={onExport}>
            <Download size={14} />
            导出配色 / 字号 / 判定（JSON）
          </button>
        </div>
      </div>
      <PkgItems items={pkg.items} frozen />
    </article>
  );
}
