import { useState, useEffect, useMemo } from 'react';
import { API_URL, COLUMN_DEFS, isCurrentTenant, fmtDate } from '../config.js';
import TruncatedCell from './Tooltip.jsx';
import MultiSelect from './MultiSelect.jsx';
import { useColumnVisibility } from '../hooks.js';

function TenantRow({ t, onEdit, onArchive, onRestore, archived, col }) {
  const current = isCurrentTenant(t);
  return (
    <tr style={{ opacity: archived ? 0.65 : 1 }}>
      {col('name')        && <td><strong>{t.name}</strong></td>}
      {col('property')    && <td><TruncatedCell text={t.property_name} maxWidth={120} /></td>}
      {!archived && col('status') && (
        <td>
          <span className={`property-badge ${current ? 'active' : 'badge-warning'}`}>
            {current ? 'Current' : 'Past'}
          </span>
        </td>
      )}
      {col('phone')       && <td>{t.phone || '—'}</td>}
      {col('email')       && <td><TruncatedCell text={t.email} maxWidth={140} /></td>}
      {col('lease_start') && <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.lease_start)}</td>}
      {col('lease_end')   && <td style={{ whiteSpace: 'nowrap' }}>{t.lease_end ? fmtDate(t.lease_end) : 'Ongoing'}</td>}
      {col('rent')        && <td style={{ whiteSpace: 'nowrap' }}>${(t.rent_amount || 0).toLocaleString()}</td>}
      {col('deposit')     && <td style={{ whiteSpace: 'nowrap' }}>${(t.deposit || 0).toLocaleString()}</td>}
      {col('notes')       && <td><TruncatedCell text={t.notes} /></td>}
      <td>
        <div className="row-actions">
          {archived ? (
            <button className="btn btn-secondary btn-icon" title="Restore" onClick={() => onRestore(t.id)}>↩</button>
          ) : (
            <>
              <button className="btn btn-secondary btn-icon" title="Edit"    onClick={() => onEdit(t)}>✏️</button>
              <button className="btn btn-danger    btn-icon" title="Archive" onClick={() => onArchive(t.id)}>🗑</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function TenantsView({ properties, onAddTenant, onEditTenant, initialPropertyId }) {
  const [tenants,         setTenants]         = useState([]);
  const [archivedTenants, setArchivedTenants] = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [showArchive,     setShowArchive]     = useState(false);
  const [filterProperty,  setFilterProperty]  = useState(initialPropertyId ? String(initialPropertyId) : 'all');
  const [filterStatus,    setFilterStatus]    = useState('all');

  const { visible, update: setVisible, col, isCustom, reset } = useColumnVisibility('tenants');
  const allColKeys   = COLUMN_DEFS.tenants.map(d => d.key);
  const allColLabels = Object.fromEntries(COLUMN_DEFS.tenants.map(d => [d.key, d.label]));

  useEffect(() => {
    if (initialPropertyId) setFilterProperty(String(initialPropertyId));
  }, [initialPropertyId]);

  useEffect(() => { loadTenants(); }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const [active, all] = await Promise.all([
        fetch(`${API_URL}/tenants`).then(r => r.ok ? r.json() : []),
        fetch(`${API_URL}/tenants?archived=1`).then(r => r.ok ? r.json() : []),
      ]);
      setTenants(active);
      setArchivedTenants(all.filter(t => t.is_archived));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleArchive = async (id) => {
    if (!confirm('Archive this tenant? They can be restored later.')) return;
    const res = await fetch(`${API_URL}/tenants/${id}`, { method: 'DELETE' });
    if (res.ok) loadTenants();
  };

  const handleRestore = async (id) => {
    const res = await fetch(`${API_URL}/tenants/${id}/restore`, { method: 'POST' });
    if (res.ok) loadTenants();
  };

  const filtered = useMemo(() => tenants.filter(t => {
    if (filterProperty !== 'all' && t.property_id !== parseInt(filterProperty)) return false;
    if (filterStatus === 'current' && !isCurrentTenant(t)) return false;
    if (filterStatus === 'past'    &&  isCurrentTenant(t)) return false;
    return true;
  }), [tenants, filterProperty, filterStatus]);

  const rowProps = { onEdit: onEditTenant, onArchive: handleArchive, onRestore: handleRestore, col };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tenants</h1>
          <p className="page-subtitle">Manage leases and tenant information</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={onAddTenant}>+ Add Tenant</button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">Active Tenants</div>
          <div className="stat-value">{tenants.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Current Leases</div>
          <div className="stat-value text-success">{tenants.filter(isCurrentTenant).length}</div>
        </div>
      </div>

      {/* Active tenants */}
      <div className="table-container" style={{ marginBottom: '1.25rem' }}>
        <div className="table-header">
          <div className="table-title">All Tenants ({filtered.length})</div>
          <div className="table-controls">
            <div className="filter-group">
              <span className="filter-label">Filter:</span>
              <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}>
                <option value="all">All Properties</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">All</option>
                <option value="current">Current</option>
                <option value="past">Past</option>
              </select>
              <MultiSelect
                label="Columns"
                options={allColKeys}
                selected={visible}
                onChange={setVisible}
                labelMap={allColLabels}
              />
              {isCustom && (
                <button type="button" onClick={reset}
                  style={{ background: 'none', border: 'none', fontSize: '0.75rem',
                    color: 'var(--accent-primary)', cursor: 'pointer', padding: '0 2px',
                    textDecoration: 'underline', opacity: 0.8, whiteSpace: 'nowrap' }}>
                  ↺ reset cols
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? <div className="loading"><div className="spinner" /></div>
        : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <div className="empty-state-text">No tenants found</div>
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table>
              <thead><tr>
                {col('name')        && <th>Name</th>}
                {col('property')    && <th>Property</th>}
                {col('status')      && <th>Status</th>}
                {col('phone')       && <th>Phone</th>}
                {col('email')       && <th>Email</th>}
                {col('lease_start') && <th>Lease Start</th>}
                {col('lease_end')   && <th>Lease End</th>}
                {col('rent')        && <th>Rent/mo</th>}
                {col('deposit')     && <th>Deposit</th>}
                {col('notes')       && <th>Notes</th>}
                <th style={{ width: 52 }}></th>
              </tr></thead>
              <tbody>
                {filtered.map(t => <TenantRow key={t.id} t={t} archived={false} {...rowProps} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Archive */}
      <div className="table-container">
        <div className="table-header" onClick={() => setShowArchive(o => !o)}
          style={{ cursor: 'pointer', userSelect: 'none' }}>
          <div className="table-title" style={{ color: 'var(--text-tertiary)' }}>
            🗄 Archived Tenants ({archivedTenants.length})
          </div>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
            {showArchive ? '▲ collapse' : '▼ expand'}
          </span>
        </div>
        {showArchive && (
          archivedTenants.length === 0
            ? <div className="empty-state" style={{ padding: '2rem' }}><div className="empty-state-text">No archived tenants</div></div>
            : <div className="table-scroll-wrap">
                <table>
                  <thead><tr>
                    {col('name')        && <th>Name</th>}
                    {col('property')    && <th>Property</th>}
                    {col('phone')       && <th>Phone</th>}
                    {col('email')       && <th>Email</th>}
                    {col('lease_start') && <th>Lease Start</th>}
                    {col('lease_end')   && <th>Lease End</th>}
                    {col('rent')        && <th>Rent/mo</th>}
                    {col('deposit')     && <th>Deposit</th>}
                    {col('notes')       && <th>Notes</th>}
                    <th style={{ width: 52 }}></th>
                  </tr></thead>
                  <tbody>
                    {archivedTenants.map(t => <TenantRow key={t.id} t={t} archived={true} {...rowProps} />)}
                  </tbody>
                </table>
              </div>
        )}
      </div>
    </>
  );
}
