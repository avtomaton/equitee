import { useState, useMemo } from 'react';
import StarRating from './StarRating.jsx';
import MetricCard from './MetricCard.jsx';
import { fmt, fp, NumInput, SliderInput } from './uiHelpers.jsx';
import { cardEvalLTV, cardEvalCapRate, cardEvalCashOnCash, cardEvalExpenseRatio, cardEvalRentToValue, cardEvalAnnualNOI, cardEvalGRM, cardEvalIRR10, cardEvalMonthlyMortgage, cardEvalTotalMonthlyCosts, cardEvalAvgCashFlow, cardEvalMonthlyGain, cardEvalPayback, cardEvalBreakEven, cardEvalDSCR, cardEvalDebtYield, cardEvalMaxVacancy, cardEvalEquityMultiple, cardEvalMinRent } from '../metricDefs.jsx';
import { calcInvestmentScore, calcMortgagePayment, calcIRR, calcPayback, calcBreakEven } from '../metrics.js';
import { clamp } from '../utils.js';

const DEFAULT_INPUTS = {
  name:               'Property',
  purchasePrice:      500000,
  downPct:            20,
  cardMortgageRate:   5.0,
  amortization:       25,
  monthlyRent:        2500,
  monthlyOpEx:        300,
  yearlyTax:          4000,
  annualAppreciation: 3.0,
};

const DEFAULT_SCENARIO = {
  rentDelta:        0,
  downPaymentDelta: 0,
  rateDelta:        0,
  vacancyRate:      0,
  oneOffExpense:    0,
  repairReserve:    1.0,
};

// ── Pure computation (used by both Single and Compare modes) ──────────────────

function computeEval(inputs, scenario = DEFAULT_SCENARIO) {
  const p = inputs;
  const s = scenario;

  const effectiveRent        = p.monthlyRent * (1 + s.rentDelta / 100);
  const effectiveDownPayment = clamp(p.purchasePrice * clamp((p.downPct + s.downPaymentDelta), 0.1, 99) / 100, 0, p.purchasePrice * 0.99);
  const effectiveRate        = Math.max(0.1, p.cardMortgageRate + s.rateDelta);
  const loanAmount           = p.purchasePrice - effectiveDownPayment;

  const monthlyMortgage      = calcMortgagePayment(loanAmount, effectiveRate, p.amortization);
  const monthlyTax           = p.yearlyTax / 12;
  const monthlyRepairReserve = (p.purchasePrice * s.repairReserve / 100) / 12;
  const totalMonthlyExpenses = p.monthlyOpEx + monthlyTax + monthlyMortgage + monthlyRepairReserve;

  const occupancyRate        = 1 - s.vacancyRate / 100;
  const effectiveMonthlyRent = effectiveRent * occupancyRate;
  const avgCashFlow          = effectiveMonthlyRent - totalMonthlyExpenses;

  const annualGrossRent   = effectiveRent * 12;
  const annualNetOpIncome = annualGrossRent - (p.monthlyOpEx + monthlyTax) * 12;
  const capRate           = p.purchasePrice > 0 ? annualNetOpIncome / p.purchasePrice : 0;

  const cashInvested = effectiveDownPayment + s.oneOffExpense;
  const cashOnCash   = cashInvested > 0 ? (avgCashFlow * 12) / cashInvested : 0;

  const ltvRatio      = p.purchasePrice > 0 ? loanAmount / p.purchasePrice : 0;
  const equity        = effectiveDownPayment;
  const expenseRatio  = effectiveMonthlyRent > 0 ? totalMonthlyExpenses / effectiveMonthlyRent : 0;
  const rentToValue   = p.purchasePrice > 0 ? annualGrossRent / p.purchasePrice : 0;

  const yearlyAppr      = p.purchasePrice * p.annualAppreciation / 100;
  const yearlyApprRatio = p.annualAppreciation / 100;
  const monthlyAppr     = yearlyAppr / 12;
  const monthlyGain     = avgCashFlow + monthlyAppr;

  const payback   = calcPayback(cashInvested, avgCashFlow);
  const breakEven = calcBreakEven(-cashInvested, monthlyGain);

  const projections = [];
  let balance = loanAmount;
  const monthlyRate = effectiveRate / 100 / 12;
  for (let year = 1; year <= 10; year++) {
    for (let mo = 0; mo < 12; mo++) {
      const interest  = balance * monthlyRate;
      const principal = Math.max(0, monthlyMortgage - interest);
      balance         = Math.max(0, balance - principal);
    }
    const propertyValue = p.purchasePrice * Math.pow(1 + yearlyApprRatio, year);
    const yearEquity    = propertyValue - balance;
    const cashPL        = avgCashFlow * 12 * year - s.oneOffExpense;
    const totalGain     = (propertyValue - p.purchasePrice) + cashPL;
    projections.push({ year, propertyValue, balance, yearEquity, cashPL, totalGain });
  }

  const score = calcInvestmentScore({ avgCashFlow, capRate, cashOnCash, expenseRatio, ltvRatio, yearlyApprRatio });
  const grm   = annualGrossRent > 0 ? p.purchasePrice / annualGrossRent : null;

  const irr10 = (() => {
    if (!avgCashFlow || projections.length < 1) return null;
    const monthlyCFs = new Array(120).fill(avgCashFlow);
    monthlyCFs[119] += projections[projections.length - 1]?.yearEquity ?? 0;
    return calcIRR([-cashInvested, ...monthlyCFs]);
  })();

  // NOI-to-Value (same as cap rate but name emphasises operating yield, useful for condos)
  // DSCR: NOI / mortgage
  const dscr = monthlyMortgage > 0 ? (annualNetOpIncome / 12) / monthlyMortgage : null;

  // Debt Yield: NOI / Loan Amount
  const debtYield = loanAmount > 0 ? annualNetOpIncome / loanAmount : null;

  // Max vacancy before CF = 0
  const maxVacancy = effectiveRent > 0
    ? Math.max(0, 1 - totalMonthlyExpenses / effectiveRent)
    : null;

  // Max vacancy before Gain (CF + appreciation) = 0
  const maxVacancyForGain = effectiveRent > 0
    ? Math.max(0, 1 - (totalMonthlyExpenses - monthlyAppr) / effectiveRent)
    : null;

  // Min rent for CF >= 0
  const minRent = totalMonthlyExpenses;

  // Min rent for Gain >= 0 (CF + appreciation >= 0 → rent >= costs - appreciation)
  const minRentForGain = Math.max(0, totalMonthlyExpenses - monthlyAppr);

  // Equity Multiple at year 10
  const lastProj = projections[projections.length - 1];
  const equityMultiple = (lastProj && cashInvested > 0)
    ? (lastProj.yearEquity + lastProj.cashPL) / cashInvested
    : null;

  return {
    effectiveRent, effectiveMonthlyRent, effectiveDownPayment, effectiveRate, loanAmount,
    monthlyMortgage, monthlyTax, monthlyRepairReserve, totalMonthlyExpenses,
    avgCashFlow, annualGrossRent, annualNetOpIncome, capRate, cashOnCash,
    ltvRatio, equity, expenseRatio, rentToValue,
    yearlyAppr, yearlyApprRatio, monthlyAppr, monthlyGain,
    cashInvested, payback, breakEven, projections, score, analysis: [],
    grm, irr10,
    dscr, debtYield, maxVacancy, maxVacancyForGain, minRent, minRentForGain, equityMultiple,
  };
}

