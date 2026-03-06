import { useState, useEffect, useMemo } from 'react';
import { API_URL, isCurrentTenant, fmtDate } from '../config.js';
import TruncatedCell from './Tooltip.jsx';

function TenantRow({ t, onEdit, onArchive, onRestore, archived }) {
  const current = isCurrentTenant(t);
  return (
    <tr style={{ opacity: archived ? 0.65 : 1 }}>
      <td><strong>{t.name}</strong></td>
      <td>{t.property_name}</td>
      <td>{t.phone || '—'}</td>
      <td>{t.email || '—'}</td>
      <td>{fmtDate(t.lease_start)}</td>
      <td>{t.lease_end ? fmtDate(t.lease_end) : 'Ongoing'}</td>
      <td>${(t.rent_amount || 0).toLocaleString()}</td>
      <td>${(t.deposit     || 0).toLocaleString()}</td>
      <td><TruncatedCell text={t.notes} /></td>
      {!archived && (
        <td>
          <span className={`property-badge ${current ? 'active' : 'badge-warning'}`}>
            {current ? 'Current' : 'Past'}
          </span>
        </td>
      )}
      <td>
        <div className="row-actions">
          {archived ? (
            <button className="btn btn-secondary btn-small" onClick={() => onRestore(t.id)}>↩ Restore</button>
          ) : (
            <>
              <button className="btn btn-secondary btn-small" onClick={() => onEdit(t)}>✏️ Edit</button>
              <button className="btn btn-danger btn-small"    onClick={() => onArchive(t.id)}>🗑 Archive</button>
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

  useEffect(() => {
    if (initialPropertyId) setFilterProperty(String(initialPropertyId));
  }, [initialPropertyId]);

  useEffect(() => { loadTenants(); }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const [active, archived] = await Promise.all([
        fetch(`${API_URL}/tenants`).then(r => r.ok ? r.json() : []),
        fetch(`${API_URL}/tenants?archived=1`).then(r => r.ok ? r.json() : [])
          .then(all => all.filter(t => t.is_archived)),
      ]);
      setTenants(active);
      setArchivedTenants(archived);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleArchive = async (id) => {
    if (!confirm('Archive this tenant? They will be hidden from main views but can be restored.')) return;
    const res = await fetch(`${API_URL}/tenants/${id}`, { method: 'DELETE' });
    if (res.ok) loadTenants();
    else alert('Failed to archive tenant');
  };

  const handleRestore = async (id) => {
    const res = await fetch(`${API_URL}/tenants/${id}/restore`, { method: 'POST' });
    if (res.ok) loadTenants();
    else alert('Failed to restore tenant');
  };

  const filtered = useMemo(() => tenants.filter(t => {
    if (filterProperty !== 'all' && t.property_id !== parseInt(filterProperty)) return false;
    if (filterStatus === 'current' && !isCurrentTenant(t)) return false;
    if (filterStatus === 'past'    &&  isCurrentTenant(t)) return false;
    return true;
  }), [tenants, filterProperty, filterStatus]);

  const colSpan = 11;

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

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">Active Tenants</div>
          <div className="stat-value">{tenants.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Current Leases</div>
          <div className="stat-value text-success">{tenants.filter(isCurrentTenant).length}</div>
        </div>
      </div>

      {/* ── Active tenants table ─────────────────────────────────────────── */}
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
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <div className="empty-state-text">No tenants found</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Property</th><th>Phone</th><th>Email</th>
                <th>Lease Start</th><th>Lease End</th><th>Rent/mo</th><th>Deposit</th>
                <th>Notes</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <TenantRow key={t.id} t={t}
                  onEdit={onEditTenant} onArchive={handleArchive} archived={false} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Archive section ──────────────────────────────────────────────── */}
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
          archivedTenants.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <div className="empty-state-text">No archived tenants</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Property</th><th>Phone</th><th>Email</th>
                  <th>Lease Start</th><th>Lease End</th><th>Rent/mo</th><th>Deposit</th>
                  <th>Notes</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedTenants.map(t => (
                  <TenantRow key={t.id} t={t}
                    onRestore={handleRestore} archived={true} />
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </>
  );
}
