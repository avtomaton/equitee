import { useState, useEffect, useCallback, useMemo, type FormEvent } from 'react';
import { getDocuments, getDocumentTypes, uploadDocument, deleteDocument, getDocumentUrl } from '../api';
import { useToast } from './Toast';
import type { Property } from '../types';

interface Document {
  id: number;
  property_id: number;
  property_name?: string;
  doc_type: string;
  original_filename: string;
  size_bytes: number;
  uploaded_at: string;
  notes?: string;
}

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const DOC_TYPE_COLORS: Record<string, string> = {
  Lease: '#3b82f6', Receipt: '#10b981', Inspection: '#f59e0b', Insurance: '#8b5cf6',
  Tax: '#ef4444', Photo: '#06b6d4', Other: '#6b7280',
};

export default function DocumentsView({ properties, initialPropertyId }: { properties: Property[]; initialPropertyId?: number }) {
  const { success, error: toastError } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docTypes, setDocTypes] = useState<string[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>(initialPropertyId ? String(initialPropertyId) : (properties.length === 1 ? String(properties[0].id) : ''));
  const [uploading, setUploading] = useState(false);
  const [uploadDocType, setUploadDocType] = useState('Receipt');
  const [uploadNotes, setUploadNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { getDocumentTypes().then(d => setDocTypes(d as string[])).catch(() => {}); }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const data = await getDocuments(selectedProperty ? parseInt(selectedProperty, 10) : undefined);
      setDocuments(data as Document[]);
    } catch (err) {
      console.error(err);
    }
  }, [selectedProperty]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProperty) { toastError('Please select a property first'); return; }
    const fileInput = document.getElementById('doc-file-input') as HTMLInputElement | null;
    if (!fileInput?.files?.length) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('property_id', selectedProperty);
    formData.append('doc_type', uploadDocType);
    if (uploadNotes) formData.append('notes', uploadNotes);

    try {
      setUploading(true);
      await uploadDocument(formData);
      success('Document uploaded');
      setUploadNotes('');
      fileInput.value = '';
      loadDocuments();
    } catch (err) {
      console.error(err);
      toastError((err as Error).message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this document?')) return;
    try {
      await deleteDocument(id);
      success('Document deleted');
      loadDocuments();
    } catch (err) {
      console.error(err);
      toastError('Failed to delete document');
    }
  };

  const handleDownload = (doc: Document) => {
    const a = document.createElement('a');
    a.href = getDocumentUrl(doc.id);
    a.download = doc.original_filename;
    a.click();
  };

  const propIdSet = useMemo(() => new Set(properties.map((p: Property) => p.id)), [properties]);

  const filtered = useMemo(() => {
    const scoped = documents.filter(d => propIdSet.has(d.property_id));
    if (!searchTerm) return scoped;
    const q = searchTerm.toLowerCase();
    return scoped.filter(d =>
      d.original_filename.toLowerCase().includes(q) ||
      d.doc_type.toLowerCase().includes(q) ||
      (d.property_name && d.property_name.toLowerCase().includes(q)) ||
      (d.notes && d.notes.toLowerCase().includes(q))
    );
  }, [documents, searchTerm, propIdSet]);

  return (
    <div className="documents-view">
      <div className="documents-header">
        <h1 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Documents</h1>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={selectedProperty} onChange={e => setSelectedProperty(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            <option value="">All Properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!selectedProperty && <span style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>Select the property to upload</span>}
          <input type="text" placeholder="Search documents..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', flex: '1', minWidth: '200px' }} />
        </div>
      </div>

      <form onSubmit={handleUpload} style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>Upload Document</h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>File</label>
            <input id="doc-file-input" type="file" style={{ fontSize: '0.85rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Type</label>
            <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value)}
              style={{ padding: '0.4rem', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Notes</label>
            <input type="text" value={uploadNotes} onChange={e => setUploadNotes(e.target.value)} placeholder="Optional"
              style={{ padding: '0.4rem', borderRadius: '6px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', width: '100%' }} />
          </div>
          <button type="submit" disabled={uploading}
            style={{ padding: '0.5rem 1.25rem', background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: uploading ? 'wait' : 'pointer', fontWeight: '600', fontSize: '0.85rem' }}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </form>

      {filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '3rem' }}>No documents found</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {filtered.map(doc => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ width: '4px', height: '40px', borderRadius: '2px', background: DOC_TYPE_COLORS[doc.doc_type] || DOC_TYPE_COLORS.Other, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.original_filename}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  <span style={{ color: 'var(--accent-secondary)' }}>{doc.property_name || 'Unknown Property'}</span>
                  {' · '}<span style={{ color: DOC_TYPE_COLORS[doc.doc_type] || DOC_TYPE_COLORS.Other }}>{doc.doc_type}</span>
                  {' · '}{fmtSize(doc.size_bytes)}
                  {' · '}{new Date(doc.uploaded_at).toLocaleDateString()}
                  {doc.notes && ` · ${doc.notes}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => handleDownload(doc)} style={{ padding: '0.35rem 0.75rem', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Download</button>
                <button onClick={() => handleDelete(doc.id)} style={{ padding: '0.35rem 0.75rem', background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