// ── ScorePanel ────────────────────────────────────────────────────────────────

function ScorePanel({ score }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap',
      padding: '0.85rem 1.1rem', marginBottom: '1.25rem',
      borderRadius: '10px', border: '1px solid var(--border)',
      background: 'var(--bg-tertiary)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 130 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: 'var(--text-tertiary)' }}>Investment Score</span>
        <span style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }} className={score.cls}>
          {score.score}<span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-tertiary)' }}>/100</span>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <StarRating starsData={score.starsData} />
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }} className={score.cls}>{score.label}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
          Weighted: Cash Flow 30 · Cap Rate 20 · CoC 20 · Expense 15 · LTV 10 · Appreciation 5
        </span>
      </div>
    </div>
  );
}

// ── Analysis builder (single mode only) ──────────────────────────────────────

function buildAnalysis({ avgCashFlow, monthlyGain, yearlyAppr, yearlyApprRatio,
  cardMarketValue, monthlyRent, capRate, cashOnCash,
  expenseRatio, ltvRatio, equity, monthlyMortgage, vacancyRate,
  oneOffExpense, repairReserve }) {

  const items = [];

  if (!monthlyRent) {
    items.push({ isPrimary: true, icon: '📋', cls: 'text-secondary', label: 'Enter rent to see analysis',
      detail: 'Fill in expected monthly rent to compute cash flow and all derived metrics.' });
  } else if (avgCashFlow < 0 && yearlyApprRatio < 0.02) {
    items.push({ isPrimary: true, icon: '🚨', cls: 'text-danger', label: 'Negative cash flow, weak appreciation',
      detail: `This property would cost ${fmt(Math.abs(avgCashFlow))}/mo to hold, with only ${fp(yearlyApprRatio * 100)} annual appreciation. Both income and growth are insufficient.` });
  } else if (avgCashFlow < 0) {
    items.push({ isPrimary: true, icon: '⚖️', cls: monthlyGain >= 0 ? 'text-warning' : 'text-danger',
      label: monthlyGain >= 0 ? 'Appreciation-led — negative cash flow' : 'Cash flow insufficient, appreciation too weak',
      detail: monthlyGain >= 0
        ? `Property costs ${fmt(Math.abs(avgCashFlow))}/mo but appreciation adds ${fmt(yearlyAppr / 12)}/mo. Monthly gain: ${fmt(monthlyGain)}/mo.`
        : `Cash drain (${fmt(Math.abs(avgCashFlow))}/mo) exceeds appreciation gains (${fmt(yearlyAppr / 12)}/mo). Net monthly loss: ${fmt(monthlyGain)}/mo.` });
  } else if (avgCashFlow === 0) {
    items.push({ isPrimary: true, icon: '➖', cls: 'text-warning', label: 'Breakeven cash flow',
      detail: `Rent exactly covers expenses. Monthly gain comes entirely from appreciation: ${fmt(yearlyAppr / 12)}/mo.` });
  } else if (capRate > 0.07 && cashOnCash > 0.08) {
    items.push({ isPrimary: true, icon: '🚀', cls: 'text-success', label: 'Strong investment opportunity',
      detail: `Cap rate ${fp(capRate * 100)} and cash-on-cash ${fp(cashOnCash * 100)} both exceed typical thresholds. This property looks like a strong performer.` });
  } else if (cashOnCash > 0.08) {
    items.push({ isPrimary: true, icon: '✅', cls: 'text-success', label: 'Good capital efficiency',
      detail: `Cash-on-cash return of ${fp(cashOnCash * 100)} means your down payment works hard. Cap rate ${fp(capRate * 100)} is in acceptable range.` });
  } else if (capRate > 0.06) {
    items.push({ isPrimary: true, icon: '📈', cls: 'text-success', label: 'Decent yield',
      detail: `Cap rate of ${fp(capRate * 100)} indicates reasonable asset yield. Cash-on-cash ${fp(cashOnCash * 100)}.` });
  } else {
    items.push({ isPrimary: true, icon: '📊', cls: 'text-warning', label: 'Moderate investment',
      detail: `Cap rate ${fp(capRate * 100)} and cash-on-cash ${fp(cashOnCash * 100)} are below strong-investment thresholds.` });
  }

  if (ltvRatio > 0.80)
    items.push({ icon: '⚡', cls: 'text-danger', label: 'High leverage',
      detail: `LTV of ${fp(ltvRatio * 100)} leaves little equity buffer. A 10% market drop would nearly wipe out your ${fmt(equity)} equity position.` });
  if (monthlyRent > 0 && expenseRatio > 0.50)
    items.push({ icon: '💸', cls: 'text-danger', label: 'High expense ratio',
      detail: `${fp(expenseRatio * 100)} of rent is consumed by expenses.` });
  if (vacancyRate >= 8)
    items.push({ icon: '🏠', cls: 'text-warning', label: 'Significant vacancy modelled',
      detail: `${vacancyRate}% vacancy reduces effective annual rent by ${fmt(monthlyRent * vacancyRate / 100 * 12)}.` });
  if (oneOffExpense > monthlyRent * 3)
    items.push({ icon: '🔧', cls: 'text-warning', label: 'Large one-off expense',
      detail: `${fmt(oneOffExpense)} in upfront costs.` });
  if (monthlyRent > 0 && capRate < 0.05) {
    const targetRent = Math.round(cardMarketValue * 0.06 / 12);
    const delta = targetRent - monthlyRent;
    if (delta > 0)
      items.push({ icon: '📈', cls: 'text-warning', label: 'Low cap rate',
        detail: `Increasing rent to ~${fmt(targetRent)}/mo (+${fmt(delta)}) would push cap rate to ~6%.` });
  }
  if (yearlyApprRatio > 0.07)
    items.push({ icon: '💎', cls: 'text-success', label: 'Strong appreciation projected',
      detail: `At ${fp(yearlyApprRatio * 100)}/yr, the property gains ${fmt(yearlyAppr)}/yr in value.` });
  if (repairReserve < 0.5 && cardMarketValue > 200000)
    items.push({ icon: '🔩', cls: 'text-warning', label: 'Low repair reserve',
      detail: `A reserve below 0.5% may be insufficient. Industry standard is 1–1.5% (${fmt(cardMarketValue * 0.01)}/yr).` });

  return items;
}

