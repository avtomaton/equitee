import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { yearsHeld, avgMonthly, computeMortgagePrincipal, extractRateHistory } from '../metrics';
import { getExpenses, getIncome, getEvents } from '../api';
import type { Property, Income, Expense, Event } from '../types';

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

interface MetricRowProps {
  label: string;
  values: (number | null)[];
  fmt?: (n: number) => string;
  highlight?: 'high' | 'low' | 'none';
}

function MetricRow({ label, values, fmt: fmtFn = fmt, highlight = 'high' }: MetricRowProps) {
  const nums = values.map((v: number | null) => (v == null || isNaN(v)) ? null : v);
  const valid = nums.filter((v: number | null): v is number => v !== null);
  const best  = highlight === 'none' ? null : (highlight === 'high' ? Math.max(...valid) : Math.min(...valid));
  return (
    <tr>
      <td style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', padding: '0.45rem 0.75rem', whiteSpace: 'nowrap' }}>{label}</td>
      {nums.map((v, i) => (
        <td key={i} style={{
          padding: '0.45rem 0.75rem', textAlign: 'right', fontWeight: 600,
          fontSize: '0.85rem',
          color: v === null ? 'var(--text-tertiary)' : (best !== null && v === best && valid.length > 1)
            ? (highlight === 'high' ? 'var(--success, #10b981)' : '#f59e0b')
            : 'var(--text-primary)',
        }}>
          {v === null ? '—' : fmtFn(v)}
        </td>
      ))}
    </tr>
  );
}

interface SectionProps {
  label: string;
  children: ReactNode;
}

function Section({ label, children }: SectionProps) {
  return (
    <>
      <tr style={{ background: 'var(--bg-tertiary)' }}>
        <td colSpan={99} style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', padding: '0.5rem 0.75rem' }}>{label}</td>
      </tr>
      {children}
    </>
  );
}

interface ComparisonViewProps {
  properties: Property[];
  onBack: () => void;
}

interface PropertyData {
  income: Income[];
  expenses: Expense[];
  events: Event[];
}

