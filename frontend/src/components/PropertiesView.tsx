import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import MultiSelect from './MultiSelect';
import TruncatedCell from './Tooltip';
import Collapsible from './Collapsible';
import Analytics from './Analytics';
import KPICard from './KPICard';
import ResetColumnsButton from './ResetColumnsButton';
import { INITIAL_OPTIONS, PROVINCES, COLUMN_DEFS } from '../config';
import { mergeOptions, trailingYear, makeInTrailingYear } from '../utils';
import { calcSimpleHealth, principalInRange, calcExpected, calcPortfolioInterest, extractRateHistory } from '../metrics';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import usePropertyTransactions from '../hooks/usePropertyTransactions';
import { archiveProperty, restoreProperty, getProperties } from '../api';
import { fmt, ltvColor } from './uiHelpers';
import type { Property, Income, Expense, Event } from '../types';

// Local interfaces specific to PropertiesView that extend base types
interface SummaryMetrics {
  ytdOpProfit: number;
  avgCF: number;
  oer: number | null;
  icr: number | null;
  expICR: number | null;
}

interface SmartTip {
  icon: string;
  cls: string;
  label: string;
  detail: string;
}

interface PropertiesViewProps {
  properties: Property[];
  onPropertyClick: (property: Property) => void;
  onAddProperty: () => void;
  onEditProperty: (property: Property) => void;
  onReloadProperties: () => void;
  onError?: (message: string) => void;
}

// Type aliases for local use with the specific property_id type
export type IncomeRecord = Income;
export type ExpenseRecord = Expense;
export type EventRecord = Event;

// Safe accessors for optional Property fields
const mp = (p: Property) => p.market_price ?? 0;
const la = (p: Property) => p.loan_amount ?? 0;
const pp = (p: Property) => p.purchase_price ?? 0;
const ti = (p: Property) => p.total_income ?? 0;
const te = (p: Property) => p.total_expenses ?? 0;
const mr = (p: Property) => p.monthly_rent ?? 0;
const pCity = (p: Property) => p.city ?? '';
const pProv = (p: Property) => p.province ?? '';
const pStatus = (p: Property) => p.status ?? '';
const pType = (p: Property) => p.type ?? '';

