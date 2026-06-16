/**
 * Settings page — tenancy switching, member management, and account settings.
 * In self-hosted mode, shows a simplified view without tenancy features.
 */
import { useState, useEffect, useCallback } from 'react';
import { tenancy, getMode } from '../api';
import { useAuth } from '../context/AuthContext.tsx';
import { isSaasMode } from '../components/AuthGuard.tsx';
import PropertyGroupsView from '../components/PropertyGroupsView.tsx';

// Tenant organization with metadata (extends the base Tenant concept)
interface TenantWithMetadata {
  id: string;
  name: string;
  role: string;
  plan: string;
  is_current: boolean;
}

interface TenantsData {
  tenants: TenantWithMetadata[];
  active_tenant_id: string | null;
}

interface Member {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
}

interface Request {
  id: string;
  tenant_name: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string;
}

interface SettingsPageProps {
  onNavigate: (route: string) => void;
}

export default function SettingsPage({ onNavigate }: SettingsPageProps) {
  const [tenants, setTenants] = useState<TenantsData | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<'member' | 'owner'>('member');
  const [tenantName, setTenantName] = useState<string>('');
  const [switching, setSwitching] = useState<boolean>(false);
  const [backendMode, setBackendMode] = useState<string>('single');

  const { updateUser } = useAuth();

  // Fetch backend mode to confirm SaaS mode
  useEffect(() => {
    getMode().then(data => setBackendMode(data.mode)).catch(() => setBackendMode('single'));
  }, []);

  const loadData = useCallback(async () => {
    // Check current mode inside the callback to avoid stale closure
    const currentMode = backendMode;
    const isSelfHostedNow = !isSaasMode || currentMode === 'single';

    // In self-hosted mode, skip tenancy API calls
    if (isSelfHostedNow) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [tenantsData, requestsData] = await Promise.all([
        tenancy.getMyTenants(),
        tenancy.getMyRequests().catch(() => []),
      ]);
      setTenants(tenantsData as unknown as TenantsData);
      setRequests(requestsData as unknown as Request[]);

      // Load members if user has an active tenant
      const tenantsResult = tenantsData as unknown as TenantsData;
      if (tenantsResult.active_tenant_id) {
        try {
          setMembers(await tenancy.getMembers() as Member[]);
        } catch { setMembers(null); }
      }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [backendMode]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSwitchTenant = async (tenantId: string) => {
    setSwitching(true);
    setError('');
    try {
      const result = await tenancy.switchTenant(tenantId) as { access_token: string; refresh_token: string; is_admin: boolean; tenant_name: string } | null;
      if (!result || !result.access_token || !result.refresh_token) {
        throw new Error('Invalid response from switchTenant');
      }
      localStorage.setItem('access_token', result.access_token);
      localStorage.setItem('refresh_token', result.refresh_token);
      // Update auth context with new tenant info
      updateUser({
        tenant_id: tenantId,
        is_admin: result.is_admin,
      });
      setSuccess(`Switched to "${result.tenant_name}"`);
      loadData();
      // Navigate to dashboard to reflect new tenant context
      onNavigate('dashboard');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSwitching(false); }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      const result = await tenancy.inviteMember(inviteEmail, inviteRole) as { message: string };
      setSuccess(result.message);
      setInviteEmail('');
      setMembers(await tenancy.getMembers() as Member[]);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleRevoke = async (userId: string) => {
    if (!confirm("Revoke this member's access?")) return;
    setError(''); setSuccess('');
    try {
      const result = await tenancy.revokeMember(userId) as { message: string };
      setSuccess(result.message);
      setMembers(await tenancy.getMembers() as Member[]);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleRequestTenancy = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await tenancy.requestTenancy(tenantName);
      setSuccess('Tenancy request submitted! An admin will review it shortly.');
      setTenantName('');
      setRequests(await tenancy.getMyRequests() as Request[]);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  };

  // In self-hosted mode, show a simplified settings page
  const isSelfHosted = !isSaasMode || backendMode === 'single';
  if (isSelfHosted) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '2rem' }}>Settings</h1>
          <button className="btn btn-secondary" onClick={() => onNavigate('dashboard')}>← Back</button>
        </div>

        <PropertyGroupsView />
      </div>
    );
  }

  const hasTenant = tenants?.active_tenant_id != null;
  const tenantList = tenants?.tenants || [];

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '2rem' }}>Settings</h1>
        <button className="btn btn-secondary" onClick={() => onNavigate('dashboard')}>← Back</button>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div style={{ padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', color: '#10b981', marginBottom: '1rem' }}>{success}</div>}

      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Loading…</p> : (
        <>
          {/* ── Request Tenancy (shown if no tenant) ────────────── */}
          {!hasTenant && (
            <section style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '2rem', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Request a Portfolio</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                You don't have a portfolio yet. Submit a request and an admin will create one for you.
              </p>
              <form onSubmit={handleRequestTenancy} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Portfolio Name</label>
                  <input type="text" value={tenantName} onChange={e => setTenantName(e.target.value)} required
                    placeholder="e.g. My Real Estate Portfolio"
                    style={{ width: '100%', padding: '0.6rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                </div>
                <button type="submit" className="btn btn-primary">Submit Request</button>
              </form>

              {requests.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Your Requests</h3>
                  {requests.map(r => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                      <div>
                        <strong>{r.tenant_name}</strong>
                        {r.admin_notes && <span style={{ color: 'var(--text-secondary)', marginLeft: '1rem', fontSize: '0.85rem' }}>({r.admin_notes})</span>}
                      </div>
                      <span style={{
                        padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.8rem',
                        background: r.status === 'pending' ? 'rgba(245,158,11,0.15)' :
                                r.status === 'approved' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: r.status === 'pending' ? '#f59e0b' : r.status === 'approved' ? '#10b981' : '#ef4444',
                      }}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Tenant Switching ────────────────────────────────── */}
          {tenantList.length > 1 && (
            <section style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '2rem', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Switch Portfolio</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {tenantList.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '1rem', background: t.is_current ? 'var(--accent-glow)' : 'var(--bg-tertiary)',
                    border: `1px solid ${t.is_current ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '10px',
                  }}>
                    <div>
                      <strong>{t.name}</strong>
                      <span style={{ marginLeft: '0.75rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                        {t.role} · {t.plan}
                      </span>
                    </div>
                    {t.is_current ? (
                      <span style={{ fontSize: '0.85rem', color: 'var(--accent-light)' }}>✓ Active</span>
                    ) : (
                      <button className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
                        disabled={switching} onClick={() => handleSwitchTenant(t.id)}>
                        Switch
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Member Management ───────────────────────────────── */}
          {hasTenant && members && (
            <section style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '16px', padding: '2rem', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Team Members</h2>

              {/* Invite form */}
              <form onSubmit={handleInvite} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Invite by email</label>
                  <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required
                    placeholder="colleague@example.com"
                    style={{ width: '100%', padding: '0.6rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                </div>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'member' | 'owner')}
                  style={{ padding: '0.6rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}>
                  <option value="member">Member</option>
                  <option value="owner">Owner</option>
                </select>
                <button type="submit" className="btn btn-primary">Invite</button>
              </form>

              {/* Members list */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Email</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Role</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.5rem' }}>{m.email}</td>
                      <td style={{ padding: '0.5rem' }}>{m.role}</td>
                      <td style={{ padding: '0.5rem' }}>{m.is_active ? '✅' : '❌'}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {m.role !== 'owner' && m.is_active && (
                          <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', color: '#ef4444' }}
                            onClick={() => handleRevoke(m.id)}>Revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}