export default function ComparisonView({ properties, onBack }: ComparisonViewProps) {
  const [selected, setSelected] = useState<Property[]>([]);
  const [data, setData] = useState<Record<number, PropertyData>>({});

  const toggle = (p: Property) => {
    setSelected(prev => {
      const has = prev.find(x => x.id === p.id);
      if (has) return prev.filter(x => x.id !== p.id);
      if (prev.length >= 3) return prev;
      return [...prev, p];
    });
  };

  // Fetch income/expenses/events for selected properties
  useEffect(() => {
    selected.forEach(p => {
      if (data[p.id]) return;
      Promise.all([
        getIncome(p.id),
        getExpenses(p.id),
        getEvents(p.id),
      ]).then(([income, expenses, events]) => {
        setData(prev => ({ ...prev, [p.id]: { income, expenses, events } }));
      }).catch(() => {});
    });
  }, [selected.map(p => p.id).join(',')]); // eslint-disable-line

  interface MetricData {
    p: Property;
    avg: { income: number; expenses: number; cashflow: number; noi: number; noiExpenses: number };
    appr: number;
    equity: number;
    yrs: number | null;
    capRate: number | null;
    coc: number | null;
    ltv: number | null;
    oer: number | null;
    rtv: number | null;
    annualNOI: number;
    totalPrin: number;
  }

  const metrics = useMemo((): (MetricData | null)[] => {
    return selected.map(p => {
      const d = data[p.id];
      if (!d) return null;
      const { income, expenses, events } = d;
      const avg = avgMonthly(income as unknown as Array<{ income_date: string; amount: number }>, expenses as unknown as Array<{ expense_date: string; amount: number; expense_category?: string }>, 3);
      const yrs = yearsHeld(p);
      const appr = (p.market_price ?? 0) - (p.purchase_price ?? 0);
      const equity = (p.market_price ?? 0) - (p.loan_amount ?? 0);
      const annualNOI = avg.noi * 12;
      const capRate = (p.purchase_price ?? 0) > 0 ? annualNOI / p.purchase_price! * 100 : null;
      const coc = equity > 0 ? avg.cashflow * 12 / equity * 100 : null;
      const ltv = (p.market_price ?? 0) > 0 ? (p.loan_amount ?? 0) / p.market_price! * 100 : null;
      const oer = avg.income > 0 ? avg.noiExpenses / avg.income * 100 : null;
      const rtv = (p.purchase_price ?? 0) > 0 ? (p.monthly_rent ?? 0) * 12 / p.purchase_price! * 100 : null;
      const rateHist = extractRateHistory(events);
      const mortRecs = expenses.filter(r => r.expense_category === 'Mortgage');
      const amort = computeMortgagePrincipal(mortRecs as unknown as Array<{ amount: number; expense_date: string; [key: string]: unknown }>, p.loan_amount ?? 0, p.mortgage_rate ?? 0, rateHist);
      const totalPrin = amort.reduce((s: number, r: { principal: number }) => s + r.principal, 0) +
        expenses.filter(r => r.expense_category === 'Principal').reduce((s: number, r) => s + (r.amount ?? 0), 0);
      return { p, avg, appr, equity, yrs, capRate, coc, ltv, oer, rtv, annualNOI, totalPrin };
    });
  }, [selected, data]);

  const vals = (fn: (m: MetricData) => number | null) => selected.map((_, i) => metrics[i] ? fn(metrics[i]!) : null);

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back</button>
          <div>
            <h1 className="page-title">Property Comparison</h1>
            <p className="page-subtitle">Select up to 3 properties to compare side-by-side</p>
          </div>
        </div>
      </div>

      {/* Property selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {properties.map(p => {
          const sel = !!selected.find(x => x.id === p.id);
          return (
            <button key={p.id} onClick={() => toggle(p)} style={{
              padding: '0.35rem 0.75rem', borderRadius: 7, cursor: 'pointer', fontSize: '0.83rem',
              border: `1px solid ${sel ? 'var(--accent-primary)' : 'var(--border)'}`,
              background: sel ? 'rgba(59,130,246,0.12)' : 'var(--bg-secondary)',
              color: sel ? 'var(--accent-secondary, #93c5fd)' : 'var(--text-secondary)',
              fontWeight: sel ? 600 : 400,
            }}>
              {p.name}
            </button>
          );
        })}
      </div>

      {selected.length === 0 && (
        <div className="empty-state"><div className="empty-state-icon">⚖️</div><div className="empty-state-text">Select properties above to compare</div></div>
      )}

      {selected.length > 0 && (
        <div className="table-container">
          <div className="table-scroll-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 180 }}></th>
                  {selected.map(p => (
                    <th key={p.id} style={{ textAlign: 'right', minWidth: 140 }}>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>{p.city}, {p.province}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Section label="Valuation">
                  <MetricRow label="Purchase Price"   values={vals(m => m.p.purchase_price ?? null)} fmt={fmt} highlight="none" />
                  <MetricRow label="Market Value"     values={vals(m => m.p.market_price ?? null)}   fmt={fmt} />
                  <MetricRow label="Appreciation"     values={vals(m => m.appr)}              fmt={fmt} />
                  <MetricRow label="Years Held"       values={vals(m => m.yrs ? parseFloat(m.yrs.toFixed(1)) : null)} fmt={v => `${v}yr`} highlight="none" />
                </Section>
                <Section label="Debt & Equity">
                  <MetricRow label="Outstanding Loan" values={vals(m => m.p.loan_amount ?? null)}    fmt={fmt} highlight="low" />
                  <MetricRow label="Equity"           values={vals(m => m.equity)}            fmt={fmt} />
                  <MetricRow label="LTV"              values={vals(m => m.ltv)}               fmt={v => `${v.toFixed(1)}%`} highlight="low" />
                  <MetricRow label="Principal Repaid" values={vals(m => m.totalPrin)}         fmt={fmt} />
                </Section>
                <Section label="Income & Cash Flow (3mo avg)">
                  <MetricRow label="Monthly Rent"     values={vals(m => m.p.monthly_rent ?? null)}   fmt={fmt} />
                  <MetricRow label="Avg Income"       values={vals(m => m.avg.income)}        fmt={fmt} />
                  <MetricRow label="Avg Expenses"     values={vals(m => m.avg.expenses)}      fmt={fmt} highlight="low" />
                  <MetricRow label="Cash Flow"        values={vals(m => m.avg.cashflow)}      fmt={fmt} />
                  <MetricRow label="NOI (monthly)"    values={vals(m => m.avg.noi)}           fmt={fmt} />
                </Section>
                <Section label="Investment Ratios">
                  <MetricRow label="Cap Rate"         values={vals(m => m.capRate)}           fmt={v => `${v.toFixed(2)}%`} />
                  <MetricRow label="Cash-on-Cash"     values={vals(m => m.coc)}               fmt={v => `${v.toFixed(2)}%`} />
                  <MetricRow label="OER"              values={vals(m => m.oer)}               fmt={v => `${v.toFixed(1)}%`} highlight="low" />
                  <MetricRow label="Rent-to-Value"    values={vals(m => m.rtv)}               fmt={v => `${v.toFixed(2)}%`} />
                  <MetricRow label="Mortgage Rate"    values={vals(m => m.p.mortgage_rate ?? null)}   fmt={v => `${v}%`} highlight="low" />
                </Section>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