// ── Monthly Cash Flow Panel ──────────────────────────────────────────────────

function MonthlyCashFlowPanel({ m, vacancyRate }) {
  const [showYearly, setShowYearly] = useState(false);
  const mul  = showYearly ? 12 : 1;
  const unit = showYearly ? '/yr' : '/mo';

  const interest  = m.loanAmount * m.effectiveRate / 100 / 12;
  const principal = Math.max(0, m.monthlyMortgage - interest);
  const rent      = m.effectiveRent * (1 - vacancyRate / 100);
  const cf        = m.avgCashFlow;
  const gain      = m.monthlyGain;
  const opEx      = m.totalMonthlyExpenses - m.monthlyMortgage - m.monthlyTax - m.monthlyRepairReserve;

  const fv = (n) => fmt(Math.abs(n) * mul);
  const sgn = (n) => n < 0 ? '−' : '+';

  const Row = ({ label, value, cls = '', indent = 0, bold = false, dim = false, borderTop = false }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: `0.22rem 1.1rem 0.22rem ${indent * 1.1 + 1.1}rem`,
      borderTop: borderTop ? '1px solid var(--border)' : 'none',
      marginTop: borderTop ? '0.2rem' : 0,
    }}>
      <span style={{ fontSize: dim ? '0.75rem' : '0.82rem', color: dim ? 'var(--text-tertiary)' : 'var(--text-secondary)', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: bold ? '0.92rem' : '0.82rem', fontWeight: bold ? 700 : 600 }} className={cls}>{value}</span>
    </div>
  );

  const ResultBlock = ({ title, sub, value, cls, bg }) => (
    <div style={{ flex: 1, padding: '0.65rem 1rem', background: bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.85rem' }} className={cls}>{title}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 1 }}>{sub}</div>
      </div>
      <div style={{ fontSize: '1.15rem', fontWeight: 800 }} className={cls}>{value}</div>
    </div>
  );

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      {/* Monthly / Yearly toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginBottom: '0.6rem' }}>
        {['Monthly', 'Yearly'].map(lbl => (
          <button key={lbl} onClick={() => setShowYearly(lbl === 'Yearly')}
            style={{ padding: '0.25rem 0.7rem', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer', border: '1px solid',
              borderColor: (lbl === 'Yearly') === showYearly ? 'var(--accent-primary)' : 'var(--border)',
              background: (lbl === 'Yearly') === showYearly ? 'rgba(59,130,246,0.12)' : 'var(--bg-secondary)',
              color: (lbl === 'Yearly') === showYearly ? 'var(--accent-secondary, #93c5fd)' : 'var(--text-secondary)',
            }}>{lbl}</button>
        ))}
      </div>

      {/* Summary: Cash Flow + Appreciation = Monthly Gain */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <ResultBlock
          title="Cash Flow" sub="Rent − all costs"
          value={`${sgn(cf)}${fv(cf)}`}
          cls={cf >= 0 ? 'text-success' : 'text-danger'}
          bg={cf >= 0 ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.05)'}
        />
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.6rem', color: 'var(--text-tertiary)', fontSize: '1.2rem', background: 'var(--bg-secondary)', flexShrink: 0 }}>+</div>
        <ResultBlock
          title="Appreciation" sub={`${fp(m.yearlyApprRatio * 100)}/yr`}
          value={`${sgn(m.monthlyAppr)}${fv(m.monthlyAppr)}`}
          cls="text-primary"
          bg="rgba(59,130,246,0.06)"
        />
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.6rem', color: 'var(--text-tertiary)', fontSize: '1.2rem', background: 'var(--bg-secondary)', flexShrink: 0 }}>=</div>
        <ResultBlock
          title="Monthly Gain" sub="Total inc. growth"
          value={`${sgn(gain)}${fv(gain)}`}
          cls={gain >= 0 ? 'text-success' : 'text-danger'}
          bg={gain >= 0 ? 'rgba(139,92,246,0.09)' : 'rgba(239,68,68,0.06)'}
        />
      </div>

      {/* Detailed breakdown */}
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', padding: '0.5rem 1.1rem 0.3rem', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
          Cash Flow Breakdown
        </div>
        <Row label="Rental income" value={`+${fv(rent)}`} cls="text-success" bold />
        {vacancyRate > 0 && <Row label={`Vacancy loss (${vacancyRate}%)`} value={`−${fv(m.effectiveRent * vacancyRate / 100)}`} cls="text-danger" indent={1} />}
        <Row label="Total costs" value={`−${fv(m.totalMonthlyExpenses)}`} cls="text-danger" bold borderTop />
        <Row label="Mortgage" value={`−${fv(m.monthlyMortgage)}`} cls="text-danger" indent={1} />
        <Row label="↳ Interest" value={`−${fv(interest)}`} indent={2} dim />
        <Row label="↳ Principal" value={`+${fv(principal)}`} indent={2} dim />
        <Row label="Operating expenses" value={`−${fv(opEx)}`} cls="text-danger" indent={1} />
        <Row label="Property tax" value={`−${fv(m.monthlyTax)}`} indent={2} dim />
        <Row label="Repair reserve" value={`−${fv(m.monthlyRepairReserve)}`} indent={2} dim />
        <Row label={`Net Cash Flow${unit}`} value={`${sgn(cf)}${fv(cf)}`} cls={cf >= 0 ? 'text-success' : 'text-danger'} bold borderTop />
      </div>
    </div>
  );
}

// ── Projection table ──────────────────────────────────────────────────────────

function ProjectionTable({ projections, downPayment }) {
  return (
    <div className="table-scroll-wrap" style={{ marginBottom: '1.5rem' }}>
      <table>
        <thead><tr>
          <th className="col-shrink">Year</th>
          <th>Property Value</th>
          <th>Loan Balance</th>
          <th>Equity</th>
          <th>Cash P&amp;L</th>
          <th>Total Return</th>
          <th className="col-shrink">ROI on Down Pmt</th>
        </tr></thead>
        <tbody>
          {projections.map(p => {
            const roi     = downPayment > 0 ? (p.totalGain / downPayment) * 100 : null;
            const gainCls = p.totalGain   >= 0 ? 'text-success' : 'text-danger';
            const cfCls   = p.cashPL >= 0 ? 'text-success' : 'text-danger';
            return (
              <tr key={p.year}>
                <td className="col-shrink" style={{ fontWeight: 600 }}>Year {p.year}</td>
                <td>{fmt(p.propertyValue)}</td>
                <td className="text-danger">{fmt(p.balance)}</td>
                <td className="text-success">{fmt(p.yearEquity)}</td>
                <td className={cfCls}>{fmt(p.cashPL)}</td>
                <td className={gainCls}>{fmt(p.totalGain)}</td>
                <td className={`col-shrink ${gainCls}`}>{roi !== null ? fp(roi) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Compare: compact input column ─────────────────────────────────────────────

const ACCENT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

function CompareInputColumn({ col, idx, onChange, onRemove, canRemove, m, onOpenSingle }) {
  const set = (key, val) => onChange({ ...col, [key]: val });
  const color = ACCENT_COLORS[idx % ACCENT_COLORS.length];

  return (
    <div style={{
      flex: '1 1 240px', minWidth: 220,
      border: `1px solid ${color}40`,
      borderTop: `3px solid ${color}`,
      borderRadius: 10,
      background: 'var(--bg-secondary)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1rem 0.4rem', borderBottom: '1px solid var(--border)' }}>
        <input
          value={col.name}
          onChange={e => set('name', e.target.value)}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            fontSize: '0.92rem', fontWeight: 700, color,
          }}
          placeholder="Property name"
        />
        <button onClick={onOpenSingle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.75rem', padding: '0 2px', opacity: 0.7 }} title="Open in single view">↗</button>
        {canRemove && (
          <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '1rem', padding: '0 2px' }} title="Remove">×</button>
        )}
      </div>

      {/* Inputs */}
      <div style={{ padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
        <NumInput label="Purchase Price"    value={col.purchasePrice}     onChange={v => set('purchasePrice', v)}     prefix="$" min={0} step={1000} compact />
        <NumInput label="Down Payment"        value={col.downPct}           onChange={v => set('downPct', clamp(v, 0.1, 99))} suffix="%" min={0.1} max={99} step={0.5} compact />
        <NumInput label="Mortgage Rate"     value={col.cardMortgageRate}  onChange={v => set('cardMortgageRate', v)}  suffix="%" min={0} max={30} step={0.05} compact />
        <NumInput label="Amortization"      value={col.amortization}      onChange={v => set('amortization', v)}      suffix="yr" min={1} max={35} step={1} compact />
        <NumInput label="Monthly Rent"      value={col.monthlyRent}       onChange={v => set('monthlyRent', v)}       prefix="$" min={0} step={50} compact />
        <NumInput label="Monthly OpEx"      value={col.monthlyOpEx}       onChange={v => set('monthlyOpEx', v)}       prefix="$" min={0} step={25} compact />
        <NumInput label="Yearly Tax"        value={col.yearlyTax}         onChange={v => set('yearlyTax', v)}         prefix="$" min={0} step={100} compact />
        <NumInput label="Appreciation"      value={col.annualAppreciation} onChange={v => set('annualAppreciation', v)} suffix="%" min={-20} max={30} step={0.1} compact />
      </div>

      {/* Score badge */}
      <div style={{ padding: '0.6rem 1rem', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.4rem', fontWeight: 800, color }} className={m.score.cls}>{m.score.score}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Score</div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600 }} className={m.score.cls}>{m.score.label}</div>
        </div>
        <StarRating starsData={m.score.starsData} size="0.95rem" />
      </div>
    </div>
  );
}

// ── Compare: metrics table ────────────────────────────────────────────────────

function CompareRow({ label, values, fmtFn, highlight = 'high', indent = false }) {
  const nums  = values.map(v => (v == null || isNaN(v)) ? null : v);
  const valid = nums.filter(v => v !== null);
  const best  = valid.length > 1 ? (highlight === 'high' ? Math.max(...valid) : Math.min(...valid)) : null;

  return (
    <tr>
      <td style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', padding: '0.4rem 0.75rem', paddingLeft: indent ? '1.5rem' : '0.75rem', whiteSpace: 'nowrap' }}>{label}</td>
      {nums.map((v, i) => (
        <td key={i} style={{
          padding: '0.4rem 0.75rem', textAlign: 'right', fontWeight: v === best ? 700 : 500,
          fontSize: '0.85rem',
          color: v === null ? 'var(--text-tertiary)'
            : v === best ? (highlight === 'high' ? 'var(--success, #10b981)' : '#f59e0b')
            : 'var(--text-primary)',
          background: v === best ? (highlight === 'high' ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)') : 'transparent',
        }}>
          {v === null ? '—' : fmtFn(v)}
        </td>
      ))}
    </tr>
  );
}

function CompareSectionHeader({ label, colCount }) {
  return (
    <tr style={{ background: 'var(--bg-tertiary)' }}>
      <td colSpan={colCount + 1} style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', padding: '0.45rem 0.75rem' }}>{label}</td>
    </tr>
  );
}

function CompareTable({ cols, metrics }) {
  const v = fn => metrics.map(m => m ? fn(m) : null);
  const n = cols.length;

  return (
    <div className="table-container">
      <div className="table-scroll-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 170 }}></th>
              {cols.map((c, i) => (
                <th key={i} style={{ textAlign: 'right', color: ACCENT_COLORS[i % ACCENT_COLORS.length], minWidth: 130 }}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <CompareSectionHeader label="Purchase" colCount={n} />
            <CompareRow label="Purchase Price"    values={cols.map(c => c.purchasePrice)}       fmtFn={fmt}            highlight="none" />
            <CompareRow label="Down Payment"      values={cols.map(c => c.purchasePrice * c.downPct / 100)} fmtFn={fmt} highlight="none" />
            <CompareRow label="Loan Amount"       values={v(m => m.loanAmount)}                 fmtFn={fmt}            highlight="low" />
            <CompareRow label="LTV"               values={v(m => m.ltvRatio * 100)}             fmtFn={v => `${v.toFixed(1)}%`} highlight="low" />
            <CompareRow label="Monthly Mortgage"  values={v(m => m.monthlyMortgage)}            fmtFn={fmt}            highlight="low" />

            <CompareSectionHeader label="Income & Cash Flow" colCount={n} />
            <CompareRow label="Monthly Rent"      values={cols.map(c => c.monthlyRent)}         fmtFn={fmt}            highlight="high" />
            <CompareRow label="Total Monthly Costs" values={v(m => m.totalMonthlyExpenses)}     fmtFn={fmt}            highlight="low" />
            <CompareRow label="Cash Flow"         values={v(m => m.avgCashFlow)}                fmtFn={fmt}            highlight="high" />
            <CompareRow label="Monthly Gain"      values={v(m => m.monthlyGain)}                fmtFn={fmt}            highlight="high" />
            <CompareRow label="Annual NOI"        values={v(m => m.annualNetOpIncome)}          fmtFn={fmt}            highlight="high" />

            <CompareSectionHeader label="Investment Ratios" colCount={n} />
            <CompareRow label="Cap Rate"          values={v(m => m.capRate * 100)}              fmtFn={v => `${v.toFixed(2)}%`} highlight="high" />
            <CompareRow label="Cash-on-Cash"      values={v(m => m.cashOnCash * 100)}           fmtFn={v => `${v.toFixed(2)}%`} highlight="high" />
            <CompareRow label="DSCR"              values={v(m => m.dscr)}                       fmtFn={v => `${v.toFixed(2)}x`} highlight="high" />
            <CompareRow label="Debt Yield"        values={v(m => m.debtYield != null ? m.debtYield * 100 : null)} fmtFn={v => `${v.toFixed(2)}%`} highlight="high" />
            <CompareRow label="Expense Ratio"     values={v(m => m.expenseRatio * 100)}         fmtFn={v => `${v.toFixed(1)}%`} highlight="low" />
            <CompareRow label="Rent-to-Value"     values={v(m => m.rentToValue * 100)}          fmtFn={v => `${v.toFixed(2)}%`} highlight="high" />
            <CompareRow label="Max Vacancy (CF≥0)"   values={v(m => m.maxVacancy != null ? m.maxVacancy * 100 : null)} fmtFn={v => `${v.toFixed(1)}%`} highlight="high" />
            <CompareRow label="Max Vacancy (Gain≥0)" values={v(m => m.maxVacancyForGain != null ? m.maxVacancyForGain * 100 : null)} fmtFn={v => `${v.toFixed(1)}%`} highlight="high" />
            <CompareRow label="Min Rent (CF≥0)"      values={v(m => m.minRent)}                    fmtFn={fmt}          highlight="low" />
            <CompareRow label="Min Rent (Gain≥0)"    values={v(m => m.minRentForGain)}             fmtFn={fmt}          highlight="low" />
            <CompareRow label="GRM"               values={v(m => m.grm)}                        fmtFn={v => v.toFixed(1)}       highlight="low" />
            <CompareRow label="IRR (10yr)"        values={v(m => m.irr10 !== null ? m.irr10 * 100 : null)} fmtFn={v => `${v.toFixed(2)}%`} highlight="high" />

            <CompareSectionHeader label="Investment Score" colCount={n} />
            <CompareRow label="Score /100"        values={v(m => m.score.score)}                fmtFn={v => `${v}/100`}  highlight="high" />

            <CompareSectionHeader label="10-Year Projection" colCount={n} />
            <CompareRow label="Value (yr 10)"     values={v(m => m.projections[9]?.propertyValue)}  fmtFn={fmt}  highlight="high" />
            <CompareRow label="Equity (yr 10)"    values={v(m => m.projections[9]?.yearEquity)}      fmtFn={fmt}  highlight="high" />
            <CompareRow label="Cash P&L (yr 10)"    values={v(m => m.projections[9]?.cashPL)} fmtFn={fmt}  highlight="high" />
            <CompareRow label="Total Gain (yr 10)" values={v(m => m.projections[9]?.totalGain)}     fmtFn={fmt}  highlight="high" />
            <CompareRow label="ROI on Down (yr 10)" values={v(m => {
              const p = m.projections[9]; const dp = m.effectiveDownPayment;
              return (p && dp > 0) ? p.totalGain / dp * 100 : null;
            })} fmtFn={v => `${v.toFixed(1)}%`} highlight="high" />
            <CompareRow label="10yr Total Return"      values={v(m => m.equityMultiple)} fmtFn={v => `${v.toFixed(2)}x`} highlight="high" />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EvaluatorView() {
  const [mode, setMode] = useState('single'); // 'single' | 'compare'

  // ── Single mode state ────────────────────────────────────────────────────
  const [inputs, setInputs] = useState({ ...DEFAULT_INPUTS, name: 'My Property' });
  const [scenario, setScenario] = useState({ ...DEFAULT_SCENARIO });
  const set  = (key, val) => setInputs(s  => ({ ...s, [key]: val }));
  const setS = (key, val) => setScenario(s => ({ ...s, [key]: val }));

  const [refi, setRefi] = useState({ currentLoan: 400000, currentRate: 5.5, newRate: 4.5, newAmort: 25, closingCosts: 3000 });
  const setR = (key, val) => setRefi(s => ({ ...s, [key]: val }));

  const refiCalc = useMemo(() => {
    const { currentLoan, currentRate, newRate, newAmort, closingCosts } = refi;
    if (!currentLoan || !currentRate || !newRate || !newAmort) return null;
    const oldPayment = calcMortgagePayment(currentLoan, currentRate, newAmort);
    const newPayment = calcMortgagePayment(currentLoan, newRate, newAmort);
    const monthlySaving = oldPayment - newPayment;
    const breakEvenMonths = monthlySaving > 0 ? Math.ceil(closingCosts / monthlySaving) : null;
    const totalInterestOld = oldPayment * newAmort * 12 - currentLoan;
    const totalInterestNew = newPayment * newAmort * 12 - currentLoan;
    const totalInterestSaved = totalInterestOld - totalInterestNew;
    return { oldPayment, newPayment, monthlySaving, breakEvenMonths, totalInterestSaved };
  }, [refi]);

  const m = useMemo(() => {
    const result = computeEval(inputs, scenario);
    result.analysis = buildAnalysis({
      avgCashFlow: result.avgCashFlow, monthlyGain: result.monthlyGain,
      yearlyAppr: result.yearlyAppr, yearlyApprRatio: result.yearlyApprRatio,
      cardMarketValue: inputs.purchasePrice, monthlyRent: result.effectiveRent,
      capRate: result.capRate, cashOnCash: result.cashOnCash,
      expenseRatio: result.expenseRatio, ltvRatio: result.ltvRatio,
      equity: result.equity, monthlyMortgage: result.monthlyMortgage,
      vacancyRate: scenario.vacancyRate, oneOffExpense: scenario.oneOffExpense,
      repairReserve: scenario.repairReserve,
    });
    return result;
  }, [inputs, scenario]);

  const [primary, ...secondary] = m.analysis;
  const scenarioActive = scenario.rentDelta !== 0 || scenario.downPaymentDelta !== 0
    || scenario.rateDelta !== 0 || scenario.vacancyRate !== 0
    || scenario.oneOffExpense !== 0 || scenario.repairReserve !== 1.0;

  // ── Compare mode state ───────────────────────────────────────────────────
  const [compareCols, setCompareCols] = useState([
    { ...DEFAULT_INPUTS, name: 'Option A', purchasePrice: 500000, downPct: 20, monthlyRent: 2500 },
    { ...DEFAULT_INPUTS, name: 'Option B', purchasePrice: 550000, downPct: 20, monthlyRent: 2800 },
  ]);

  const compareMetrics = useMemo(
    () => compareCols.map(c => computeEval(c)),
    [compareCols]
  );

  const addCompareCol = () => {
    if (compareCols.length >= 4) return;
    setCompareCols(prev => [...prev, {
      ...DEFAULT_INPUTS,
      name: `Option ${String.fromCharCode(65 + prev.length)}`,
    }]);
  };

  const removeCompareCol = (i) => setCompareCols(prev => prev.filter((_, idx) => idx !== i));
  const updateCompareCol = (i, col) => setCompareCols(prev => prev.map((c, idx) => idx === i ? col : c));

  // ── Tab bar ──────────────────────────────────────────────────────────────
  const tabStyle = (active) => ({
    padding: '0.45rem 1.1rem', borderRadius: 7, cursor: 'pointer', fontWeight: 600,
    fontSize: '0.85rem', border: '1px solid',
    borderColor: active ? 'var(--accent-primary)' : 'var(--border)',
    background: active ? 'rgba(59,130,246,0.12)' : 'var(--bg-secondary)',
    color: active ? 'var(--accent-secondary, #93c5fd)' : 'var(--text-secondary)',
    transition: 'all 0.15s',
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Property Evaluator</h1>
          <p className="page-subtitle" style={{ marginTop: '0.25rem' }}>
            Model prospective investments and compare options side-by-side.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button style={tabStyle(mode === 'single')} onClick={() => setMode('single')}>🔍 Single</button>
          <button style={tabStyle(mode === 'compare')} onClick={() => {
          if (mode !== 'compare') {
            // Pre-populate the first compare column from the current single-mode inputs
            setCompareCols(prev => [{ ...prev[0], ...inputs, name: inputs.name || 'Option A' }, ...prev.slice(1)]);
          }
          setMode('compare');
        }}>⚖️ Compare</button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SINGLE MODE                                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mode === 'single' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem', alignItems: 'start', marginBottom: '1.5rem' }}>
          <div className="detail-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            <h3 className="eval-section-title">Property Details</h3>
            <NumInput label="Purchase Price"           value={inputs.purchasePrice}      onChange={v => set('purchasePrice', v)}      prefix="$" min={0} step={1000} />
            <NumInput label="Down Payment"             value={inputs.downPct}            onChange={v => set('downPct', clamp(v, 0.1, 99))}  suffix="%" min={0.1} max={99} step={0.5}
              help={inputs.purchasePrice > 0 ? `${fmt(inputs.purchasePrice * inputs.downPct / 100)} (${fp(inputs.downPct)} of purchase price)` : undefined} />
            <NumInput label="Mortgage Rate"            value={inputs.cardMortgageRate}   onChange={v => set('cardMortgageRate', v)}   suffix="%" min={0} max={30} step={0.05} />
            <NumInput label="Amortization"             value={inputs.amortization}       onChange={v => set('amortization', v)}       suffix="yr" min={1} max={35} step={1} />
            <div className="eval-computed-row">
              <span>Loan Amount</span>
              <span>{fmt(inputs.purchasePrice * (1 - inputs.downPct / 100))}</span>
            </div>
            <div className="eval-computed-row">
              <span>Monthly Payment</span>
              <span className="text-danger">{fmt(calcMortgagePayment(inputs.purchasePrice * (1 - inputs.downPct / 100), inputs.cardMortgageRate, inputs.amortization))}/mo</span>
            </div>
            <h3 className="eval-section-title" style={{ marginTop: '1rem' }}>Income &amp; Expenses</h3>
            <NumInput label="Expected Monthly Rent"        value={inputs.monthlyRent}         onChange={v => set('monthlyRent', v)}         prefix="$" min={0} step={50} />
            <NumInput label="Monthly Operating Expenses"   value={inputs.monthlyOpEx}         onChange={v => set('monthlyOpEx', v)}         prefix="$" min={0} step={25}
              help="Insurance, management fees, utilities, etc." />
            <NumInput label="Yearly Property Tax"          value={inputs.yearlyTax}           onChange={v => set('yearlyTax', v)}           prefix="$" min={0} step={100} />
            <NumInput label="Expected Annual Appreciation" value={inputs.annualAppreciation}  onChange={v => set('annualAppreciation', v)}  suffix="%" min={-20} max={30} step={0.1} />
          </div>

          <div>
            <p className="stat-section-label">Performance</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {cardEvalAvgCashFlow(m.avgCashFlow, scenario.vacancyRate)}
              {inputs.monthlyRent > 0 && cardEvalRentToValue(m.rentToValue)}
              {cardEvalCapRate(m.capRate)}
              {cardEvalCashOnCash(m.cashOnCash)}
              {inputs.monthlyRent > 0 && cardEvalExpenseRatio(m.expenseRatio)}
              {m.equityMultiple !== null && cardEvalEquityMultiple(m.equityMultiple, 10)}
            </div>
            <p className="stat-section-label">Returns &amp; Recovery</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {cardEvalAnnualNOI(m.annualNetOpIncome)}
              {cardEvalPayback(m.payback)}
              {cardEvalBreakEven(m.breakEven)}
              {m.irr10 !== null && cardEvalIRR10(m.irr10)}
              {m.grm !== null && inputs.monthlyRent > 0 && cardEvalGRM(m.grm)}
            </div>
            <p className="stat-section-label">Risk &amp; Lender</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {cardEvalLTV(m.ltvRatio)}
              {m.dscr !== null && cardEvalDSCR(m.dscr)}
              {m.debtYield !== null && cardEvalDebtYield(m.debtYield)}
              {inputs.monthlyRent > 0 && cardEvalMaxVacancy(m.maxVacancy, m.maxVacancyForGain, scenario.vacancyRate)}
              {inputs.monthlyRent > 0 && cardEvalMinRent(m.minRent, m.minRentForGain, m.effectiveRent)}
            </div>
            <ScorePanel score={m.score} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.9rem 1rem', marginBottom: secondary.length ? '0.5rem' : '1.25rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1, flexShrink: 0 }}>{primary.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }} className={primary.cls}>{primary.label}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.3rem', lineHeight: 1.55 }}>{primary.detail}</div>
              </div>
            </div>
            {secondary.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
                {secondary.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', padding: '0.6rem 0.9rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
                    <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>{s.icon}</span>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: '0.82rem' }} className={s.cls}>{s.label} </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Monthly Cash Flow — full width */}
        <div style={{ marginBottom: '0.5rem' }}>
          <p className="stat-section-label" style={{ margin: '0 0 0.6rem' }}>Cash Flow and Gain</p>
          <MonthlyCashFlowPanel m={m} vacancyRate={scenario.vacancyRate} />
        </div>

        {/* Scenario Panel */}
        <div className="detail-panel" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 className="eval-section-title" style={{ margin: 0 }}>
              Scenario Adjustments
              {scenarioActive && <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600 }}>● Active</span>}
            </h3>
            {scenarioActive && (
              <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
                onClick={() => setScenario({ ...DEFAULT_SCENARIO })}>Reset</button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem 2rem', alignItems: 'end' }}>
            <SliderInput label="Rent adjustment" value={scenario.rentDelta} onChange={v => setS('rentDelta', v)} min={-30} max={30} step={1} format={v => `${v >= 0 ? '+' : ''}${v}%`} cls={scenario.rentDelta > 0 ? 'text-success' : scenario.rentDelta < 0 ? 'text-danger' : ''} help={`Effective rent: ${fmt(m.effectiveRent)}/mo`} />
            <SliderInput label="Down payment adjustment" value={scenario.downPaymentDelta} onChange={v => setS('downPaymentDelta', v)} min={-40} max={40} step={1} format={v => `${v >= 0 ? '+' : ''}${v}%`} cls={scenario.downPaymentDelta > 0 ? 'text-success' : scenario.downPaymentDelta < 0 ? 'text-danger' : ''} help={`Effective down payment: ${fmt(m.effectiveDownPayment)}`} />
            <SliderInput label="Interest rate stress" value={scenario.rateDelta} onChange={v => setS('rateDelta', v)} min={-2} max={4} step={0.25} format={v => `${v >= 0 ? '+' : ''}${v.toFixed(2)} pp`} cls={scenario.rateDelta > 0 ? 'text-danger' : scenario.rateDelta < 0 ? 'text-success' : ''} help={`Effective rate: ${fp(m.effectiveRate)}`} />
            <SliderInput label="Vacancy rate" value={scenario.vacancyRate} onChange={v => setS('vacancyRate', v)} min={0} max={30} step={1} format={v => `${v}%`} cls={scenario.vacancyRate > 8 ? 'text-danger' : scenario.vacancyRate > 3 ? 'text-warning' : ''} help="% of time the property sits empty" />
            <SliderInput label="One-off expense" value={scenario.oneOffExpense} onChange={v => setS('oneOffExpense', v)} min={0} max={50000} step={500} format={v => fmt(v)} cls={scenario.oneOffExpense > 0 ? 'text-danger' : ''} help="Renovation, inspection, closing costs, etc." />
            <SliderInput label="Annual repair reserve" value={scenario.repairReserve} onChange={v => setS('repairReserve', v)} min={0} max={3} step={0.1} format={v => `${v.toFixed(1)}% of value/yr`} cls={scenario.repairReserve < 0.5 ? 'text-warning' : ''} help={`${fmt(inputs.purchasePrice * scenario.repairReserve / 100)}/yr reserved`} />
          </div>
        </div>

        {/* Refinancing What-If */}
        <div className="detail-panel" style={{ marginBottom: '1.5rem' }}>
          <div className="detail-panel-title"><span>🔄 Refinancing What-If</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <NumInput label="Current Loan Balance" value={refi.currentLoan}  onChange={v => setR('currentLoan', v)}  prefix="$" min={0} step={1000} />
            <NumInput label="Current Rate"         value={refi.currentRate}  onChange={v => setR('currentRate', v)}  suffix="%" min={0} max={30} step={0.05} />
            <NumInput label="New Rate"             value={refi.newRate}      onChange={v => setR('newRate', v)}      suffix="%" min={0} max={30} step={0.05} />
            <NumInput label="New Amortization"     value={refi.newAmort}     onChange={v => setR('newAmort', v)}     suffix="yr" min={1} max={35} step={1} />
            <NumInput label="Closing Costs"        value={refi.closingCosts} onChange={v => setR('closingCosts', v)} prefix="$" min={0} step={100} />
          </div>
          {refiCalc && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {[
                { label: 'Old Payment',         val: `${fmt(refiCalc.oldPayment)}/mo`,         cls: '' },
                { label: 'New Payment',         val: `${fmt(refiCalc.newPayment)}/mo`,         cls: refiCalc.monthlySaving > 0 ? 'text-success' : 'text-danger' },
                { label: 'Monthly Saving',      val: `${refiCalc.monthlySaving >= 0 ? '+' : ''}${fmt(refiCalc.monthlySaving)}/mo`, cls: refiCalc.monthlySaving >= 0 ? 'text-success' : 'text-danger' },
                { label: 'Break-even',          val: refiCalc.breakEvenMonths != null ? `${refiCalc.breakEvenMonths} mo` : '—', cls: '' },
                { label: 'Total Interest Saved', val: fmt(refiCalc.totalInterestSaved),        cls: refiCalc.totalInterestSaved >= 0 ? 'text-success' : 'text-danger' },
              ].map(r => (
                <div key={r.label} style={{ flex: '1 1 140px', background: 'var(--bg-tertiary)', borderRadius: 8, padding: '0.75rem', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginBottom: 4 }}>{r.label}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }} className={r.cls}>{r.val}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 10-Year Projection */}
        <div className="detail-panel">
          <div className="detail-panel-title">
            <span>📅 10-Year Projection</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
              Based on {fp(inputs.annualAppreciation)} appreciation · {fmt(m.avgCashFlow)}/mo cash flow · {fp(m.effectiveRate)} mortgage
            </span>
          </div>
          <ProjectionTable projections={m.projections} downPayment={m.effectiveDownPayment} />
        </div>
      </>)}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* COMPARE MODE                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mode === 'compare' && (<>
        {/* Input columns */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
          {compareCols.map((col, i) => (
            <CompareInputColumn
              key={i} col={col} idx={i}
              onChange={updated => updateCompareCol(i, updated)}
              onRemove={() => removeCompareCol(i)}
              canRemove={compareCols.length > 2}
              m={compareMetrics[i]}
              onOpenSingle={() => { setInputs(prev => ({ ...prev, ...col })); setMode('single'); }}
            />
          ))}
          {compareCols.length < 4 && (
            <button
              onClick={addCompareCol}
              style={{
                flex: '0 0 auto', width: 52, border: '2px dashed var(--border)',
                borderRadius: 10, background: 'none', cursor: 'pointer',
                color: 'var(--text-tertiary)', fontSize: '1.5rem',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.color = 'var(--accent-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
              title="Add property"
            >+</button>
          )}
        </div>

        {/* Comparison table */}
        <CompareTable cols={compareCols} metrics={compareMetrics} />
      </>)}
    </>
  );
}
