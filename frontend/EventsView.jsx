import { useState, useEffect } from 'react';
import { API_URL } from '../config.js';

export default function EventsView({ properties }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterProperty, setFilterProperty] = useState('all');
  const [editingEvent, setEditingEvent] = useState(null);
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => { loadEvents(); }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/events`);
      if (res.ok) setEvents(await res.json());
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditDescription = async (eventId) => {
    try {
      const res = await fetch(`${API_URL}/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editDescription }),
      });
      if (res.ok) {
        loadEvents();
        setEditingEvent(null);
        setEditDescription('');
      }
    } catch (error) {
      console.error('Error updating event:', error);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      const res = await fetch(`${API_URL}/events/${eventId}`, { method: 'DELETE' });
      if (res.ok) loadEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  const filteredEvents = events.filter(
    (e) => filterProperty === 'all' || e.property_id === parseInt(filterProperty)
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
          <div className="table-title">All Events ({filteredEvents.length})</div>
          <div className="table-controls">
            <div className="filter-group">
              <span className="filter-label">Filter:</span>
              <select value={filterProperty} onChange={(e) => setFilterProperty(e.target.value)}>
                <option value="all">All Properties</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filteredEvents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <div className="empty-state-text">No events recorded</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Property</th><th>Field</th>
                <th>Old Value</th><th>New Value</th><th>Description</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.created_at).toLocaleString()}</td>
                  <td>{event.property_name || 'N/A'}</td>
                  <td>{event.column_name}</td>
                  <td>{event.old_value}</td>
                  <td>{event.new_value}</td>
                  <td>
                    {editingEvent === event.id ? (
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        onBlur={() => handleEditDescription(event.id)}
                        onKeyPress={(e) => e.key === 'Enter' && handleEditDescription(event.id)}
                        autoFocus
                      />
                    ) : (
                      <span
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setEditingEvent(event.id);
                          setEditDescription(event.description || '');
                        }}
                      >
                        {event.description || '(click to add)'}
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-danger btn-small" onClick={() => handleDeleteEvent(event.id)}>
                      🗑 Delete
                    </button>
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