// ── Archived section ──────────────────────────────────────────────────────────
function ArchivedPropertiesSection({ archivedProps, onRestore }: { archivedProps: Property[]; onRestore: (id: number | string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="table-container" style={{ marginTop: '1.25rem' }}>
      <div className="table-header" onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', userSelect: 'none' }}>
        <div className="table-title" style={{ color: 'var(--text-tertiary)' }}>
          🗄 Archived Properties ({archivedProps.length})
        </div>
        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
          {open ? '▲ collapse' : '▼ expand'}
        </span>
      </div>
      {open && (
        archivedProps.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <div className="empty-state-text">No archived properties</div>
          </div>
        ) : (
          <div className="table-scroll-wrap"><table>
            <thead><tr>
              <th className="col-fill">Name</th><th>Type</th><th>Location</th><th>Status</th>
              <th>Market Value</th><th>Rent/mo</th><th>Notes</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {archivedProps.map(p => (
                <tr key={p.id} style={{ opacity: 0.65 }}>
                  <td><strong>{p.name}</strong></td>
                  <td>{pType(p) || '—'}</td>
                   <td style={{ color: 'var(--text-secondary)' }}>{pCity(p)}, {pProv(p)}</td>
                   <td><span className={`property-badge ${(pStatus(p) || '').toLowerCase()}`}>{pStatus(p) || ''}</span></td>
                   <td>{fmt(mp(p))}</td>
                   <td>{mr(p) ? fmt(mr(p)) : '—'}</td>
                   <td><TruncatedCell text={p.notes || ''} /></td>
                  <td>
                    <button className="btn btn-secondary btn-small" onClick={() => onRestore(p.id)}>
                      ↩ Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function PropertiesView({ properties, onPropertyClick, onAddProperty, onEditProperty, onReloadProperties, onError }: PropertiesViewProps) {
  const { visible, update: setVisible, col, isCustom, reset } = useColumnVisibility('properties');
  const allColKeys = COLUMN_DEFS.properties.map(d => d.key);
  const allColLabels = Object.fromEntries(COLUMN_DEFS.properties.map(d => [d.key, d.label]));

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'market_price' | 'monthly_rent' | 'total_income' | 'total_expenses' | 'net' | 'roi'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [archivedProps, setArchivedProps] = useState<Property[]>([]);

  // Income/expense records fetched once and shared with Analytics
  const { allIncome, allExpenses, allEvents } = usePropertyTransactions(properties);

  // Derived filter options
  const allStatuses = useMemo(() => mergeOptions(INITIAL_OPTIONS.propertyStatuses, properties.map(p => pStatus(p))), [properties]);
  const allTypes = useMemo(() => mergeOptions(INITIAL_OPTIONS.propertyTypes, properties.map(p => pType(p)).filter(Boolean)), [properties]);
  const allProvinces = useMemo(() => mergeOptions(PROVINCES, properties.map(p => pProv(p))), [properties]);
  const allCities = useMemo(() => [...new Set(properties.map(p => pCity(p)))].sort(), [properties]);

  const [filterStatuses, setFilterStatuses] = useState<string[]>(() => allStatuses);
  const [filterTypes, setFilterTypes] = useState<string[]>(() => allTypes);
  const [filterProvinces, setFilterProvinces] = useState<string[]>(() => allProvinces);
  const [filterCities, setFilterCities] = useState<string[]>(() => allCities);

  // Track which values have been seen; only truly new values are appended to
  // the selected set so that a user's deliberate deselection survives a data reload.
  const seenStatusesRef = useRef<Set<string> | null>(null);
  const seenTypesRef = useRef<Set<string> | null>(null);
  const seenProvincesRef = useRef<Set<string> | null>(null);
  const seenCitiesRef = useRef<Set<string> | null>(null);

  if (!seenStatusesRef.current) seenStatusesRef.current = new Set(allStatuses);
  if (!seenTypesRef.current) seenTypesRef.current = new Set(allTypes);
  if (!seenProvincesRef.current) seenProvincesRef.current = new Set(allProvinces);
  if (!seenCitiesRef.current) seenCitiesRef.current = new Set(allCities);

  useEffect(() => {
    const newOnes = allStatuses.filter(v => v && !seenStatusesRef.current!.has(v));
    if (newOnes.length) {
      newOnes.forEach(v => seenStatusesRef.current!.add(v));
      setFilterStatuses(p => [...p, ...newOnes]);
    }
  }, [allStatuses]);

  useEffect(() => {
    const newOnes = allTypes.filter(v => v && !seenTypesRef.current!.has(v));
    if (newOnes.length) {
      newOnes.forEach(v => seenTypesRef.current!.add(v));
      setFilterTypes(p => [...p, ...newOnes]);
    }
  }, [allTypes]);

  useEffect(() => {
    const newOnes = allProvinces.filter(v => v && !seenProvincesRef.current!.has(v));
    if (newOnes.length) {
      newOnes.forEach(v => seenProvincesRef.current!.add(v));
      setFilterProvinces(p => [...p, ...newOnes]);
    }
  }, [allProvinces]);

  useEffect(() => {
    const newOnes = allCities.filter(v => v && !seenCitiesRef.current!.has(v));
    if (newOnes.length) {
      newOnes.forEach(v => seenCitiesRef.current!.add(v));
      setFilterCities(p => [...p, ...newOnes]);
    }
  }, [allCities]);

  const loadArchived = useCallback(() => {
    getProperties(true)
      .then(all => setArchivedProps(all.filter(p => p.is_archived)))
      .catch(() => {});
  }, []);

  useEffect(() => { loadArchived(); }, [loadArchived]);

  const handleArchive = async (id: number | string) => {
    if (!confirm('Archive this property? It will be hidden from all views but can be restored.')) return;
    try {
      await archiveProperty(Number(id));
      onReloadProperties();
      loadArchived();
    } catch {
      (onError || alert)('Failed to archive property');
    }
  };

  const handleRestore = async (id: number | string) => {
    try {
      await restoreProperty(Number(id));
      onReloadProperties();
      loadArchived();
    } catch {
      (onError || alert)('Failed to restore property');
    }
  };

  // Pre-compute health scores once — avoids O(n log n) recalculations in sort
  const healthScores = useMemo(() => {
    const map: Record<string, number> = {};
    properties.forEach(p => { map[p.id] = calcSimpleHealth(p as unknown as { poss_date?: string; purchase_price: number; loan_amount: number; total_income: number; total_expenses: number; market_price: number; monthly_rent: number }).score; });
    return map;
  }, [properties]);

  const filtered = useMemo(() => {
    let list = properties.filter(p => {
      const q = searchTerm.toLowerCase();
      if (q && !p.name.toLowerCase().includes(q) &&
              !pCity(p).toLowerCase().includes(q) &&
               !(p.address || '').toLowerCase().includes(q)) return false;
      if (!filterStatuses.includes(pStatus(p))) return false;
      if (pType(p) && !filterTypes.includes(pType(p))) return false;
      if (!filterProvinces.includes(pProv(p))) return false;
      if (allCities.length && !filterCities.includes(pCity(p))) return false;
      return true;
    });
    list.sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'score':
          return dir * ((healthScores[a.id] ?? 0) - (healthScores[b.id] ?? 0));
        case 'market_price':
          return dir * (mp(a) - mp(b));
        case 'monthly_rent':
          return dir * (mr(a) - mr(b));
        case 'total_income':
          return dir * (ti(a) - ti(b));
        case 'total_expenses':
          return dir * (te(a) - te(b));
        case 'net':
          return dir * ((ti(a) - te(a)) - (ti(b) - te(b)));
        case 'roi': {
          const rA = mp(a) ? (ti(a) - te(a)) / mp(a) : 0;
          const rB = mp(b) ? (ti(b) - te(b)) / mp(b) : 0;
          return dir * (rA - rB);
        }
        default:
          return 0;
      }
    });
    return list;
  }, [properties, searchTerm, filterStatuses, filterTypes, filterProvinces, filterCities, sortBy, sortOrder, allCities.length, healthScores]);

  // Per-property all-time principal for table rows
  const perPropPrincipal = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of filtered) {
      const pe = allExpenses.filter(r => r.property_id === p.id);
      const rateHist = extractRateHistory(allEvents[p.id] ?? []);
      map[p.id] = principalInRange(pe as unknown as Array<{ expense_category?: string; expense_date: string; amount: number }>, la(p), p.mortgage_rate || 0, new Date(0), new Date(), rateHist);
    }
    return map;
  }, [properties, allExpenses, allEvents]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalValue = filtered.reduce((s, p) => s + mp(p), 0);
  const totalPurchase = filtered.reduce((s, p) => s + pp(p), 0);
  const totalIncome = filtered.reduce((s, p) => s + ti(p), 0);
  const totalExpenses = filtered.reduce((s, p) => s + te(p), 0);
  const totalLoan = filtered.reduce((s, p) => s + la(p), 0);
  const totalBalance = totalIncome - totalExpenses;
  const totalEquity = totalValue - totalLoan;
  const totalAppr = totalValue - totalPurchase;
  const totalApprPct = totalPurchase > 0 ? totalAppr / totalPurchase * 100 : null;
  const ltvPct = totalValue > 0 ? totalLoan / totalValue * 100 : null;
  const netPosition = totalValue + totalIncome - totalExpenses - totalLoan;
  const npPct = totalBalance !== 0 ? (netPosition / Math.abs(totalBalance) * 100) : null;
  const occupiedCount = filtered.filter(p => pStatus(p) !== 'Vacant').length;
  const occupancyPct = filtered.length > 0 ? occupiedCount / filtered.length * 100 : 0;
  const ltvColors = ltvColor(ltvPct ?? 0);

  // YTD operating profit (3M avg CF, OER) — computed from lifted income/expense data
  const summaryMetrics = useMemo<SummaryMetrics | null>(() => {
    if (!filtered.length) return null;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const { start: ytdStart, end: ytdEnd } = trailingYear();
    const win3Start = new Date(monthStart);
    win3Start.setMonth(win3Start.getMonth() - 3);

    const inYTD = makeInTrailingYear();
    const in3M = (d: string | null) => {
      if (!d) return false;
      const [y, m, dd] = d.split('-').map(Number);
      const dt = new Date(y, m - 1, dd);
      return dt >= win3Start && dt < monthStart;
    };

    const filteredIds = new Set(filtered.map(p => p.id));
    const filtInc = allIncome.filter(r => filteredIds.has(r.property_id));
    const filtExp = allExpenses.filter(r => filteredIds.has(r.property_id));

    const ytdInc = filtInc.filter(r => inYTD(r.income_date ?? null)).reduce((s, r) => s + (r.amount ?? 0), 0);
    const ytdExp = filtExp.filter(r => inYTD(r.expense_date ?? null)).reduce((s, r) => s + (r.amount ?? 0), 0);
    const ytdPrin = filtered.reduce((sum, p) => {
      const pe = filtExp.filter(r => r.property_id === p.id);
      const rateHist = extractRateHistory(allEvents[p.id] ?? []);
      return sum + principalInRange(pe as unknown as Array<{ expense_category?: string; expense_date: string; amount: number }>, la(p), p.mortgage_rate || 0, ytdStart, ytdEnd, rateHist);
    }, 0);
    const ytdOpProfit = ytdInc - (ytdExp - ytdPrin);

    const inc3 = filtInc.filter(r => in3M(r.income_date ?? null)).reduce((s, r) => s + (r.amount ?? 0), 0);
    const exp3 = filtExp.filter(r => in3M(r.expense_date ?? null)).reduce((s, r) => s + (r.amount ?? 0), 0);
    const noi3 = filtExp.filter(r => in3M(r.expense_date ?? null) && !['Mortgage', 'Principal'].includes(r.expense_category ?? '')).reduce((s, r) => s + (r.amount ?? 0), 0);
    const avgCF = (inc3 - exp3) / 3;
    const oer = inc3 > 0 ? noi3 / inc3 : null;

    // Interest Coverage Ratio
    const totalAnnualInterest = calcPortfolioInterest(filtered);
    const annualNOI3 = (inc3 - noi3) / 3 * 12; // avg monthly NOI × 12
    const icr = totalAnnualInterest > 0 ? annualNOI3 / totalAnnualInterest : null;
    const expNOIAnnual = filtered.reduce((sum, p) => {
      const e = calcExpected(p as unknown as Record<string, unknown>, 0); // mortgage excluded — ICR uses interest, not debt service
      return e ? sum + e.monthlyNOI * 12 : sum;
    }, 0);
    const expICR = totalAnnualInterest > 0 && expNOIAnnual > 0
      ? expNOIAnnual / totalAnnualInterest
      : null;

    return { ytdOpProfit, avgCF, oer, icr, expICR };
  }, [filtered, allIncome, allExpenses, allEvents]);

  // ── Smart tips ────────────────────────────────────────────────────────────
  const smartTips = useMemo<SmartTip[]>(() => {
    const tips: SmartTip[] = [];
    if (!filtered.length) return tips;

    const vacant = filtered.filter(p => pStatus(p) === 'Vacant');
    const negative = filtered.filter(p => {
      const dp = pp(p) - la(p);
      return ti(p) > 0 && (ti(p) - (te(p) - dp)) < 0;
    });
    const highLTV = filtered.filter(p => pp(p) > 0 && la(p) / pp(p) > 0.80);
    const noRent = filtered.filter(p => !mr(p) && pStatus(p) === 'Rented');
    const scores = filtered.map(p => ({ p, s: calcSimpleHealth(p as unknown as { poss_date?: string; purchase_price: number; loan_amount: number; total_income: number; total_expenses: number; market_price: number; monthly_rent: number }) }));
    const bottomTwo = [...scores].sort((a, b) => a.s.score - b.s.score).slice(0, 2);
    const strongOnes = scores.filter(x => x.s.score >= 70);
    const highNPLowCF = filtered.filter(p =>
      mp(p) + ti(p) - te(p) - la(p) > mp(p) * 0.10 &&
      ti(p) > 0 && (ti(p) - te(p)) < 0
    );
    const occPct = filtered.filter(p => pStatus(p) !== 'Vacant').length / filtered.length * 100;

    if (vacant.length > 0) {
      const lostRent = vacant.reduce((s, p) => s + (mr(p) || 0), 0);
      tips.push({
        icon: '🏠',
        cls: 'text-danger',
        label: `${vacant.length} vacant propert${vacant.length > 1 ? 'ies' : 'y'}`,
        detail: lostRent > 0
          ? `Losing up to ${fmt(lostRent)}/mo in potential rent. Prioritise filling vacancies to improve cash flow.`
          : `${vacant.length} propert${vacant.length > 1 ? 'ies' : 'y'} with no rental income.`
      });
    }
    if (highNPLowCF.length > 0) {
      const names = highNPLowCF.map(p => p.name).join(', ');
      const totalNP = highNPLowCF.reduce((s, p) => s + mp(p) + ti(p) - te(p) - la(p), 0);
      tips.push({
        icon: '💡',
        cls: 'text-warning',
        label: 'Strong net position, weak cash flow',
        detail: `${names} ${highNPLowCF.length > 1 ? 'have' : 'has'} a combined net position of ${fmt(totalNP)} but ${highNPLowCF.length > 1 ? 'are' : 'is'} cash-flow-negative.`
      });
    }
    if (negative.length > 0) {
      tips.push({
        icon: '📉',
        cls: 'text-danger',
        label: `${negative.length} cash-flow-negative propert${negative.length > 1 ? 'ies' : 'y'}`,
        detail: `${negative.map(p => p.name).join(', ')} ${negative.length > 1 ? 'are' : 'is'} generating more expenses than income.`
      });
    }
    if (highLTV.length > 0) {
      tips.push({
        icon: '⚡',
        cls: 'text-warning',
        label: `${highLTV.length} high-leverage propert${highLTV.length > 1 ? 'ies' : 'y'}`,
        detail: `${highLTV.map(p => p.name).join(', ')} ${highLTV.length > 1 ? 'have' : 'has'} LTV above 80%.`
      });
    }
    if (occPct < 80 && filtered.length > 1) {
      tips.push({
        icon: '📊',
        cls: 'text-warning',
        label: `Occupancy at ${occPct.toFixed(0)}%`,
        detail: `Only ${filtered.filter(p => pStatus(p) !== 'Vacant').length} of ${filtered.length} properties are occupied. Industry target is 90%+.`
      });
    }
    if (noRent.length > 0) {
      tips.push({
        icon: '⚠️',
        cls: 'text-warning',
        label: `${noRent.length} rented propert${noRent.length > 1 ? 'ies' : 'y'} missing rent amount`,
        detail: `Set monthly rent on ${noRent.map(p => p.name).join(', ')} to enable cap rate and vacancy calculations.`
      });
    }
    if (bottomTwo.length > 0 && filtered.length > 2) {
      tips.push({
        icon: '🔻',
        cls: 'text-warning',
        label: 'Lowest-scoring properties',
        detail: `${bottomTwo.map(x => `${x.p.name} (${x.s.score}/100)`).join(', ')}. Click to see detailed insights.`
      });
    }
    if (strongOnes.length > 0) {
      tips.push({
        icon: '🚀',
        cls: 'text-success',
        label: `${strongOnes.length} healthy propert${strongOnes.length > 1 ? 'ies' : 'y'}`,
        detail: `${strongOnes.map(x => x.p.name).join(', ')} score 70+ — strong performers.`
      });
    }
    if (!tips.length) {
      tips.push({
        icon: '✅',
        cls: 'text-success',
        label: 'Portfolio looks healthy',
        detail: 'No major issues detected across the filtered properties.'
      });
    }
    return tips;
  }, [filtered]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Properties
            {filtered.length < properties.length && (
              <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: '0.6rem' }}>
                ({filtered.length}/{properties.length})
              </span>
            )}
          </h1>
          <p className="page-subtitle">Manage your real estate portfolio</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={onAddProperty}>+ Add Property</button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <KPICard label="Portfolio Value" primary={fmt(totalValue)}
          secondary={totalAppr !== 0
            ? (totalAppr >= 0 ? '+' : '') + fmt(totalAppr) + (totalApprPct !== null ? ' (' + totalApprPct.toFixed(1) + '%)' : '')
            : undefined}
          secondaryCls={totalAppr >= 0 ? 'text-success' : 'text-danger'}
          accentColor="#3b82f6"
          tooltip={`Sum of current market values.\nTotal appreciation: ${fmt(totalAppr)} (${totalApprPct !== null ? totalApprPct.toFixed(1) + '%' : 'n/a'} over purchase price of ${fmt(totalPurchase)}).`} />

        <KPICard label="Equity" primary={fmt(totalEquity)}
          primaryCls={totalEquity >= 0 ? 'text-success' : 'text-danger'}
          secondary={ltvPct !== null ? `LTV ${ltvPct.toFixed(0)}%` : undefined}
          secondaryCls={ltvColors.cls}
          accentColor={totalEquity >= 0 ? '#10b981' : '#ef4444'}
          tooltip="Your ownership stake across filtered properties.\nFormula: Total Market Value − Total Loans.\nLTV = Total Loans ÷ Market Value." />

        <KPICard label="Net Position" primary={fmt(netPosition)}
          primaryCls={netPosition >= 0 ? 'text-success' : 'text-danger'}
          secondary={npPct !== null ? npPct.toFixed(1) + '% of net spending' : undefined}
          secondaryCls={npPct !== null ? (npPct >= 0 ? 'text-success' : 'text-danger') : ''}
          accentColor={netPosition >= 0 ? '#10b981' : '#ef4444'}
          tooltip="What you'd walk away with selling all filtered properties and clearing their mortgages today.\nFormula: Portfolio Value + All Income − All Expenses − All Loans." />

        <KPICard label="Occupancy"
          primary={filtered.length ? `${occupancyPct.toFixed(0)}%` : '—'}
          primaryCls={occupancyPct >= 90 ? 'text-success' : occupancyPct >= 70 ? '' : 'text-danger'}
          secondary={`${occupiedCount}/${filtered.length} properties`}
          accentColor={occupancyPct >= 90 ? '#10b981' : occupancyPct >= 70 ? '#f59e0b' : '#ef4444'}
          tooltip="Share of filtered properties currently occupied (not marked Vacant).\nTarget 90%+." />

        <KPICard label="Avg Cash Flow"
          primary={summaryMetrics ? fmt(summaryMetrics.avgCF) : '…'}
          primaryCls={!summaryMetrics ? '' : summaryMetrics.avgCF >= 0 ? 'text-success' : 'text-danger'}
          tertiary="3-month avg"
          accentColor={!summaryMetrics ? '#6b7280' : summaryMetrics.avgCF >= 0 ? '#10b981' : '#ef4444'}
          tooltip="Average monthly profit per property over the last 3 months." />

        <KPICard label="OER"
          primary={summaryMetrics && summaryMetrics.oer !== null ? `${(summaryMetrics.oer * 100).toFixed(1)}%` : '…'}
          primaryCls={!summaryMetrics || summaryMetrics.oer === null ? '' : summaryMetrics.oer < 0.35 ? 'text-success' : summaryMetrics.oer < 0.5 ? '' : 'text-danger'}
          tertiary="3-month avg"
          accentColor={!summaryMetrics || summaryMetrics.oer === null ? '#6b7280' : summaryMetrics.oer < 0.35 ? '#10b981' : summaryMetrics.oer < 0.5 ? '#f59e0b' : '#ef4444'}
          tooltip="Operating Expense Ratio: what fraction of income is consumed by operating costs (excl. mortgage). 3-month average." />

        <KPICard label="ICR"
          primary={summaryMetrics?.icr != null ? summaryMetrics.icr.toFixed(2) + 'x' : '…'}
          primaryCls={!summaryMetrics?.icr ? '' : summaryMetrics.icr >= 2 ? 'text-success' : summaryMetrics.icr >= 1.25 ? '' : 'text-danger'}
          secondary={summaryMetrics?.expICR != null ? `Exp: ${summaryMetrics.expICR.toFixed(2)}x` : undefined}
          secondaryCls={summaryMetrics?.expICR != null
            ? (summaryMetrics.expICR >= 2 ? 'text-success' : summaryMetrics.expICR >= 1.25 ? '' : 'text-danger')
            : ''}
          tertiary="3-month avg"
          accentColor={!summaryMetrics?.icr ? '#6b7280' : summaryMetrics.icr >= 2 ? '#10b981' : summaryMetrics.icr >= 1.25 ? '#f59e0b' : '#ef4444'}
          tooltip={'Interest Coverage Ratio = annualised NOI ÷ total annual interest (loan × rate).\n≥ 2.0x: strong. 1.25–2.0x: adequate. < 1.25x: tight.\nExp uses budgeted operating costs.'} />

        <KPICard label="Op. Profit"
          primary={summaryMetrics ? fmt(summaryMetrics.ytdOpProfit) : '…'}
          primaryCls={!summaryMetrics ? '' : summaryMetrics.ytdOpProfit >= 0 ? 'text-success' : 'text-danger'}
          tertiary="YTD"
          accentColor={!summaryMetrics ? '#6b7280' : summaryMetrics.ytdOpProfit >= 0 ? '#10b981' : '#ef4444'}
          tooltip="Trailing 12-month income minus operating expenses (principal excluded)." />
      </div>

      {/* ── Insights ── */}
      {smartTips.length > 0 && (
        <Collapsible title="💡 Portfolio Insights" defaultOpen={false}>
          <div style={{ padding: '0.5rem 1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {smartTips.map((tip, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                padding: '0.55rem 0.85rem', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
              }}>
                <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0, marginTop: '0.1rem' }}>{tip.icon}</span>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.82rem' }} className={tip.cls}>{tip.label} </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tip.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {/* ── Analytics ── */}
      {properties.length > 0 && (
        <Collapsible title="📈 Analytics" defaultOpen={false}>
          <Analytics filtered={filtered} allIncome={allIncome} allExpenses={allExpenses} allEvents={allEvents} />
        </Collapsible>
      )}

      {/* ── Properties table ── */}
      <div className="table-container">
        <div className="table-header">
          <div className="table-title">All Properties ({filtered.length})</div>
        </div>

        <div style={{
          padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border)',
          display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center',
        }}>
          <input type="text" placeholder="Search…" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: 150, fontSize: '0.82rem', padding: '0.38rem 0.6rem' }} />
          <MultiSelect label="Status" options={allStatuses} selected={filterStatuses} onChange={setFilterStatuses} />
          <MultiSelect label="Type" options={allTypes} selected={filterTypes} onChange={setFilterTypes} />
          <MultiSelect label="Province" options={allProvinces} selected={filterProvinces} onChange={setFilterProvinces} />
          {allCities.length > 0 && (
            <MultiSelect label="City" options={allCities} selected={filterCities} onChange={setFilterCities} />
          )}
          <MultiSelect label="Columns" options={allColKeys} selected={visible} onChange={setVisible} labelMap={allColLabels} />
          {isCustom && <ResetColumnsButton onClick={reset} />}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              style={{ fontSize: '0.82rem', padding: '0.38rem 0.5rem' }}>
              <option value="name">Name</option>
              <option value="score">Score</option>
              <option value="market_price">Market Value</option>
              <option value="monthly_rent">Rent</option>
              <option value="total_income">Income</option>
              <option value="total_expenses">Expenses</option>
              <option value="net">Net Position</option>
              <option value="roi">ROI</option>
            </select>
            <button className="btn btn-secondary btn-small"
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}>
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏢</div>
            <div className="empty-state-text">No properties match the current filters</div>
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table>
              <thead>
                <tr>
                  {col('name') && <th className="col-fill">Name</th>}
                  <th className="col-shrink" title="Investment health score (0–100)">Score</th>
                  {col('status') && <th className="col-shrink">Status</th>}
                  {col('type') && <th className="col-shrink">Type</th>}
                  {col('location') && <th className="col-shrink">Location</th>}
                  {col('market_price') && <th className="col-shrink">Mkt Value</th>}
                  {col('monthly_rent') && <th className="col-shrink">Rent/mo</th>}
                  {col('total_income') && <th className="col-shrink">Income</th>}
                  {col('net_expenses') && <th className="col-shrink">Net Exp</th>}
                  {col('net') && <th className="col-shrink">Net Position</th>}
                  {col('roi') && <th className="col-shrink">ROI</th>}
                  {col('equity') && <th className="col-shrink">Equity</th>}
                  {col('loan') && <th className="col-shrink">Loan</th>}
                  {col('poss_date') && <th className="col-shrink">Possession</th>}
                  {col('notes') && <th className="col-fill">Notes</th>}
                  <th style={{ width: 52 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const netExp = te(p) - (perPropPrincipal[p.id] ?? 0);
                  const net = mp(p) + ti(p) - te(p) - la(p);
                  const roi = mp(p) ? ((net / mp(p)) * 100).toFixed(1) : null;
                  const equity = mp(p) - la(p);
                  const health = calcSimpleHealth(p as unknown as { poss_date?: string; purchase_price: number; loan_amount: number; total_income: number; total_expenses: number; market_price: number; monthly_rent: number });
                  const hColor = health.score >= 70 ? '#10b981' : health.score >= 40 ? '#f59e0b' : '#ef4444';
                  return (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onPropertyClick(p)}>
                      {col('name') && <td className="col-fill"><strong>{p.name}</strong></td>}
                      <td className="col-shrink">
                        <span title={`${health.label} — ${health.score}/100`} style={{
                          display: 'inline-block', width: '2.1rem', textAlign: 'center',
                          fontSize: '0.78rem', fontWeight: 700, padding: '0.15rem 0.3rem', borderRadius: '6px',
                          background: `${hColor}22`, color: hColor, cursor: 'default',
                        }}>{health.score}</span>
                      </td>
                      {col('status') && <td className="col-shrink"><span className={`property-badge ${pStatus(p)?.toLowerCase()}`}>{pStatus(p)}</span></td>}
                      {col('type') && <td className="col-shrink">{pType(p) || '—'}</td>}
                      {col('location') && <td className="col-shrink"><TruncatedCell text={`${pCity(p)}, ${pProv(p)}`} /></td>}
                      {col('market_price') && <td className="col-shrink">{fmt(mp(p))}</td>}
                      {col('monthly_rent') && <td className="col-shrink">{mr(p) ? fmt(mr(p)) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>}
                      {col('total_income') && <td className="col-shrink text-success">{fmt(ti(p))}</td>}
                      {col('net_expenses') && <td className={`col-shrink ${netExp >= 0 ? 'text-danger' : 'text-success'}`}>{fmt(netExp)}</td>}
                      {col('net') && <td className={`col-shrink ${net >= 0 ? 'text-success' : 'text-danger'}`}>{fmt(net)}</td>}
                      {col('roi') && <td className={roi !== null && parseFloat(roi) >= 0 ? 'text-success' : 'text-danger'}>{roi !== null ? `${roi}%` : '—'}</td>}
                      {col('equity') && <td className="col-shrink">{fmt(equity)}</td>}
                      {col('loan') && <td className="col-shrink">{fmt(la(p))}</td>}
                      {col('poss_date') && <td style={{ whiteSpace: 'nowrap' }}>{p.poss_date || '—'}</td>}
                      {col('notes') && <td className="col-fill" onClick={e => e.stopPropagation()}><TruncatedCell text={p.notes || ''} /></td>}
                      <td onClick={e => e.stopPropagation()}>
                        <div className="row-actions">
                          <button className="btn btn-secondary btn-icon" title="Edit" onClick={() => onEditProperty(p)}>✏️</button>
                          <button className="btn btn-danger btn-icon" title="Archive" onClick={() => handleArchive(p.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ArchivedPropertiesSection archivedProps={archivedProps} onRestore={handleRestore} />
    </>
  );
}