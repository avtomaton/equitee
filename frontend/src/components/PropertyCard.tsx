import type { ReactNode } from 'react';
import StarRating from './StarRating';
import { yearsHeld, calcSimpleHealth, calcExpected, calcEconVacancy } from '../metrics';
import { trailingYear } from '../utils';
import type { Property, Event } from '../types';

function HealthBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  let bg: string, color: string, label: string;
  if (score >= 70) { bg = 'rgba(16,185,129,0.15)'; color = '#10b981'; label = '● Healthy'; }
  else if (score >= 40) { bg = 'rgba(245,158,11,0.15)'; color = '#f59e0b'; label = '● Average'; }
  else { bg = 'rgba(239,68,68,0.15)'; color = '#ef4444'; label = '● Needs Attention'; }
  return <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.18rem 0.55rem', borderRadius: '20px', background: bg, color, letterSpacing: '0.03em' }}>{label}</span>;
}

interface PropertyCardProps {
  property: Property;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onEdit?: (property: Property) => void;
  avgCashFlow: number | null;
  avgNOI: number | null;
  events?: Event[];
}

export default function PropertyCard({ property, onClick, onEdit, avgCashFlow, avgNOI, events = [] }: PropertyCardProps) {
  const mp = property.market_price ?? 0;
  const la = property.loan_amount ?? 0;
  const pp = property.purchase_price ?? 0;
  const ti = property.total_income ?? 0;
  const te = property.total_expenses ?? 0;
  const equity = mp - la;
  const equityPct = mp > 0 ? (equity / mp * 100).toFixed(1) : null;
  const appreciation = mp - pp;
  const apprPct = pp > 0 ? (appreciation / pp * 100).toFixed(1) : null;
  const sellingProfit = mp + ti - te - la;
  const sellingPct = te > 0 ? (sellingProfit / te * 100).toFixed(1) : null;
  const balance = ti - te;

  const yrs = yearsHeld(property);
  const yearlyAppr = yrs ? appreciation / yrs : null;
  const yearlyApprPct = (yrs && pp > 0 && yearlyAppr !== null) ? (yearlyAppr / pp * 100).toFixed(1) : null;
  const monthlyAppr = yearlyAppr !== null ? yearlyAppr / 12 : 0;
  const monthlyGain = avgCashFlow != null ? avgCashFlow + monthlyAppr : null;

  const { start: ytdStart, end: ytdEnd } = trailingYear();
  const econVacancy = calcEconVacancy(property as unknown as { status?: string; monthly_rent: number; poss_date?: string }, events as unknown as Array<{ column_name?: string; new_value?: string | number | null; old_value?: string | number | null; created_at?: string }>, ytdStart, ytdEnd);

  const timeToProfit = (() => {
    if (sellingProfit <= 0) return { label: '\u2014', cls: '' };
    if (avgCashFlow == null || avgCashFlow <= 0) return { label: (avgCashFlow ?? 0) < 0 ? '\u221e' : '\u2014', cls: 'text-danger' };
    const mo = sellingProfit / avgCashFlow;
    return { label: mo < 12 ? `${Math.round(mo)} mo` : `${(mo / 12).toFixed(1)} yr`, cls: mo < 24 ? 'text-success' : mo < 60 ? '' : 'text-danger' };
  })();

  const investmentScore = calcSimpleHealth(property as unknown as { poss_date?: string; purchase_price: number; loan_amount: number; total_income: number; total_expenses: number; market_price: number; monthly_rent: number });
  const expected = calcExpected(property as unknown as Record<string, unknown>, 0);

  const eqCls = equityPct !== null ? (parseFloat(equityPct) >= 50 ? 'text-success' : parseFloat(equityPct) >= 25 ? 'text-warning' : 'text-danger') : '';
  const fmtFunc = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const handleEdit = (e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onEdit?.(property); };

  const Row = ({ label, value, valueCls = '', pct = null, pctCls = '' }: { label: string; value: string | ReactNode; valueCls?: string; pct?: string | null; pctCls?: string }) => (
    <div className="pc-row"><span className="pc-label">{label}</span><span className="pc-right"><span className={`pc-value ${valueCls}`}>{value}</span>{pct != null && pct !== '' && <span className={`pc-pct ${pctCls}`}>{pct}</span>}</span></div>
  );
  const Div = () => <div className="pc-divider" />;

  return (
    <div className="property-card" onClick={onClick}>
      {onEdit && (<div className="card-actions"><button className="btn btn-secondary btn-icon btn-small" onClick={handleEdit} title="Edit">✏️</button></div>)}
      <div className="property-card-header">
        <div><div className="property-name">{property.name}</div><div className="property-address">{property.city}, {property.province}</div></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-end' }}>
          <div className={`property-badge ${(property.status ?? '').toLowerCase()}`}>{property.status}</div>
          {investmentScore && <HealthBadge score={investmentScore.score} />}
        </div>
      </div>
      {investmentScore && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0 0.1rem', borderBottom: '1px solid var(--border)', marginBottom: '0.4rem' }}>
          <StarRating starsData={investmentScore.starsData} size="1.1rem" />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{investmentScore.score}/100</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 600 }} className={investmentScore.cls}>{investmentScore.label}</span>
        </div>
      )}
      <div className="pc-body">
        <Row label="Market Value" value={fmtFunc(mp)} />
        <Row label="Equity" value={fmtFunc(equity)} valueCls={equity >= 0 ? 'text-success' : 'text-danger'} pct={equityPct !== null ? `${equityPct}%` : null} pctCls={eqCls} />
        <Div />
        {(property.monthly_rent ?? 0) > 0 && <Row label="Rent/mo" value={fmtFunc(property.monthly_rent ?? 0)} />}
        {avgNOI != null && (() => {
          const cls = avgNOI >= 0 ? 'text-success' : 'text-danger';
          const expNOI = expected?.monthlyNOI;
          const expCls = expNOI != null ? (expNOI >= 0 ? 'text-success' : 'text-danger') : undefined;
          const pctLabel = expNOI != null
            ? <span className={expCls} style={{ fontSize: '0.72rem' }}>exp {fmtFunc(expNOI)}</span>
            : ((property.monthly_rent ?? 0) > 0 ? <span style={{ fontSize: '0.72rem', opacity: 0.6 }}>of {fmtFunc(property.monthly_rent ?? 0)} rent</span> : null);
          return (<div className="pc-row"><span className="pc-label">Avg NOI/mo</span><span className="pc-right"><span className={`pc-value ${cls}`}>{fmtFunc(avgNOI)}</span>{pctLabel && <span className="pc-pct">{pctLabel}</span>}</span></div>);
        })()}
        {econVacancy !== null && <Row label="Econ. Vacancy" value={`${econVacancy.toFixed(1)}%`} valueCls={econVacancy > 10 ? 'text-danger' : econVacancy > 4 ? 'text-warning' : 'text-success'} />}
        {avgCashFlow != null && <Row label="Avg Cash Flow" value={fmtFunc(avgCashFlow) + '/mo'} valueCls={avgCashFlow >= 0 ? 'text-success' : 'text-danger'} />}
        {monthlyGain !== null && <Row label="Monthly Gain" value={fmtFunc(monthlyGain) + '/mo'} valueCls={monthlyGain >= 0 ? 'text-success' : 'text-danger'} />}
        <Div />
        <Row label="Sell Profit" value={fmtFunc(sellingProfit)} valueCls={sellingProfit >= 0 ? 'text-success' : 'text-danger'} pct={sellingPct !== null ? `${sellingPct}%` : null} pctCls={sellingProfit >= 0 ? 'text-success' : 'text-danger'} />
        <Row label="Time to Profit" value={timeToProfit.label} valueCls={timeToProfit.cls} />
        {avgNOI != null && pp > 0 && (() => {
          const capRate = avgNOI * 12 / pp;
          const capCls = capRate > 0.07 ? 'text-success' : capRate > 0.04 ? '' : 'text-danger';
          const expCap = expected?.capRate;
          const expCls = expCap != null ? (expCap > 0.07 ? 'text-success' : expCap > 0.04 ? '' : 'text-danger') : null;
          return (<Row label="Cap Rate" value={`${(capRate * 100).toFixed(1)}%`} valueCls={capCls} pct={expCap != null ? `exp ${(expCap * 100).toFixed(1)}%` : null} pctCls={expCls || ''} />);
        })()}
        <Div />
        <Row label="Income" value={fmtFunc(ti)} valueCls="text-success" />
        <Row label="Expenses" value={fmtFunc(te)} valueCls="text-danger" />
        <Row label="Balance" value={fmtFunc(balance)} valueCls={balance >= 0 ? 'text-success' : 'text-danger'} />
        <Div />
        <Row label="Appreciation" value={fmtFunc(appreciation)} valueCls={appreciation >= 0 ? 'text-success' : 'text-danger'} pct={apprPct !== null ? `${apprPct}%` : null} pctCls={appreciation >= 0 ? 'text-success' : 'text-danger'} />
        {yearlyAppr !== null && <Row label="Yearly Appr." value={fmtFunc(yearlyAppr) + '/yr'} valueCls={yearlyAppr >= 0 ? 'text-success' : 'text-danger'} pct={yearlyApprPct !== null ? `${yearlyApprPct}%/yr` : null} pctCls={yearlyAppr >= 0 ? 'text-success' : 'text-danger'} />}
      </div>
    </div>
  );
}
