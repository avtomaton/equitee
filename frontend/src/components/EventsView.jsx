import { useState, useEffect } from 'react';
import { API_URL, COLUMN_DEFS } from '../config.js';
import TruncatedCell from './Tooltip.jsx';
import MultiSelect from './MultiSelect.jsx';
import { useColumnVisibility } from '../hooks.js';

export default function EventsView({ properties, initialPropertyId }) {
  const [events,         setEvents]         = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [filterProperty, setFilterProperty] = useState(initialPropertyId ? String(initialPropertyId) : 'all');
  const [editingId,      setEditingId]      = useState(null);
  const [editNotes,      setEditNotes]      = useState('');

  const { visible, update: setVisible, col, isCustom, reset } = useColumnVisibility('events');
  const allColKeys   = COLUMN_DEFS.events.map(d => d.key);
  const allColLabels = Object.fromEntries(COLUMN_DEFS.events.map(d => [d.key, d.label]));

  useEffect(() => { loadEvents(); }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/events`);
      if (res.ok) setEvents(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const saveEdit = async (id) => {
    try {
      const res = await fetch(`${API_URL}/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editNotes }),
      });
      if (res.ok) { loadEvents(); setEditingId(null); }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this event?')) return;
    const res = await fetch(`${API_URL}/events/${id}`, { method: 'DELETE' });
    if (res.ok) loadEvents();
  };

  const filtered = events.filter(
    e => filterProperty === 'all' || e.property_id === parseInt(filterProperty)
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Events Log</h1>
          <p className="page-subtitle">Track property changes and history</p>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <div className="table-title">All Events ({filtered.length})</div>
          <div className="table-controls">
            <div className="filter-group">
              <span className="filter-label">Filter:</span>
              <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}>
                <option value="all">All Properties</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            <div className="empty-state-icon">📝</div>
            <div className="empty-state-text">No events recorded</div>
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table>
              <thead><tr>
                {col('date')      && <th>Date</th>}
                {col('property')  && <th>Property</th>}
                {col('field')     && <th>Field</th>}
                {col('old_value') && <th>Old</th>}
                {col('new_value') && <th>New</th>}
                {col('notes')     && <th>Notes</th>}
                <th style={{ width: 52 }}></th>
              </tr></thead>
              <tbody>
                {filtered.map(ev => (
                  <tr key={ev.id}>
                    {col('date')      && <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{new Date(ev.created_at).toLocaleString()}</td>}
                    {col('property')  && <td><TruncatedCell text={ev.property_name || '—'} maxWidth={110} /></td>}
                    {col('field')     && <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{ev.column_name}</td>}
                    {col('old_value') && <td><TruncatedCell text={ev.old_value} maxWidth={100} /></td>}
                    {col('new_value') && <td><TruncatedCell text={ev.new_value} maxWidth={100} /></td>}
                    {col('notes')     && (
                      <td>
                        {editingId === ev.id ? (
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(ev.id); if (e.key === 'Escape') setEditingId(null); }}
                              autoFocus style={{ flex: 1, minWidth: 0 }} />
                            <button className="btn btn-primary   btn-icon" onClick={() => saveEdit(ev.id)}>✓</button>
                            <button className="btn btn-secondary btn-icon" onClick={() => setEditingId(null)}>✕</button>
                          </div>
                        ) : (
                          <TruncatedCell text={ev.description || ''} />
                        )}
                      </td>
                    )}
                    <td>
                      <div className="row-actions">
                        {editingId !== ev.id && (
                          <button className="btn btn-secondary btn-icon" title="Edit notes"
                            onClick={() => { setEditingId(ev.id); setEditNotes(ev.description || ''); }}>✏️</button>
                        )}
                        <button className="btn btn-danger btn-icon" title="Delete" onClick={() => handleDelete(ev.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
