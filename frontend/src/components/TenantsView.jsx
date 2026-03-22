import { useState, useEffect, useMemo } from 'react';
import { COLUMN_DEFS } from '../config.js';
import { getTenants, archiveTenant, restoreTenant } from '../api.js';
import { isCurrentTenant } from '../utils.js';
import { fmtDate } from './uiHelpers.jsx';
import TruncatedCell from './Tooltip.jsx';
import MultiSelect from './MultiSelect.jsx';
import ResetColumnsButton from './ResetColumnsButton.jsx';
import { useColumnVisibility } from '../hooks/useColumnVisibility.js';
import { PropertyOptions } from '../modals/ModalBase.jsx';

function TenantRow({ t, onEdit, onArchive, onRestore, archived, col }) {
  const current = isCurrentTenant(t);
  return (
    <tr style={{ opacity: archived ? 0.65 : 1 }}>
      {col('name')        && <td className="col-fill"><strong>{t.name}</strong></td>}
      {col('property')    && <td className="col-shrink"><TruncatedCell text={t.property_name} /></td>}
      {!archived && col('status') && (
        <td className="col-shrink">
          <span className={`property-badge ${current ? 'active' : 'badge-warning'}`}>
            {current ? 'Current' : 'Past'}
          </span>
        </td>
      )}
      {col('phone')       && <td className="col-shrink">{t.phone || '—'}</td>}
      {col('email')       && <td className="col-fill"><TruncatedCell text={t.email} /></td>}
      {col('lease_start') && <td className="col-shrink">{fmtDate(t.lease_start)}</td>}
      {col('lease_end')   && <td className="col-shrink">{t.lease_end ? fmtDate(t.lease_end) : 'Ongoing'}</td>}
      {col('rent')        && <td className="col-shrink">${(t.rent_amount || 0).toLocaleString()}</td>}
      {col('deposit')     && <td className="col-shrink">${(t.deposit || 0).toLocaleString()}</td>}
      {col('notes')       && <td className="col-fill"><TruncatedCell text={t.notes} /></td>}
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
        getTenants(),
        getTenants({ archived: 1 }),
      ]);
      setTenants(active);
      setArchivedTenants(all.filter(t => t.is_archived));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleArchive = async (id) => {
    if (!confirm('Archive this tenant? They can be restored later.')) return;
    try { await archiveTenant(id); loadTenants(); } catch (e) { console.error(e); }
  };

  const handleRestore = async (id) => {
    try { await restoreTenant(id); loadTenants(); } catch (e) { console.error(e); }
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
                <PropertyOptions properties={properties} placeholder="All Properties" />
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
              {isCustom && <ResetColumnsButton onClick={reset} />}
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
                {col('name')        && <th className="col-fill">Name</th>}
                {col('property')    && <th className="col-shrink">Property</th>}
                {col('status')      && <th className="col-shrink">Status</th>}
                {col('phone')       && <th className="col-shrink">Phone</th>}
                {col('email')       && <th className="col-fill">Email</th>}
                {col('lease_start') && <th className="col-shrink">Lease Start</th>}
                {col('lease_end')   && <th className="col-shrink">Lease End</th>}
                {col('rent')        && <th className="col-shrink">Rent/mo</th>}
                {col('deposit')     && <th className="col-shrink">Deposit</th>}
                {col('notes')       && <th className="col-fill">Notes</th>}
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
                    {col('name')        && <th className="col-fill">Name</th>}
                    {col('property')    && <th className="col-shrink">Property</th>}
                    {col('phone')       && <th className="col-shrink">Phone</th>}
                    {col('email')       && <th className="col-fill">Email</th>}
                    {col('lease_start') && <th className="col-shrink">Lease Start</th>}
                    {col('lease_end')   && <th className="col-shrink">Lease End</th>}
                    {col('rent')        && <th className="col-shrink">Rent/mo</th>}
                    {col('deposit')     && <th className="col-shrink">Deposit</th>}
                    {col('notes')       && <th className="col-fill">Notes</th>}
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
