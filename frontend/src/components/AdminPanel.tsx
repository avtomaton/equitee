/**
 * AdminPanel — admin dashboard for managing users, tenants, and tenancy requests.
 * Only accessible to users with is_admin=true.
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { admin } from '../api';

const TABS = ['overview', 'users', 'tenants', 'requests'];

interface AnalyticsData {
  totals: {
    users: number;
    verified_users: number;
    tenants: number;
    active_tenants: number;
    pending_requests: number;
    new_users_30d: number;
  };
  recent_users: Array<{
    id: string;
    email: string;
    tenant_name?: string;
    email_verified: boolean;
    created_at: string;
  }>;
}

interface UserData {
  users: Array<{
    id: string;
    email: string;
    tenant_name?: string;
    is_admin: boolean;
    is_active: boolean;
    created_at: string;
  }>;
  pages: number;
  page: number;
}

interface TenantData {
  tenants: Array<{
    id: string;
    name: string;
    plan: string;
    member_count: number;
    is_active: boolean;
    created_at: string;
  }>;
  pages: number;
  page: number;
}

interface RequestData {
  requests: Array<{
    id: string;
    user: { email: string };
    tenant_name: string;
    status: string;
    created_at: string;
  }>;
  pages: number;
  page: number;
}

interface AdminPanelProps {
  onNavigate: (page: string) => void;
}

export default function AdminPanel({ onNavigate }: AdminPanelProps) {
  const [tab, setTab] = useState<string>('overview');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [users, setUsers] = useState<UserData | null>(null);
  const [tenants, setTenants] = useState<TenantData | null>(null);
  const [requests, setRequests] = useState<RequestData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [requestsPage, setRequestsPage] = useState<number>(1);
  const [requestsStatus, setRequestsStatus] = useState<string>('');

  const loadAnalytics = useCallback(async () => {
    try { setAnalytics(await admin.getAnalytics() as AnalyticsData); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  const loadUsers = useCallback(async (page = 1) => {
    try { setUsers(await admin.listUsers(page, search) as UserData); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  }, [search]);

  const loadTenants = useCallback(async (page = 1) => {
    try { setTenants(await admin.listTenants(page, search) as TenantData); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  }, [search]);

  const loadRequests = useCallback(async (page = 1, status = '') => {
    const currentStatus = status || requestsStatus;
    try {
      const data = await admin.listTenancyRequests(page, currentStatus) as RequestData;
      setRequests(data);
      setRequestsPage(page);
      if (status) setRequestsStatus(status);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  }, [requestsStatus]);

  useEffect(() => {
    setLoading(true);
    setError('');
    if (tab === 'overview') loadAnalytics().finally(() => setLoading(false));
    else if (tab === 'users') loadUsers().finally(() => setLoading(false));
    else if (tab === 'tenants') loadTenants().finally(() => setLoading(false));
    else if (tab === 'requests') loadRequests(requestsPage, requestsStatus).finally(() => setLoading(false));
  }, [tab, loadAnalytics, loadUsers, loadTenants, loadRequests, requestsPage, requestsStatus]);

  const handleToggleUserActive = async (userId: string) => {
    try { await admin.toggleUserActive(userId); loadUsers(); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleSetAdmin = async (userId: string, isAdmin: boolean) => {
    try { await admin.setUserAdmin(userId, isAdmin); loadUsers(); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleToggleTenantActive = async (tenantId: string) => {
    try { await admin.toggleTenantActive(tenantId); loadTenants(); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleApproveRequest = async (requestId: string) => {
    try { await admin.approveTenancyRequest(requestId); loadRequests(); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleRejectRequest = async (requestId: string) => {
    try { await admin.rejectTenancyRequest(requestId); loadRequests(); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '2rem' }}>Admin Panel</h1>
        <button className="btn btn-secondary" onClick={() => onNavigate('dashboard')}>← Back to App</button>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0.5rem 1rem', border: 'none', background: 'transparent',
            color: tab === t ? 'var(--accent-light)' : 'var(--text-secondary)',
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer', fontWeight: tab === t ? 600 : 400, textTransform: 'capitalize',
          }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Loading…</p> : (
        <>
          {/* ── Overview Tab ────────────────────────────────────── */}
          {tab === 'overview' && analytics && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {[
                  { label: 'Total Users', value: analytics.totals.users },
                  { label: 'Verified', value: analytics.totals.verified_users },
                  { label: 'Tenants', value: analytics.totals.tenants },
                  { label: 'Active Tenants', value: analytics.totals.active_tenants },
                  { label: 'Pending Requests', value: analytics.totals.pending_requests },
                  { label: 'New Users (30d)', value: analytics.totals.new_users_30d },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-light)' }}>{s.value}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <h3 style={{ marginBottom: '1rem' }}>Recent Registrations</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Tenant</th>
                    <th style={thStyle}>Verified</th>
                    <th style={thStyle}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.recent_users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{u.email}</td>
                      <td style={tdStyle}>{u.tenant_name || '—'}</td>
                      <td style={tdStyle}>{u.email_verified ? '✅' : '⏳'}</td>
                      <td style={tdStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Users Tab ───────────────────────────────────────── */}
          {tab === 'users' && users && (
            <div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <input type="text" placeholder="Search by email…" value={search}
                  onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadUsers()}
                  style={{ flex: 1, padding: '0.5rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                <button className="btn btn-secondary" onClick={() => loadUsers()}>Search</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Tenant</th>
                    <th style={thStyle}>Admin</th>
                    <th style={thStyle}>Active</th>
                    <th style={thStyle}>Created</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{u.email}</td>
                      <td style={tdStyle}>{u.tenant_name || '—'}</td>
                      <td style={tdStyle}>{u.is_admin ? '👑' : ''}</td>
                      <td style={tdStyle}>{u.is_active ? '✅' : '❌'}</td>
                      <td style={tdStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>
                        <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                          onClick={() => handleToggleUserActive(u.id)}>
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                          onClick={() => handleSetAdmin(u.id, !u.is_admin)}>
                          {u.is_admin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Paginator pages={users.pages} page={users.page} onPage={p => loadUsers(p)} />
            </div>
          )}

          {/* ── Tenants Tab ─────────────────────────────────────── */}
          {tab === 'tenants' && tenants && (
            <div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <input type="text" placeholder="Search by name…" value={search}
                  onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadTenants()}
                  style={{ flex: 1, padding: '0.5rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                <button className="btn btn-secondary" onClick={() => loadTenants()}>Search</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Plan</th>
                    <th style={thStyle}>Members</th>
                    <th style={thStyle}>Active</th>
                    <th style={thStyle}>Created</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.tenants.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{t.name}</td>
                      <td style={tdStyle}>{t.plan}</td>
                      <td style={tdStyle}>{t.member_count}</td>
                      <td style={tdStyle}>{t.is_active ? '✅' : '❌'}</td>
                      <td style={tdStyle}>{new Date(t.created_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>
                        <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                          onClick={() => handleToggleTenantActive(t.id)}>
                          {t.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Paginator pages={tenants.pages} page={tenants.page} onPage={p => loadTenants(p)} />
            </div>
          )}

          {/* ── Requests Tab ────────────────────────────────────── */}
          {tab === 'requests' && requests && (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {['', 'pending', 'approved', 'rejected'].map(s => (
                  <button key={s} className={`btn ${s === '' ? 'btn-secondary' : 'btn-ghost'}`}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                    onClick={() => loadRequests(1, s)}>
                    {s || 'All'}
                  </button>
                ))}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>User</th>
                    <th style={thStyle}>Tenant Name</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Created</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.requests.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{r.user.email}</td>
                      <td style={tdStyle}>{r.tenant_name}</td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.8rem',
                          background: r.status === 'pending' ? 'rgba(245,158,11,0.15)' :
                                      r.status === 'approved' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: r.status === 'pending' ? '#f59e0b' :
                                 r.status === 'approved' ? '#10b981' : '#ef4444',
                        }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={tdStyle}>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>
                        {r.status === 'pending' && (
                          <>
                            <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', color: '#10b981' }}
                              onClick={() => handleApproveRequest(r.id)}>Approve</button>
                            <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', color: '#ef4444' }}
                              onClick={() => handleRejectRequest(r.id)}>Reject</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Paginator pages={requests.pages} page={requests.page} onPage={(p: number) => loadRequests(p)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface PaginatorProps {
  pages: number;
  page: number;
  onPage: (page: number) => void;
}

function Paginator({ pages, page, onPage }: PaginatorProps) {
  if (pages <= 1) return null;

  // Show at most 7 page buttons with ellipsis for large page counts
  const MAX_VISIBLE = 7;
  let pageNumbers: (number | string)[];
  if (pages <= MAX_VISIBLE) {
    pageNumbers = Array.from({ length: pages }, (_, i) => i + 1);
  } else {
    pageNumbers = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(pages - 1, page + 1);
    if (start > 2) pageNumbers.push('...');
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (end < pages - 1) pageNumbers.push('...');
    pageNumbers.push(pages);
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1.5rem' }}>
      {pageNumbers.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} style={{ padding: '0.4rem 0.5rem', color: 'var(--text-tertiary)' }}>…</span>
        ) : (
          <button key={p} onClick={() => onPage(p as number)} style={{
            padding: '0.4rem 0.8rem', border: '1px solid var(--border)', borderRadius: '6px',
            background: p === page ? 'var(--accent)' : 'transparent',
            color: p === page ? '#fff' : 'var(--text-secondary)', cursor: 'pointer',
          }}>{p}</button>
        )
      )}
    </div>
  );
}

const thStyle: CSSProperties = { textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' };
const tdStyle: CSSProperties = { padding: '0.75rem', fontSize: '0.9rem' };
