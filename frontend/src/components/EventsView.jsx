import { useState, useEffect } from 'react';
import { COLUMN_DEFS } from '../config.js';
import { getEvents, updateEvent, deleteEvent } from '../api.js';
import TruncatedCell from './Tooltip.jsx';
import MultiSelect from './MultiSelect.jsx';
import ResetColumnsButton from './ResetColumnsButton.jsx';
import { useColumnVisibility } from '../hooks/useColumnVisibility.js';
import { PropertyOptions } from '../modals/ModalBase.jsx';

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
      setEvents(await getEvents());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const saveEdit = async (id) => {
    try {
      await updateEvent(id, { description: editNotes });
      loadEvents();
      setEditingId(null);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this event?')) return;
    try { await deleteEvent(id); loadEvents(); } catch (e) { console.error(e); }
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
                <PropertyOptions properties={properties} placeholder="All Properties" />
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
            <div className="empty-state-icon">📝</div>
            <div className="empty-state-text">No events recorded</div>
          </div>
        ) : (
          <div className="table-scroll-wrap">
            <table>
              <thead><tr>
                {col('date')      && <th className="col-shrink">Date</th>}
                {col('property')  && <th className="col-fill">Property</th>}
                {col('field')     && <th className="col-shrink">Field</th>}
                {col('old_value') && <th className="col-fill">Old</th>}
                {col('new_value') && <th className="col-fill">New</th>}
                {col('notes')     && <th className="col-fill">Notes</th>}
                <th style={{ width: 52 }}></th>
              </tr></thead>
              <tbody>
                {filtered.map(ev => (
                  <tr key={ev.id}>
                    {col('date')      && <td className="col-shrink" style={{ fontSize: '0.8rem' }}>{new Date(ev.created_at).toLocaleString()}</td>}
                    {col('property')  && <td className="col-fill"><TruncatedCell text={ev.property_name || '—'} /></td>}
                    {col('field')     && <td className="col-shrink" style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{ev.column_name}</td>}
                    {col('old_value') && <td className="col-fill"><TruncatedCell text={ev.old_value} /></td>}
                    {col('new_value') && <td className="col-fill"><TruncatedCell text={ev.new_value} /></td>}
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
