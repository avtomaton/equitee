import { useState, useMemo } from 'react';
import StarRating from './StarRating.jsx';
import MetricCard from './MetricCard.jsx';
import { fmt, fPct, fp, mc } from './uiHelpers.jsx';
import { calcInvestmentScore, calcMortgagePayment, calcIRR, calcPayback, calcBreakEven } from '../metrics.js';

// ── Small helpers ─────────────────────────────────────────────────────────────

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const PROPERTY_TYPES = ['Residential', 'Condo', 'Multi-Family', 'Commercial', 'Industrial', 'Land'];

// ── Input components ──────────────────────────────────────────────────────────

function NumInput({ label, value, onChange, prefix = '', suffix = '', min, max, step = 1, help }) {
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

// ── Analysis tips (forward-looking, no historical records) ────────────────────

function buildAnalysis({ avgCashFlow, monthlyGain, yearlyAppr, yearlyApprRatio,
  marketValue, monthlyRent, capRate, cashOnCash,
  expenseRatio, ltvRatio, equity, monthlyMortgage, vacancyRate,
  oneOffExpense, repairReserve }) {

  const items = [];

  // ── Primary ───────────────────────────────────────────────────────────────

  if (!monthlyRent) {
    items.push({ isPrimary: true, icon: '📋', cls: 'text-secondary', label: 'Enter rent to see analysis',
      detail: 'Fill in expected monthly rent to compute cash flow and all derived metrics.' });
  } else if (avgCashFlow < 0 && yearlyApprRatio < 0.02) {
    items.push({ isPrimary: true, icon: '🚨', cls: 'text-danger', label: 'Negative cash flow, weak appreciation',
      detail: `This property would cost ${fmt(Math.abs(avgCashFlow))}/mo to hold, with only ${fp(yearlyApprRatio * 100)}% annual appreciation. Both income and growth are insufficient.` });
  } else if (avgCashFlow < 0) {
    items.push({ isPrimary: true, icon: '⚖️', cls: monthlyGain >= 0 ? 'text-warning' : 'text-danger',
      label: monthlyGain >= 0 ? 'Appreciation-led — negative cash flow' : 'Cash flow insufficient, appreciation too weak',
      detail: monthlyGain >= 0
        ? `Property costs ${fmt(Math.abs(avgCashFlow))}/mo but appreciation adds ${fmt(yearlyAppr / 12)}/mo. Monthly gain: ${fmt(monthlyGain)}/mo. Requires strong cash reserves.`
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
      detail: `Cap rate of ${fp(capRate * 100)} indicates reasonable asset yield. Cash-on-cash ${fp(cashOnCash * 100)} — consider increasing down payment to improve capital returns.` });
  } else {
    items.push({ isPrimary: true, icon: '📊', cls: 'text-warning', label: 'Moderate investment',
      detail: `Cap rate ${fp(capRate * 100)} and cash-on-cash ${fp(cashOnCash * 100)} are below strong-investment thresholds. Review rent pricing or expenses.` });
  }

  // ── Secondary advisories ──────────────────────────────────────────────────

  if (ltvRatio > 0.80) {
    items.push({ icon: '⚡', cls: 'text-danger', label: 'High leverage',
      detail: `LTV of ${fp(ltvRatio * 100)} leaves little equity buffer. A 10% market drop would nearly wipe out your ${fmt(equity)} equity position.` });
  }
  if (monthlyRent > 0 && expenseRatio > 0.50) {
    items.push({ icon: '💸', cls: 'text-danger', label: 'High expense ratio',
      detail: `${fp(expenseRatio * 100)} of rent is consumed by expenses. Consider negotiating purchase price, refinancing, or increasing rent to improve margins.` });
  }
  if (vacancyRate >= 8) {
    items.push({ icon: '🏠', cls: 'text-warning', label: 'Significant vacancy modelled',
      detail: `${vacancyRate}% vacancy reduces effective annual rent by ${fmt(monthlyRent * vacancyRate / 100 * 12)}. Ensure the local market supports stable tenancy at this rent level.` });
  }
  if (oneOffExpense > monthlyRent * 3) {
    items.push({ icon: '🔧', cls: 'text-warning', label: 'Large one-off expense',
      detail: `${fmt(oneOffExpense)} in upfront costs takes ${Math.ceil(oneOffExpense / Math.max(1, avgCashFlow))} months of cash flow to recover.` });
  }
  if (monthlyRent > 0 && capRate < 0.05) {
    const targetRent = Math.round(marketValue * 0.06 / 12);
    const delta = targetRent - monthlyRent;
    if (delta > 0) {
      items.push({ icon: '📈', cls: 'text-warning', label: 'Low cap rate',
        detail: `At ${fp(capRate * 100)}, yield is below the 5% threshold. Increasing rent to ~${fmt(targetRent)}/mo (+${fmt(delta)}) would push cap rate to ~6%.` });
    }
  }
  if (ltvRatio > 0 && ltvRatio < 0.55 && equity > 50000) {
    items.push({ icon: '🏦', cls: 'text-success', label: 'Low leverage — cash-out potential',
      detail: `LTV of ${fp(ltvRatio * 100)} with ${fmt(equity)} in equity. A cash-out refinance at purchase could fund additional investments while still keeping LTV conservative.` });
  }
  if (yearlyApprRatio > 0.07) {
    items.push({ icon: '💎', cls: 'text-success', label: 'Strong appreciation projected',
      detail: `At ${fp(yearlyApprRatio * 100)}/yr appreciation, the property gains ${fmt(yearlyAppr)}/yr in value. Even modest cash flow becomes highly profitable long-term.` });
  }
  if (repairReserve < 0.5 && marketValue > 200000) {
    items.push({ icon: '🔩', cls: 'text-warning', label: 'Low repair reserve',
      detail: `A reserve below 0.5% of value may be insufficient. Industry standard is 1–1.5% (${fmt(marketValue * 0.01)}/yr) for repairs and maintenance.` });
  }

  return items;
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
          <th>Cumul. Cash Flow</th>
          <th>Total Gain</th>
          <th className="col-shrink">ROI on Down Pmt</th>
        </tr></thead>
        <tbody>
          {projections.map(p => {
            const roi     = downPayment > 0 ? (p.totalGain / downPayment) * 100 : null;
            const gainCls = p.totalGain   >= 0 ? 'text-success' : 'text-danger';
            const cfCls   = p.cumulativeCF >= 0 ? 'text-success' : 'text-danger';
            return (
              <tr key={p.year}>
                <td className="col-shrink" style={{ fontWeight: 600 }}>Year {p.year}</td>
                <td>{fmt(p.propertyValue)}</td>
                <td className="text-danger">{fmt(p.balance)}</td>
                <td className="text-success">{fmt(p.yearEquity)}</td>
                <td className={cfCls}>{fmt(p.cumulativeCF)}</td>
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

// ── Main component ────────────────────────────────────────────────────────────

export default function EvaluatorView() {
  const [inputs, setInputs] = useState({
    propertyType:       'Residential',
    purchasePrice:      500000,
    downPayment:        100000,
    mortgageRate:       5.0,
    amortization:       25,
    monthlyRent:        2500,
    monthlyOpEx:        300,
    yearlyTax:          4000,
    annualAppreciation: 3.0,
  });

  const [scenario, setScenario] = useState({
    rentDelta:        0,
    downPaymentDelta: 0,
    rateDelta:        0,
    vacancyRate:      0,
    oneOffExpense:    0,
    repairReserve:    1.0,
  });

  const set  = (key, val) => setInputs(s  => ({ ...s, [key]: val }));
  const setS = (key, val) => setScenario(s => ({ ...s, [key]: val }));

  const m = useMemo(() => {
    const p = inputs;
    const s = scenario;

    const effectiveRent        = p.monthlyRent * (1 + s.rentDelta / 100);
    const effectiveDownPayment = clamp(p.downPayment * (1 + s.downPaymentDelta / 100), 0, p.purchasePrice * 0.99);
    const effectiveRate        = Math.max(0.1, p.mortgageRate + s.rateDelta);
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

    // Payback: cash invested ÷ avg cash flow (forward-looking: no historical expenses)
    // Break-even: cash invested ÷ monthly gain (includes appreciation)
    const payback   = calcPayback(cashInvested, avgCashFlow);
    const breakEven = calcBreakEven(-cashInvested, monthlyGain);

    // 10-year projection
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
      const cumulativeCF  = avgCashFlow * 12 * year - s.oneOffExpense;
      const totalGain     = yearEquity - effectiveDownPayment + cumulativeCF;
      projections.push({ year, propertyValue, balance, yearEquity, cumulativeCF, totalGain });
    }

    const score = calcInvestmentScore({ avgCashFlow, capRate, cashOnCash, expenseRatio, ltvRatio, yearlyApprRatio });

    const grm = annualGrossRent > 0 ? p.purchasePrice / annualGrossRent : null;

    const irr10 = (() => {
      if (!avgCashFlow || projections.length < 1) return null;
      const monthlyCFs = new Array(120).fill(avgCashFlow);
      monthlyCFs[119] += projections[projections.length - 1]?.yearEquity ?? 0;
      return calcIRR([-cashInvested, ...monthlyCFs]);
    })();

    const analysis = buildAnalysis({
      avgCashFlow, monthlyGain, yearlyAppr, yearlyApprRatio,
      marketValue: p.purchasePrice, monthlyRent: effectiveRent,
      capRate, cashOnCash, expenseRatio, ltvRatio, equity,
      monthlyMortgage, vacancyRate: s.vacancyRate,
      oneOffExpense: s.oneOffExpense, repairReserve: s.repairReserve,
    });

    return {
      effectiveRent, effectiveDownPayment, effectiveRate, loanAmount,
      monthlyMortgage, monthlyTax, monthlyRepairReserve, totalMonthlyExpenses,
      avgCashFlow, annualGrossRent, annualNetOpIncome, capRate, cashOnCash,
      ltvRatio, equity, expenseRatio, rentToValue,
      yearlyAppr, yearlyApprRatio, monthlyAppr, monthlyGain,
      cashInvested, payback, breakEven, projections, score, analysis, grm, irr10,
    };
  }, [inputs, scenario]);

  const [primary, ...secondary] = m.analysis;

  const scenarioActive = scenario.rentDelta !== 0 || scenario.downPaymentDelta !== 0
    || scenario.rateDelta !== 0 || scenario.vacancyRate !== 0
    || scenario.oneOffExpense !== 0 || scenario.repairReserve !== 1.0;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Property Evaluator</h1>
        <p className="page-subtitle" style={{ marginTop: '0.25rem' }}>
          Model a prospective investment and stress-test it with scenario adjustments.
        </p>
      </div>

      {/* ── Input + Metrics side by side ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem', alignItems: 'start', marginBottom: '1.5rem' }}>

        {/* Left: Inputs */}
        <div className="detail-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          <h3 className="eval-section-title">Property Details</h3>

          <div className="eval-field">
            <label className="eval-label">Property Type</label>
            <select className="eval-input" value={inputs.propertyType}
              onChange={e => set('propertyType', e.target.value)}
              style={{ padding: '0.45rem 0.6rem' }}>
              {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <NumInput label="Purchase Price"           value={inputs.purchasePrice}      onChange={v => set('purchasePrice', v)}      prefix="$" min={0} step={1000} />
          <NumInput label="Down Payment"             value={inputs.downPayment}        onChange={v => set('downPayment', v)}        prefix="$" min={0} step={1000}
            help={inputs.purchasePrice > 0 ? `${fp(inputs.downPayment / inputs.purchasePrice * 100)} of purchase price` : undefined} />
          <NumInput label="Mortgage Rate"            value={inputs.mortgageRate}       onChange={v => set('mortgageRate', v)}       suffix="%" min={0} max={30} step={0.05} />
          <NumInput label="Amortization"             value={inputs.amortization}       onChange={v => set('amortization', v)}       suffix="yr" min={1} max={35} step={1} />

          <div className="eval-computed-row">
            <span>Loan Amount</span>
            <span>{fmt(inputs.purchasePrice - inputs.downPayment)}</span>
          </div>
          <div className="eval-computed-row">
            <span>Monthly Payment</span>
            <span className="text-danger">{fmt(calcMortgagePayment(inputs.purchasePrice - inputs.downPayment, inputs.mortgageRate, inputs.amortization))}/mo</span>
          </div>

          <h3 className="eval-section-title" style={{ marginTop: '1rem' }}>Income &amp; Expenses</h3>
          <NumInput label="Expected Monthly Rent"        value={inputs.monthlyRent}         onChange={v => set('monthlyRent', v)}         prefix="$" min={0} step={50} />
          <NumInput label="Monthly Operating Expenses"   value={inputs.monthlyOpEx}         onChange={v => set('monthlyOpEx', v)}         prefix="$" min={0} step={25}
            help="Insurance, management fees, utilities, etc." />
          <NumInput label="Yearly Property Tax"          value={inputs.yearlyTax}           onChange={v => set('yearlyTax', v)}           prefix="$" min={0} step={100} />
          <NumInput label="Expected Annual Appreciation" value={inputs.annualAppreciation}  onChange={v => set('annualAppreciation', v)}  suffix="%" min={-20} max={30} step={0.1} />
        </div>

        {/* Right: Live metrics */}
        <div>
          <p className="stat-section-label">Investment Ratios</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'Loan-to-Value', primary: fPct(m.ltvRatio),
              primaryCls: m.ltvRatio > 0.80 ? 'text-danger' : m.ltvRatio > 0.65 ? 'text-warning' : 'text-success',
              tertiary: m.ltvRatio > 0.80 ? 'High leverage' : m.ltvRatio < 0.55 ? 'Conservative' : 'Moderate leverage',
              tooltip: 'Loan \u00f7 Purchase Price.\nHigher LTV = more risk. Lenders typically require \u226480%. Below 65% is conservative.' })}
            {mc({ label: 'Cap Rate', primary: fPct(m.capRate),
              primaryCls: m.capRate > 0.07 ? 'text-success' : m.capRate > 0.04 ? '' : 'text-danger',
              tertiary: m.capRate > 0.07 ? 'Strong yield' : m.capRate > 0.04 ? 'Moderate yield' : 'Weak yield',
              tooltip: 'Net Operating Income \u00f7 Purchase Price.\nIgnores financing \u2014 useful for comparing properties. Target: 5\u20137%+ residential.' })}
            {mc({ label: 'Cash-on-Cash', primary: fPct(m.cashOnCash),
              primaryCls: m.cashOnCash > 0.08 ? 'text-success' : m.cashOnCash > 0.04 ? '' : m.cashOnCash < 0 ? 'text-danger' : 'text-warning',
              tertiary: m.cashOnCash > 0.08 ? 'Strong' : m.cashOnCash > 0.04 ? 'Moderate' : 'Weak',
              tooltip: 'Annual Cash Flow \u00f7 Cash Invested (down payment + one-off costs).\nMeasures how efficiently your capital works. Target: 6\u201310%+.' })}
            {inputs.monthlyRent > 0 && mc({ label: 'Expense Ratio', primary: fPct(m.expenseRatio),
              primaryCls: m.expenseRatio < 0.35 ? 'text-success' : m.expenseRatio < 0.50 ? '' : 'text-danger',
              tertiary: m.expenseRatio < 0.35 ? 'Lean' : m.expenseRatio < 0.50 ? 'Normal' : 'High costs',
              tooltip: 'Total Monthly Expenses \u00f7 Effective Monthly Rent.\nIncludes mortgage, tax, operating costs, repair reserve. Below 40% is healthy.' })}
            {inputs.monthlyRent > 0 && mc({ label: 'Rent-to-Value', primary: fPct(m.rentToValue),
              primaryCls: m.rentToValue > 0.01 ? 'text-success' : m.rentToValue > 0.007 ? '' : 'text-danger',
              tertiary: m.rentToValue > 0.01 ? 'Meets 1% rule' : m.rentToValue > 0.007 ? 'Near threshold' : 'Below 1% rule',
              tooltip: 'Annual Gross Rent \u00f7 Purchase Price.\nThe "1% rule": monthly rent \u22651% of price for cash-flow-positive property.' })}
          </div>

          <p className="stat-section-label">NOI &amp; Return Projections</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'Annual NOI', primary: fmt(m.annualNetOpIncome) + '/yr',
              primaryCls: m.annualNetOpIncome >= 0 ? 'text-success' : 'text-danger',
              secondary: `${fmt(m.annualNetOpIncome / 12)}/mo`, secondaryCls: 'text-secondary',
              tooltip: 'Net Operating Income = Annual Gross Rent \u2212 (operating expenses + property tax).\nExcludes mortgage so it is financing-agnostic.' })}
            {m.grm !== null && inputs.monthlyRent > 0 && mc({ label: 'GRM', primary: m.grm.toFixed(1) + 'x',
              primaryCls: m.grm < 10 ? 'text-success' : m.grm < 15 ? '' : 'text-danger',
              tertiary: m.grm < 10 ? 'Attractive' : m.grm < 15 ? 'Moderate' : 'Expensive',
              tooltip: 'Gross Rent Multiplier = Purchase Price \u00f7 Annual Gross Rent.\nLower is better. Typical range: 8\u201312x for good cash-flow markets.' })}
            {m.irr10 !== null && mc({ label: 'IRR (10-yr)', primary: fp(m.irr10 * 100),
              primaryCls: m.irr10 > 0.15 ? 'text-success' : m.irr10 > 0.08 ? '' : m.irr10 < 0 ? 'text-danger' : 'text-warning',
              tertiary: m.irr10 > 0.15 ? 'Excellent' : m.irr10 > 0.08 ? 'Good' : m.irr10 < 0 ? 'Loss' : 'Below target',
              tooltip: 'Internal Rate of Return over a 10-year horizon.\nAccounts for time-value of money. Target: 10\u201315%+ for real estate.' })}
          </div>

          <p className="stat-section-label">Cash Flow &amp; Monthly Gain</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {mc({ label: 'Monthly Mortgage', primary: fmt(m.monthlyMortgage) + '/mo', primaryCls: 'text-danger',
              tooltip: `Standard amortization payment at ${fp(m.effectiveRate)}% over ${inputs.amortization} years.` })}
            {mc({ label: 'Total Monthly Costs', primary: fmt(m.totalMonthlyExpenses) + '/mo', primaryCls: 'text-danger',
              secondary: `Mortgage ${fmt(m.monthlyMortgage)} + OpEx ${fmt(inputs.monthlyOpEx)} + Tax ${fmt(m.monthlyTax)} + Reserve ${fmt(m.monthlyRepairReserve)}`,
              secondaryCls: 'text-secondary',
              tooltip: 'Sum of mortgage payment, operating expenses, property tax, and repair reserve.' })}
            {mc({ label: 'Avg Cash Flow', primary: fmt(m.avgCashFlow) + '/mo',
              primaryCls: m.avgCashFlow >= 0 ? 'text-success' : 'text-danger',
              secondary: scenario.vacancyRate > 0 ? `After ${scenario.vacancyRate}% vacancy` : null,
              secondaryCls: 'text-secondary',
              tooltip: 'Effective rent (after vacancy) minus total monthly costs.' })}
            {mc({ label: 'Monthly Gain', primary: fmt(m.monthlyGain) + '/mo',
              primaryCls: m.monthlyGain >= 0 ? 'text-success' : 'text-danger',
              secondary: `CF ${fmt(m.avgCashFlow)} + Appr ${fmt(m.monthlyAppr)}`,
              secondaryCls: 'text-secondary',
              tooltip: 'Cash Flow + Monthly Appreciation.\nCaptures income and value growth together.' })}
            {mc({ label: 'Payback Period', ...m.payback,
              tooltip: 'Time for cumulative cash flow to recover all cash invested (down payment + one-off costs).\nUses cash flow only — does not include appreciation.' })}
            {mc({ label: 'Break-even', ...m.breakEven,
              tooltip: 'Time until net position reaches zero — cash invested recovered via monthly gain (cash flow + appreciation).\nAlways \u2264 Payback Period since gain \u2265 cash flow.' })}
          </div>

          <ScorePanel score={m.score} />

          {/* Analysis */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.9rem 1rem', marginBottom: secondary.length ? '0.5rem' : '1.25rem',
            borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-secondary)',
          }}>
            <span style={{ fontSize: '1.4rem', lineHeight: 1, flexShrink: 0 }}>{primary.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }} className={primary.cls}>{primary.label}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.3rem', lineHeight: 1.55 }}>{primary.detail}</div>
            </div>
          </div>
          {secondary.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
              {secondary.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                  padding: '0.6rem 0.9rem', borderRadius: '8px',
                  border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                }}>
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

      {/* ── Scenario Panel ── */}
      <div className="detail-panel" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 className="eval-section-title" style={{ margin: 0 }}>
            Scenario Adjustments
            {scenarioActive && <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600 }}>● Active</span>}
          </h3>
          {scenarioActive && (
            <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
              onClick={() => setScenario({ rentDelta: 0, downPaymentDelta: 0, rateDelta: 0, vacancyRate: 0, oneOffExpense: 0, repairReserve: 1.0 })}>
              Reset
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem 2rem' }}>
          <SliderInput label="Rent adjustment" value={scenario.rentDelta}
            onChange={v => setS('rentDelta', v)} min={-30} max={30} step={1}
            format={v => `${v >= 0 ? '+' : ''}${v}%`}
            cls={scenario.rentDelta > 0 ? 'text-success' : scenario.rentDelta < 0 ? 'text-danger' : ''}
            help={`Effective rent: ${fmt(m.effectiveRent)}/mo`} />
          <SliderInput label="Down payment adjustment" value={scenario.downPaymentDelta}
            onChange={v => setS('downPaymentDelta', v)} min={-40} max={40} step={1}
            format={v => `${v >= 0 ? '+' : ''}${v}%`}
            cls={scenario.downPaymentDelta > 0 ? 'text-success' : scenario.downPaymentDelta < 0 ? 'text-danger' : ''}
            help={`Effective down payment: ${fmt(m.effectiveDownPayment)}`} />
          <SliderInput label="Interest rate stress" value={scenario.rateDelta}
            onChange={v => setS('rateDelta', v)} min={-2} max={4} step={0.25}
            format={v => `${v >= 0 ? '+' : ''}${v.toFixed(2)} pp`}
            cls={scenario.rateDelta > 0 ? 'text-danger' : scenario.rateDelta < 0 ? 'text-success' : ''}
            help={`Effective rate: ${fp(m.effectiveRate)}`} />
          <SliderInput label="Vacancy rate" value={scenario.vacancyRate}
            onChange={v => setS('vacancyRate', v)} min={0} max={30} step={1}
            format={v => `${v}%`}
            cls={scenario.vacancyRate > 8 ? 'text-danger' : scenario.vacancyRate > 3 ? 'text-warning' : ''}
            help="% of time the property sits empty" />
          <SliderInput label="One-off expense" value={scenario.oneOffExpense}
            onChange={v => setS('oneOffExpense', v)} min={0} max={50000} step={500}
            format={v => fmt(v)}
            cls={scenario.oneOffExpense > 0 ? 'text-danger' : ''}
            help="Renovation, inspection, closing costs, etc." />
          <SliderInput label="Annual repair reserve" value={scenario.repairReserve}
            onChange={v => setS('repairReserve', v)} min={0} max={3} step={0.1}
            format={v => `${v.toFixed(1)}% of value/yr`}
            cls={scenario.repairReserve < 0.5 ? 'text-warning' : ''}
            help={`${fmt(inputs.purchasePrice * scenario.repairReserve / 100)}/yr reserved`} />
        </div>
      </div>

      {/* ── 10-Year Projection ── */}
      <div className="detail-panel">
        <div className="detail-panel-title">
          <span>📅 10-Year Projection</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
            Based on {fp(inputs.annualAppreciation)}% appreciation · {fmt(m.avgCashFlow)}/mo cash flow · {fp(m.effectiveRate)}% mortgage
          </span>
        </div>
        <ProjectionTable projections={m.projections} downPayment={m.effectiveDownPayment} />
      </div>
    </>
  );
}
