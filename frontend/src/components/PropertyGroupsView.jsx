import { useState, useMemo } from 'react';
import { usePortfolioData } from '../context/PortfolioDataContext.jsx';
import { createGroup, updateGroup, deleteGroup } from '../api.js';

const styles = {
  container: { maxWidth: 720, margin: '0 auto', padding: '1.5rem' },
  card: {
    background: 'var(--bg-secondary, var(--color-background-primary))',
    border: '1px solid var(--border, var(--color-border-tertiary))',
    borderRadius: '10px',
    padding: '1rem 1.25rem',
    marginBottom: '0.75rem',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  title: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' },
  subtitle: { fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' },
  btn: {
    fontSize: '0.78rem', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
    border: '1px solid var(--border, var(--color-border-tertiary))',
    background: 'var(--bg-tertiary, var(--color-background-tertiary))',
    color: 'var(--text-primary)', fontFamily: 'inherit',
  },
  btnPrimary: {
    fontSize: '0.78rem', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
    border: 'none', background: '#378ADD', color: '#fff', fontFamily: 'inherit', fontWeight: 600,
  },
  btnDanger: {
    fontSize: '0.72rem', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer',
    border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', fontFamily: 'inherit',
  },
  input: {
    fontSize: '0.85rem', padding: '6px 10px', borderRadius: '6px',
    border: '1px solid var(--border, var(--color-border-tertiary))',
    background: 'var(--bg-primary, var(--color-background-secondary))',
    color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%',
    boxSizing: 'border-box',
  },
  row: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  badge: {
    fontSize: '0.65rem', padding: '2px 7px', borderRadius: '4px',
    background: '#378ADD22', color: '#378ADD', fontWeight: 600,
  },
  propChip: {
    fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px',
    background: 'var(--bg-tertiary, var(--color-background-tertiary))',
    border: '1px solid var(--border, var(--color-border-tertiary))',
    color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none',
  },
  propChipSelected: {
    fontSize: '0.7rem', padding: '3px 8px', borderRadius: '4px',
    background: '#378ADD33', border: '1px solid #378ADD',
    color: '#378ADD', cursor: 'pointer', userSelect: 'none', fontWeight: 600,
  },
  emptyState: {
    textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)',
    fontSize: '0.85rem',
  },
  checkbox: { accentColor: '#378ADD', cursor: 'pointer' },
};

export default function PropertyGroupsView() {
  const { properties, groups, defaultGroup, refresh } = usePortfolioData();
  const [editing, setEditing] = useState(null); // null | 'new' | group.id
  const [editName, setEditName] = useState('');
  const [editPropIds, setEditPropIds] = useState([]);
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const propMap = useMemo(() => Object.fromEntries(properties.map(p => [p.id, p.name])), [properties]);

  // Separate built-in group from user groups
  const builtinGroup = groups.find(g => g.is_builtin);
  const userGroups = groups.filter(g => !g.is_builtin);

  const startNew = () => {
    setEditing('new');
    setEditName('');
    setEditPropIds([]);
    setEditIsDefault(userGroups.length === 0);
  };

  const startEdit = (g) => {
    setEditing(g.id);
    setEditName(g.name);
    setEditPropIds([...(g.property_ids || [])]);
    setEditIsDefault(g.is_default);
  };

  const cancel = () => setEditing(null);

  const toggleProp = (pid) => {
    setEditPropIds(prev =>
      prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]
    );
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      if (editing === 'new') {
        await createGroup({ name: editName.trim(), property_ids: editPropIds, is_default: editIsDefault });
      } else {
        await updateGroup(editing, { name: editName.trim(), property_ids: editPropIds, is_default: editIsDefault });
      }
      await refresh({ silent: true });
      setEditing(null);
    } catch (err) {
      alert(err.message || 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this group?')) return;
    try {
      await deleteGroup(id);
      await refresh({ silent: true });
    } catch (err) {
      alert(err.message || 'Failed to delete group');
    }
  };

  const handleSetDefault = async (g) => {
    try {
      if (g.is_builtin) {
        // Setting "All Properties" as default = unset the current default group
        const currentDefault = groups.find(gr => gr.is_default && !gr.is_builtin);
        if (currentDefault) {
          await updateGroup(currentDefault.id, { is_default: false });
        }
      } else {
        await updateGroup(g.id, { is_default: true });
      }
      await refresh({ silent: true });
    } catch (err) {
      alert(err.message || 'Failed to set default group');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Property Groups</div>
          <div style={styles.subtitle}>Organize properties into groups and set a default for dashboard aggregation</div>
        </div>
        <button style={styles.btnPrimary} onClick={startNew}>+ New Group</button>
      </div>

      {/* New / Edit form */}
      {editing !== null && (
        <div style={{ ...styles.card, border: '1px solid #378ADD' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>
              Group Name
            </label>
            <input style={styles.input} value={editName} onChange={e => setEditName(e.target.value)} placeholder="e.g. Alberta Portfolio" autoFocus />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
              Properties
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {properties.map(p => (
                <span
                  key={p.id}
                  style={editPropIds.includes(p.id) ? styles.propChipSelected : styles.propChip}
                  onClick={() => toggleProp(p.id)}
                >
                  {p.name}
                </span>
              ))}
              {properties.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>No properties yet</span>}
            </div>
          </div>

          <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" id="isDefault" checked={editIsDefault} onChange={e => setEditIsDefault(e.target.checked)} style={styles.checkbox} />
            <label htmlFor="isDefault" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Use as default group for dashboard & properties page
            </label>
          </div>

          <div style={styles.row}>
            <button style={styles.btnPrimary} onClick={handleSave} disabled={saving || !editName.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button style={styles.btn} onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {/* Group list */}
      {groups.map(g => {
        const isBuiltin = g.is_builtin;
        return (
          <div key={g.id} style={{ ...styles.card, opacity: isBuiltin ? 0.85 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: g.property_ids?.length ? '8px' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {isBuiltin ? '🌐' : '📁'} {g.name}
                </span>
                {g.is_default && <span style={styles.badge}>Default</span>}
                {isBuiltin && <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>built-in</span>}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                  {g.property_ids?.length || 0} {g.property_ids?.length === 1 ? 'property' : 'properties'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {!g.is_default && (
                  <button style={styles.btn} onClick={() => handleSetDefault(g)}>Set as Default</button>
                )}
                {!isBuiltin && (
                  <>
                    <button style={styles.btn} onClick={() => startEdit(g)}>Edit</button>
                    <button style={styles.btnDanger} onClick={() => handleDelete(g.id)}>Delete</button>
                  </>
                )}
              </div>
            </div>
            {g.property_ids?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {g.property_ids.map(pid => (
                  <span key={pid} style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '3px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    {propMap[pid] || `#${pid}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
        {defaultGroup
          ? `Dashboard and properties page show the "${defaultGroup.name}" group by default.`
          : `Dashboard and properties page show all properties by default.`}
      </div>
    </div>
  );
}
