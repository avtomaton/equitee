import { useState, useEffect } from 'react';
import { API_URL } from '../config.js';
import TruncatedCell from './Tooltip.jsx';

export default function EventsView({ properties, initialPropertyId }) {
  const [events,       setEvents]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [filterProperty, setFilterProperty] = useState(initialPropertyId ? String(initialPropertyId) : 'all');
  const [editingId,    setEditingId]    = useState(null);
  const [editNotes,    setEditNotes]    = useState('');

  useEffect(() => { loadEvents(); }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/events`);
      if (res.ok) setEvents(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const startEdit = (event) => {
    setEditingId(event.id);
    setEditNotes(event.description || '');
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

  const cancelEdit = () => setEditingId(null);

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
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <div className="empty-state-text">No events recorded</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Property</th><th>Field</th>
                <th>Old Value</th><th>New Value</th><th>Notes</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ev => (
                <tr key={ev.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(ev.created_at).toLocaleString()}</td>
                  <td>{ev.property_name || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{ev.column_name}</td>
                  <td><TruncatedCell text={ev.old_value} /></td>
                  <td><TruncatedCell text={ev.new_value} /></td>
                  <td>
                    {editingId === ev.id ? (
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editNotes}
                          onChange={e => setEditNotes(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEdit(ev.id);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          autoFocus
                          style={{ flex: 1, minWidth: 0 }}
                        />
                        <button className="btn btn-primary btn-small"  onClick={() => saveEdit(ev.id)}>✓</button>
                        <button className="btn btn-secondary btn-small" onClick={cancelEdit}>✕</button>
                      </div>
                    ) : (
                      <TruncatedCell text={ev.description || ''} />
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      {editingId === ev.id ? null : (
                        <button className="btn btn-secondary btn-small" onClick={() => startEdit(ev)}>✏️ Edit</button>
                      )}
                      <button className="btn btn-danger btn-small" onClick={() => handleDelete(ev.id)}>🗑 Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
