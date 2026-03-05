import { useState } from 'react';
import PropertyCard from './PropertyCard.jsx';

export default function PropertiesView({ properties, onPropertyClick, onAddProperty, onEditProperty }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredProperties = properties.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.city.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || p.status.toLowerCase() === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Properties</h1>
          <p className="page-subtitle">Manage your real estate portfolio</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={onAddProperty}>
            + Add Property
          </button>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <div className="table-title">All Properties ({filteredProperties.length})</div>
          <div className="table-controls">
            <div className="filter-group">
              <span className="filter-label">Filter:</span>
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '200px' }}
              />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </div>

        {filteredProperties.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏢</div>
            <div className="empty-state-text">No properties found</div>
          </div>
        ) : (
          <div className="property-grid" style={{ padding: '1.5rem' }}>
            {filteredProperties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                onClick={() => onPropertyClick(property)}
                onEdit={onEditProperty}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
