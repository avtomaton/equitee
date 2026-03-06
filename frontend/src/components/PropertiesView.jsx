import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import MultiSelect from './MultiSelect.jsx';
import TruncatedCell from './Tooltip.jsx';
import { INITIAL_OPTIONS, PROVINCES, mergeOptions, COLORS, API_URL } from '../config.js';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';

const TT  = { background: '#1a1f2e', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' };
const fmt = (n) => `$${Number(n).toLocaleString()}`;
const pct = (n, d) => d ? `${((n / d) * 100).toFixed(1)}%` : '—';
const shortName = (name) => name.length > 14 ? name.slice(0, 14) + '…' : name;

// ── Collapsible wrapper ────────────────────────────────────────────────────────
function Collapsible({ title, defaultOpen = false, children, headerRight }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="table-container" style={{ marginBottom: '1.25rem' }}>
      <div className="table-header" onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', userSelect: 'none' }}>
        <div className="table-title">{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {headerRight}
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
            {open ? '▲ collapse' : '▼ expand'}
          </span>
        </div>
      </div>
      {open && children}
    </div>
  );
}

// ── Analytics charts ───────────────────────────────────────────────────────────
function Analytics({ filtered }) {
  // Charts are only redrawn when user clicks Refresh — snapshot on demand
  const [chartData, setChartData] = useState(null);

  const buildChartData = useCallback((list) => {
    const incExp = list.map(p => ({
      name: shortName(p.name),
      Income: p.total_income, Expenses: p.total_expenses,
      Net: p.total_income - p.total_expenses,
    }));
    const value = list.map(p => ({ name: shortName(p.name), Value: p.market_price }));
    const roi   = list.map(p => ({
      name: shortName(p.name),
      ROI: p.market_price
        ? parseFloat(((p.total_income - p.total_expenses) / p.market_price * 100).toFixed(2))
        : 0,
    }));
    const statusCount = list.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1; return acc;
    }, {});
    const status = Object.entries(statusCount).map(([name, value]) => ({ name, value }));
    return { incExp, value, roi, status };
  }, []);

  // Build on first render so charts show immediately when panel opens
  useEffect(() => {
    setChartData(buildChartData(filtered));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = (e) => {
    e.stopPropagation();
    setChartData(buildChartData(filtered));
  };

  const statusColors = { Rented: '#10b981', Vacant: '#ef4444', Primary: '#3b82f6' };

  if (!chartData) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
      Loading charts…
    </div>
  );

  return (
    <div style={{ padding: '1.25rem 1.5rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Income vs Expenses */}
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Income vs Expenses by Property</h2></div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData.incExp}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TT} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Legend />
              <Bar dataKey="Income"   fill="#10b981" />
              <Bar dataKey="Expenses" fill="#ef4444" />
              <Bar dataKey="Net"      fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status pie */}
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Status Breakdown</h2></div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={chartData.status} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={75}
                label={({ name, value }) => `${name}: ${value}`}>
                {chartData.status.map((entry, i) => (
                  <Cell key={entry.name} fill={statusColors[entry.name] || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TT} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        {/* Market value */}
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">Market Value by Property</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData.value}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TT} formatter={v => `$${Number(v).toLocaleString()}`} />
              <Bar dataKey="Value" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ROI */}
        <div className="chart-container" style={{ margin: 0 }}>
          <div className="chart-header"><h2 className="chart-title">ROI by Property (%)</h2></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData.roi}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TT} formatter={v => `${v}%`} />
              <Bar dataKey="ROI">
                {chartData.roi.map((entry, i) => (
                  <Cell key={i} fill={entry.ROI >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-small" onClick={refresh}>
          ↻ Refresh charts from current filters
        </button>
      </div>
    </div>
  );
}

// ── Archive section ───────────────────────────────────────────────────────────
function ArchivedPropertiesSection({ archivedProps, onRestore }) {
  const [open, setOpen] = useState(false);
  const fmt = (n) => `$${Number(n).toLocaleString()}`;

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
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Type</th><th>Location</th><th>Status</th>
                <th>Market Value</th><th>Rent/mo</th><th>Notes</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {archivedProps.map(p => (
                <tr key={p.id} style={{ opacity: 0.65 }}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.type || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.city}, {p.province}</td>
                  <td><span className={`property-badge ${p.status?.toLowerCase()}`}>{p.status}</span></td>
                  <td>{fmt(p.market_price)}</td>
                  <td>{p.monthly_rent ? fmt(p.monthly_rent) : '—'}</td>
                  <td><TruncatedCell text={p.notes} /></td>
                  <td>
                    <button className="btn btn-secondary btn-small" onClick={() => onRestore(p.id)}>
                      ↩ Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function PropertiesView({ properties, onPropertyClick, onAddProperty, onEditProperty, onReloadProperties }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy,       setSortBy]       = useState('name');
  const [sortOrder,    setSortOrder]    = useState('asc');
  const [showArchive,  setShowArchive]  = useState(false);
  const [archivedProps, setArchivedProps] = useState([]);

  // Derive available options from data, merged with seeds
  const allStatuses  = useMemo(() => mergeOptions(INITIAL_OPTIONS.propertyStatuses, properties.map(p => p.status)), [properties]);
  const allTypes     = useMemo(() => mergeOptions(INITIAL_OPTIONS.propertyTypes, properties.map(p => p.type).filter(Boolean)), [properties]);
  const allProvinces = useMemo(() => mergeOptions(PROVINCES, properties.map(p => p.province)), [properties]);
  const allCities    = useMemo(() => [...new Set(properties.map(p => p.city))].sort(), [properties]);

  // Filter selections — initialised to "all selected"; kept in sync when new options appear
  const [filterStatuses,  setFilterStatuses]  = useState(() => allStatuses);
  const [filterTypes,     setFilterTypes]     = useState(() => allTypes);
  const [filterProvinces, setFilterProvinces] = useState(() => allProvinces);
  const [filterCities,    setFilterCities]    = useState(() => allCities);

  useEffect(() => {
    setFilterStatuses(prev => mergeOptions(prev, allStatuses));
  }, [allStatuses]);
  useEffect(() => {
    setFilterTypes(prev => mergeOptions(prev, allTypes));
  }, [allTypes]);
  useEffect(() => {
    setFilterProvinces(prev => mergeOptions(prev, allProvinces));
  }, [allProvinces]);
  useEffect(() => {
    setFilterCities(prev => [...new Set([...prev, ...allCities])].sort());
  }, [allCities]);

  // Load archived properties separately (not in main App state)
  const loadArchived = useCallback(() => {
    fetch(`${API_URL}/properties?archived=1`)
      .then(r => r.ok ? r.json() : [])
      .then(all => setArchivedProps(all.filter(p => p.is_archived)))
      .catch(() => {});
  }, []);

  useEffect(() => { loadArchived(); }, [loadArchived]);

  const handleArchive = async (id) => {
    if (!confirm('Archive this property? It will be hidden from all views but can be restored.')) return;
    const res = await fetch(`${API_URL}/properties/${id}`, { method: 'DELETE' });
    if (res.ok) { onReloadProperties(); loadArchived(); }
    else alert('Failed to archive property');
  };

  const handleRestore = async (id) => {
    const res = await fetch(`${API_URL}/properties/${id}/restore`, { method: 'POST' });
    if (res.ok) { onReloadProperties(); loadArchived(); }
    else alert('Failed to restore property');
  };

  const filtered = useMemo(() => {
    let list = properties.filter(p => {
      const q = searchTerm.toLowerCase();
      if (q && !p.name.toLowerCase().includes(q) &&
               !p.city.toLowerCase().includes(q) &&
               !p.address.toLowerCase().includes(q)) return false;
      if (!filterStatuses.includes(p.status))                   return false;
      if (p.type && !filterTypes.includes(p.type))              return false;
      if (!filterProvinces.includes(p.province))                return false;
      if (allCities.length && !filterCities.includes(p.city))   return false;
      return true;
    });
    list.sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'name':           return dir * a.name.localeCompare(b.name);
        case 'market_price':   return dir * (a.market_price   - b.market_price);
        case 'monthly_rent':   return dir * (a.monthly_rent   - b.monthly_rent);
        case 'total_income':   return dir * (a.total_income   - b.total_income);
        case 'total_expenses': return dir * (a.total_expenses - b.total_expenses);
        case 'net': return dir * ((a.total_income - a.total_expenses) - (b.total_income - b.total_expenses));
        case 'roi': {
          const rA = a.market_price ? (a.total_income - a.total_expenses) / a.market_price : 0;
          const rB = b.market_price ? (b.total_income - b.total_expenses) / b.market_price : 0;
          return dir * (rA - rB);
        }
        default: return 0;
      }
    });
    return list;
  }, [properties, searchTerm, filterStatuses, filterTypes, filterProvinces, filterCities, sortBy, sortOrder]);

  // Summary stats — computed from FILTERED set so they update with filters
  const totalValue    = filtered.reduce((s, p) => s + p.market_price,   0);
  const totalIncome   = filtered.reduce((s, p) => s + p.total_income,   0);
  const totalExpenses = filtered.reduce((s, p) => s + p.total_expenses, 0);
  const netProfit     = totalIncome - totalExpenses;

  const summaryCards = [
    { label: 'Shown / Total', value: `${filtered.length} / ${properties.length}` },
    { label: 'Portfolio Value', value: fmt(totalValue) },
    { label: 'Total Income',   value: fmt(totalIncome),   cls: 'text-success' },
    { label: 'Total Expenses', value: fmt(totalExpenses), cls: 'text-danger' },
    { label: 'Net Profit',     value: fmt(netProfit), cls: netProfit >= 0 ? 'text-success' : 'text-danger' },
    { label: 'Overall ROI',    value: totalValue ? pct(netProfit, totalValue) : '—',
      cls: netProfit >= 0 ? 'text-success' : 'text-danger' },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Properties</h1>
          <p className="page-subtitle">Manage your real estate portfolio</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={onAddProperty}>+ Add Property</button>
        </div>
      </div>

      {/* ── 1. Summary cards (open by default) ──────────────────────────── */}
      <Collapsible title="📊 Summary" defaultOpen={true}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '1rem',
          padding: '1rem 1.5rem 1.25rem',
        }}>
          {summaryCards.map(({ label, value, cls }) => (
            <div key={label} className="stat-card" style={{ flex: '1 1 140px', minWidth: 130, margin: 0 }}>
              <div className="stat-label">{label}</div>
              <div className={`stat-value ${cls || ''}`} style={{ fontSize: '1.2rem' }}>{value}</div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* ── 2. Analytics (closed by default, refresh button in header) ──── */}
      {properties.length > 0 && (
        <Collapsible title="📈 Analytics" defaultOpen={false}>
          <Analytics filtered={filtered} />
        </Collapsible>
      )}

      {/* ── 3. Properties table with filters + sort ──────────────────────── */}
      <div className="table-container">
        <div className="table-header">
          <div className="table-title">All Properties ({filtered.length})</div>
        </div>

        {/* Filters + sort — single row */}
        <div style={{
          padding: '0.6rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center',
        }}>
          <input type="text" placeholder="Search…" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: 150, fontSize: '0.82rem', padding: '0.38rem 0.6rem' }} />
          <MultiSelect label="Status"   options={allStatuses}  selected={filterStatuses}  onChange={setFilterStatuses} />
          <MultiSelect label="Type"     options={allTypes}     selected={filterTypes}     onChange={setFilterTypes} />
          <MultiSelect label="Province" options={allProvinces} selected={filterProvinces} onChange={setFilterProvinces} />
          {allCities.length > 0 && (
            <MultiSelect label="City" options={allCities} selected={filterCities} onChange={setFilterCities} />
          )}
          {/* Sort pushed to the right */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ fontSize: '0.82rem', padding: '0.38rem 0.5rem' }}>
              <option value="name">Name</option>
              <option value="market_price">Market Value</option>
              <option value="monthly_rent">Rent</option>
              <option value="total_income">Income</option>
              <option value="total_expenses">Expenses</option>
              <option value="net">Net Profit</option>
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
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Location</th>
                <th>Status</th>
                <th>Market Value</th>
                <th>Rent/mo</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>Net</th>
                <th>ROI</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const net = p.total_income - p.total_expenses;
                const roi = p.market_price ? ((net / p.market_price) * 100).toFixed(1) : null;
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onPropertyClick(p)}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.type || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{p.city}, {p.province}</td>
                    <td>
                      <span className={`property-badge ${p.status?.toLowerCase()}`}>{p.status}</span>
                    </td>
                    <td>{fmt(p.market_price)}</td>
                    <td>
                      {p.monthly_rent
                        ? fmt(p.monthly_rent)
                        : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td className="text-success">{fmt(p.total_income)}</td>
                    <td className="text-danger">{fmt(p.total_expenses)}</td>
                    <td className={net >= 0 ? 'text-success' : 'text-danger'}>{fmt(net)}</td>
                    <td className={roi !== null && parseFloat(roi) >= 0 ? 'text-success' : 'text-danger'}>
                      {roi !== null ? `${roi}%` : '—'}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <TruncatedCell text={p.notes} />
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-small" onClick={() => onEditProperty(p)}>✏️ Edit</button>
                        <button className="btn btn-danger btn-small"    onClick={() => handleArchive(p.id)}>🗑 Archive</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <ArchivedPropertiesSection archivedProps={archivedProps} onRestore={handleRestore} />
    </>
  );
}
