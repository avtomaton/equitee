import { useState, useMemo } from 'react';
import MetricCard from './MetricCard.jsx';
import { fmt, fmtPeriod } from './uiHelpers.jsx';

// ── Small helpers ─────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ── Shared input components (mirrors EvaluatorView style) ─────────────────────

function NumInput({ label, value, onChange, prefix = '', suffix = '', min = 0, max, step = 1, help }) {
  return (
    <div className="eval-field">
      <label className="eval-label">{label}</label>
      {help && <span className="eval-help">{help}</span>}
      <div className="eval-input-wrap">
        {prefix && <span className="eval-affix">{prefix}</span>}
        <input
          type="number" className="eval-input"
          value={value} min={min} max={max} step={step}
          onChange={e => onChange(e.target.valueAsNumber || 0)}
        />
        {suffix && <span className="eval-affix eval-affix-right">{suffix}</span>}
      </div>
    </div>
  );
}

function SliderInput({ label, value, onChange, min, max, step = 1, format, help, cls = '' }) {
  const display = format ? format(value) : value;
  return (
    <div className="eval-slider-row">
      <div className="eval-slider-header">
        <span className="eval-slider-label">{label}</span>
        <span className={`eval-slider-val ${cls}`}>{display}</span>
      </div>
      {help && <span className="eval-help">{help}</span>}
      <input
        type="range" className="eval-slider"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <div className="eval-slider-range">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

// ── Result card row ───────────────────────────────────────────────────────────

function ResultRow({ label, value, cls = '', secondary, tooltip }) {
  return (
    <MetricCard
      label={label}
      primary={value}
      primaryCls={cls}
      secondary={secondary}
      tooltip={tooltip}
      style={{ flex: '1 1 160px', minWidth: 150 }}
    />
  );
}

// ── Main computation ──────────────────────────────────────────────────────────

function calcReno({
  currentPrice, plannedPrice, yearlyApprPct,
  monthlyExpenses, currentRent, newRent,
  renoCost, renoMonths,
}) {
  const rentLift      = newRent - currentRent;          // extra rent per month post-reno
  const missedRent    = renoMonths * currentRent;       // rent foregone during works
  const totalCost     = renoCost + missedRent;          // everything the renovation costs you

  // Immediate equity gain from uplift in market price
  const priceUplift   = Math.max(0, plannedPrice - currentPrice);

  // --- Pure payback (ignores market price change entirely) ---
  // How many months of extra rent to recover totalCost?
  const purePB = rentLift > 0
    ? renoMonths + totalCost / rentLift        // renoMonths until reno done, then recovery
    : null;

  // --- Appreciation-adjusted payback ---
  // The price uplift is an immediate paper gain at completion; subtract it from
  // what cash flow still needs to recover.
  const remainingAfterUplift = totalCost - priceUplift;
  let apprPB;
  if (priceUplift >= totalCost) {
    // Uplift covers everything — payback happens the moment reno finishes
    apprPB = renoMonths;
  } else if (rentLift > 0) {
    apprPB = renoMonths + remainingAfterUplift / rentLift;
  } else {
    apprPB = null;   // no rent lift and uplift insufficient
  }

  // --- Monthly numbers post-renovation ---
  const monthlyNOI       = newRent - monthlyExpenses;
  const yearlyAppr       = plannedPrice * yearlyApprPct / 100;
  const monthlyAppr      = yearlyAppr / 12;
  const monthlyGain      = monthlyNOI + monthlyAppr;     // cash flow + appreciation

  // --- Annualised ROI on renovation spend ---
  // If we recover the cost purely via cash-flow uplift, what annual return is that?
  const annualLift       = rentLift * 12;
  const renoROI          = renoCost > 0 ? annualLift / renoCost * 100 : null;

  // --- Breakeven on new NOI recovering initial renovation outlay ---
  // (uses combined gain for best-case view)
  const gainPayback = monthlyGain > 0 && totalCost > 0
    ? renoMonths + totalCost / monthlyGain
    : null;

  return {
    rentLift, missedRent, totalCost, priceUplift,
    purePB, apprPB, gainPayback,
    monthlyNOI, monthlyAppr, monthlyGain, annualLift, renoROI,
  };
}

// ── PB display helpers ────────────────────────────────────────────────────────

function pbDisplay(months) {
  if (months === null) return { val: '∞', cls: 'text-danger' };
  if (months <= 0)     return { val: 'Instant', cls: 'text-success' };
  const cls = months < 24 ? 'text-success' : months < 60 ? '' : 'text-danger';
  return { val: fmtPeriod(months), cls };
}

// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  currentPrice:  400_000,
  plannedPrice:  440_000,
  yearlyApprPct: 3,
  monthlyExpenses: 1_800,
  currentRent:   2_000,
  newRent:       2_400,
  renoCost:      30_000,
  renoMonths:    3,
};

export default function RenovationView() {
  const [inp, setInp] = useState(DEFAULTS);

  // Slider-adjusted values (overlaid on top of the base inputs)
  const [adj, setAdj] = useState({
    plannedPrice:  0,     // delta from inp.plannedPrice
    yearlyApprPct: 0,     // absolute override (0 = use inp value)
    newRent:       0,     // delta from inp.newRent
    renoCost:      0,     // delta from inp.renoCost
    renoMonths:    0,     // delta from inp.renoMonths (fractional)
  });

  const set    = (k, v) => setInp(p => ({ ...p, [k]: v }));
  const setAdj_ = (k, v) => setAdj(p => ({ ...p, [k]: v }));
  const resetAdj = () => setAdj({ plannedPrice: 0, yearlyApprPct: 0, newRent: 0, renoCost: 0, renoMonths: 0 });
  const adjActive = Object.values(adj).some(v => v !== 0);

  // Effective values (base + slider delta)
  const eff = useMemo(() => ({
    currentPrice:    inp.currentPrice,
    plannedPrice:    inp.plannedPrice  + adj.plannedPrice,
    yearlyApprPct:   adj.yearlyApprPct !== 0 ? adj.yearlyApprPct : inp.yearlyApprPct,
    monthlyExpenses: inp.monthlyExpenses,
    currentRent:     inp.currentRent,
    newRent:         inp.newRent       + adj.newRent,
    renoCost:        inp.renoCost      + adj.renoCost,
    renoMonths:      clamp(inp.renoMonths + adj.renoMonths, 0.5, 60),
  }), [inp, adj]);

  const m = useMemo(() => calcReno(eff), [eff]);

  const purePBD   = pbDisplay(m.purePB);
  const apprPBD   = pbDisplay(m.apprPB);
  const gainPBD   = pbDisplay(m.gainPayback);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Renovation Planner</h1>
          <p className="page-subtitle">Model renovation ROI, payback periods, and cash-flow impact</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px,420px) 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── Left column: inputs ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Property & Market */}
          <div className="detail-panel">
            <div className="detail-panel-title">🏡 Property &amp; Market</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem' }}>
              <NumInput label="Current market price"   value={inp.currentPrice}   onChange={v => set('currentPrice', v)}   prefix="$" step={5000} />
              <NumInput label="Planned market price"   value={inp.plannedPrice}   onChange={v => set('plannedPrice', v)}   prefix="$" step={5000}
                help="Expected value after renovation" />
              <NumInput label="Yearly appreciation"    value={inp.yearlyApprPct}  onChange={v => set('yearlyApprPct', v)}  suffix="%" step={0.25} min={-10} max={30}
                help="On the post-reno value" />
              <NumInput label="Monthly expenses"       value={inp.monthlyExpenses} onChange={v => set('monthlyExpenses', v)} prefix="$" step={50}
                help="Mortgage, fees, tax, insurance…" />
            </div>
          </div>

          {/* Rent */}
          <div className="detail-panel">
            <div className="detail-panel-title">💰 Rent</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem' }}>
              <NumInput label="Current rent"  value={inp.currentRent} onChange={v => set('currentRent', v)} prefix="$" suffix="/mo" step={50} />
              <NumInput label="New rent"      value={inp.newRent}     onChange={v => set('newRent', v)}     prefix="$" suffix="/mo" step={50}
                help="Expected rent after renovation" />
            </div>
          </div>

          {/* Renovation */}
          <div className="detail-panel">
            <div className="detail-panel-title">🔨 Renovation</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1rem' }}>
              <NumInput label="Renovation cost" value={inp.renoCost}   onChange={v => set('renoCost', v)}   prefix="$" step={1000} />
              <NumInput label="Renovation time" value={inp.renoMonths} onChange={v => set('renoMonths', v)} suffix="mo" step={0.5} min={0.5} max={60}
                help="Months the unit is unavailable" />
            </div>
            <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', borderRadius: '8px', background: 'var(--bg-tertiary)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Total renovation cost</strong>
              {' = renovation spend + missed rent during works'}
              <div style={{ marginTop: '0.35rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <span>Cost: <strong style={{ color: 'var(--text-primary)' }}>{fmt(eff.renoCost)}</strong></span>
                <span>Missed rent: <strong style={{ color: '#ef4444' }}>{fmt(m.missedRent)}</strong></span>
                <span>Total: <strong style={{ color: '#ef4444' }}>{fmt(m.totalCost)}</strong></span>
              </div>
            </div>
          </div>

        </div>

        {/* ── Right column: results + sliders ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Key results */}
          <div className="detail-panel">
            <div className="detail-panel-title">📊 Payback Analysis</div>

            {/* Rent lift callout */}
            {m.rentLift <= 0 && (
              <div style={{ padding: '0.7rem 1rem', borderRadius: '8px', marginBottom: '1rem',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                fontSize: '0.83rem', color: '#ef4444' }}>
                ⚠️ New rent is not higher than current rent — payback cannot be computed from cash flow alone.
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <ResultRow
                label="Pure Payback"
                value={purePBD.val}
                cls={purePBD.cls}
                secondary={m.rentLift > 0 ? `+${fmt(m.rentLift)}/mo rent lift` : undefined}
                tooltip={
                  'Time to recover total renovation cost (spend + missed rent)\n' +
                  'purely from the extra monthly rent — market value change not considered.\n\n' +
                  `Renovation cost:  ${fmt(eff.renoCost)}\n` +
                  `Missed rent:       ${fmt(m.missedRent)}\n` +
                  `Total cost:        ${fmt(m.totalCost)}\n` +
                  `Rent lift:        +${fmt(m.rentLift)}/mo`
                }
              />
              <ResultRow
                label="With Appreciation"
                value={apprPBD.val}
                cls={apprPBD.cls}
                secondary={m.priceUplift > 0 ? `${fmt(m.priceUplift)} price uplift` : 'No uplift'}
                tooltip={
                  'Same cost, but the immediate market-value gain from renovation\n' +
                  'is credited upfront — only the remainder needs cash-flow recovery.\n\n' +
                  `Price uplift:      ${fmt(m.priceUplift)}\n` +
                  `Remaining cost:    ${fmt(Math.max(0, m.totalCost - m.priceUplift))}\n` +
                  `Rent lift:        +${fmt(m.rentLift)}/mo`
                }
              />
              <ResultRow
                label="Full-Gain Payback"
                value={gainPBD.val}
                cls={gainPBD.cls}
                secondary={m.monthlyGain > 0 ? `${fmt(m.monthlyGain)}/mo total gain` : undefined}
                tooltip={
                  'Total cost recovered via monthly gain = cash flow + monthly appreciation.\n' +
                  'Best-case view — assumes appreciation accrues steadily every month.\n\n' +
                  `Monthly NOI:      ${fmt(m.monthlyNOI)}\n` +
                  `Monthly appr:     ${fmt(m.monthlyAppr)}\n` +
                  `Monthly gain:     ${fmt(m.monthlyGain)}`
                }
              />
            </div>

            {/* Secondary metrics */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <ResultRow
                label="Reno ROI"
                value={m.renoROI !== null ? `${m.renoROI.toFixed(1)}%/yr` : '—'}
                cls={m.renoROI === null ? 'text-secondary' : m.renoROI > 12 ? 'text-success' : m.renoROI > 6 ? '' : 'text-warning'}
                tooltip={
                  'Annual rent lift ÷ renovation spend.\n' +
                  'Measures pure return on the renovation investment, ignoring market price change.\n' +
                  'Target: 8–12%+ for a worthwhile renovation.'
                }
              />
              <ResultRow
                label="Post-Reno NOI"
                value={fmt(m.monthlyNOI) + '/mo'}
                cls={m.monthlyNOI >= 0 ? 'text-success' : 'text-danger'}
                tooltip="New rent minus monthly expenses after renovation completes."
              />
              <ResultRow
                label="Monthly Appr."
                value={fmt(m.monthlyAppr) + '/mo'}
                tooltip={`Based on ${eff.yearlyApprPct}% yearly appreciation on post-reno value of ${fmt(eff.plannedPrice)}.`}
              />
            </div>
          </div>

          {/* Sliders */}
          <div className="detail-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="eval-section-title" style={{ margin: 0 }}>
                Scenario Adjustments
                {adjActive && <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600 }}>● Active</span>}
              </h3>
              {adjActive && (
                <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                  onClick={resetAdj}>
                  Reset
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem 2rem' }}>
              <SliderInput
                label="Planned price adjustment"
                value={adj.plannedPrice}
                onChange={v => setAdj_('plannedPrice', v)}
                min={-80000} max={80000} step={1000}
                format={v => `${v >= 0 ? '+' : ''}${fmt(v)}`}
                cls={adj.plannedPrice > 0 ? 'text-success' : adj.plannedPrice < 0 ? 'text-danger' : ''}
                help={`Effective: ${fmt(eff.plannedPrice)}`}
              />
              <SliderInput
                label="Yearly appreciation"
                value={adj.yearlyApprPct !== 0 ? adj.yearlyApprPct : inp.yearlyApprPct}
                onChange={v => setAdj_('yearlyApprPct', v === inp.yearlyApprPct ? 0 : v)}
                min={0} max={10} step={0.25}
                format={v => `${v.toFixed(2)}%`}
                cls={eff.yearlyApprPct > 3 ? 'text-success' : eff.yearlyApprPct < 1 ? 'text-warning' : ''}
                help={`Effective: ${eff.yearlyApprPct.toFixed(2)}%`}
              />
              <SliderInput
                label="New rent adjustment"
                value={adj.newRent}
                onChange={v => setAdj_('newRent', v)}
                min={-500} max={1000} step={25}
                format={v => `${v >= 0 ? '+' : ''}${fmt(v)}/mo`}
                cls={adj.newRent > 0 ? 'text-success' : adj.newRent < 0 ? 'text-danger' : ''}
                help={`Effective: ${fmt(eff.newRent)}/mo`}
              />
              <SliderInput
                label="Renovation cost adjustment"
                value={adj.renoCost}
                onChange={v => setAdj_('renoCost', v)}
                min={-20000} max={40000} step={500}
                format={v => `${v >= 0 ? '+' : ''}${fmt(v)}`}
                cls={adj.renoCost > 0 ? 'text-danger' : adj.renoCost < 0 ? 'text-success' : ''}
                help={`Effective: ${fmt(eff.renoCost)}`}
              />
              <SliderInput
                label="Renovation time adjustment"
                value={adj.renoMonths}
                onChange={v => setAdj_('renoMonths', v)}
                min={-3} max={6} step={0.5}
                format={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)} mo`}
                cls={adj.renoMonths > 0 ? 'text-danger' : adj.renoMonths < 0 ? 'text-success' : ''}
                help={`Effective: ${eff.renoMonths.toFixed(1)} months`}
              />
            </div>
          </div>

          {/* Breakdown table */}
          <div className="detail-panel">
            <div className="detail-panel-title">📋 Detailed Breakdown</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <tbody>
                {[
                  ['', 'Before', 'After', 'Change'],
                  ['Monthly rent',     fmt(eff.currentRent), fmt(eff.newRent),
                    { v: m.rentLift, colored: true, sign: true }],
                  ['Monthly expenses', fmt(eff.monthlyExpenses), fmt(eff.monthlyExpenses), '—'],
                  ['Monthly NOI',      fmt(eff.currentRent - eff.monthlyExpenses),
                    fmt(m.monthlyNOI),
                    { v: m.rentLift, colored: true, sign: true }],
                  ['Market price',     fmt(eff.currentPrice), fmt(eff.plannedPrice),
                    { v: m.priceUplift, colored: true, sign: true }],
                  ['Yearly appr.',     fmt(eff.currentPrice * eff.yearlyApprPct / 100),
                    fmt(eff.plannedPrice * eff.yearlyApprPct / 100),
                    { v: (eff.plannedPrice - eff.currentPrice) * eff.yearlyApprPct / 100, colored: true, sign: true }],
                ].map((row, ri) => {
                  const isHeader = ri === 0;
                  return (
                    <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                      {row.map((cell, ci) => {
                        let content = cell;
                        let style = {
                          padding: '0.55rem 0.6rem',
                          fontWeight: isHeader ? 700 : ci === 0 ? 600 : 400,
                          color: isHeader ? 'var(--text-secondary)' : 'var(--text-primary)',
                          fontSize: isHeader ? '0.75rem' : undefined,
                          textTransform: isHeader ? 'uppercase' : undefined,
                          letterSpacing: isHeader ? '0.05em' : undefined,
                          textAlign: ci === 0 ? 'left' : 'right',
                        };
                        if (cell && typeof cell === 'object') {
                          const pos = cell.v >= 0;
                          const col = cell.v === 0 ? 'var(--text-tertiary)'
                            : pos ? '#10b981' : '#ef4444';
                          content = `${cell.sign && pos ? '+' : ''}${fmt(cell.v)}`;
                          if (cell.colored) style = { ...style, color: col, fontWeight: 600 };
                        }
                        return <td key={ci} style={style}>{content}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </>
  );
}
