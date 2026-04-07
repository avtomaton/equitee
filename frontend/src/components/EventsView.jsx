import { useState, useEffect, useRef, useCallback } from 'react';
import { COLUMN_DEFS } from '../config.js';
import { getEvents, updateEvent, deleteEvent } from '../api.js';
import { useSilentLoading } from '../hooks/useSilentLoading.js';
import TruncatedCell from './Tooltip.jsx';
import MultiSelect from './MultiSelect.jsx';
import ResetColumnsButton from './ResetColumnsButton.jsx';
import { useColumnVisibility } from '../hooks/useColumnVisibility.js';
import { PropertyOptions } from '../modals/ModalBase.jsx';

/** Date string for an event, extracted from created_at (editable by user). */
const evDate = ev => (ev.created_at ?? '').split('T')[0].split(' ')[0];

export default function EventsView({ properties, initialPropertyId }) {
  const [events,         setEvents]         = useState([]);
  const [filterProperty, setFilterProperty] = useState(initialPropertyId ? String(initialPropertyId) : 'all');
  const [editingId,      setEditingId]      = useState(null);
  const [editNotes,      setEditNotes]      = useState('');
  const [editDate,       setEditDate]       = useState('');

  const { loading, wrapLoad } = useSilentLoading();

  const { visible, update: setVisible, col, isCustom, reset } = useColumnVisibility('events');
  const allColKeys   = COLUMN_DEFS.events.map(d => d.key);
  const allColLabels = Object.fromEntries(COLUMN_DEFS.events.map(d => [d.key, d.label]));

  const loadRef = useRef(null);

  const loadEvents = useCallback(async () => {
    await wrapLoad(async () => setEvents(await getEvents()));
  }, [wrapLoad]);
  loadRef.current = loadEvents;

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    if (initialPropertyId) setFilterProperty(String(initialPropertyId));
  }, [initialPropertyId]);

  const startEdit = (ev) => {
    setEditingId(ev.id);
    setEditNotes(ev.description || '');
    setEditDate(evDate(ev));
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id) => {
    try {
      await updateEvent(id, { description: editNotes, eventDate: editDate });
      await loadRef.current();
      setEditingId(null);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this event?')) return;
    const scroll = window.scrollY;
    try {
      await deleteEvent(id);
      await loadRef.current();
    } catch (e) { console.error(e); }
    window.scrollTo({ top: scroll, behavior: 'instant' });
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
              <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}
                className={filterProperty !== 'all' ? 'filter-active' : ''}>
                <PropertyOptions properties={properties} placeholder="All Properties" placeholderValue="all" />
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
                    {col('date') && (
                      <td className="col-shrink" style={{ fontSize: '0.8rem' }}>
                        {editingId === ev.id ? (
                          <input
                            type="date"
                            value={editDate}
                            onChange={e => setEditDate(e.target.value)}
                            style={{ width: '9rem' }}
                          />
                        ) : (
                          evDate(ev)
                        )}
                      </td>
                    )}
                    {col('property')  && <td className="col-fill"><TruncatedCell text={ev.property_name || '—'} /></td>}
                    {col('field')     && <td className="col-shrink" style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{ev.column_name}</td>}
                    {col('old_value') && <td className="col-fill"><TruncatedCell text={ev.old_value} /></td>}
                    {col('new_value') && <td className="col-fill"><TruncatedCell text={ev.new_value} /></td>}
                    {col('notes') && (
                      <td>
                        {editingId === ev.id ? (
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={editNotes}
                              onChange={e => setEditNotes(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(ev.id); if (e.key === 'Escape') cancelEdit(); }}
                              autoFocus
                              style={{ flex: 1, minWidth: 0 }}
                            />
                            <button className="btn btn-primary   btn-icon" onClick={() => saveEdit(ev.id)}>✓</button>
                            <button className="btn btn-secondary btn-icon" onClick={cancelEdit}>✕</button>
                          </div>
                        ) : (
                          <TruncatedCell text={ev.description || ''} />
                        )}
                      </td>
                    )}
                    <td>
                      <div className="row-actions">
                        {editingId !== ev.id && (
                          <button
                            className="btn btn-secondary btn-icon"
                            title="Edit date & notes"
                            onClick={() => startEdit(ev)}
                          >✏️</button>
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
