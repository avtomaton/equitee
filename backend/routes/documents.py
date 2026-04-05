from flask import request, jsonify, send_file
from utils.database import db_cursor, require_exists
from utils.errors import handle_errors
from validation import validate_required, validate_string_length, sanitize_html
import os
import uuid

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_MIME_TYPES = {
    'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
}
ALLOWED_DOC_TYPES = ['Lease', 'Receipt', 'Inspection', 'Insurance', 'Tax', 'Photo', 'Other']


def register_routes(app):
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    @app.route('/api/documents', methods=['GET'])
    @handle_errors
    def get_documents():
        with db_cursor() as (_, cursor):
            property_id = request.args.get('property_id')
            if property_id:
                cursor.execute('''
                    SELECT d.*, p.name as property_name
                    FROM documents d LEFT JOIN properties p ON d.property_id = p.id
                    WHERE d.property_id = ? ORDER BY d.uploaded_at DESC
                ''', (property_id,))
            else:
                cursor.execute('''
                    SELECT d.*, p.name as property_name
                    FROM documents d LEFT JOIN properties p ON d.property_id = p.id
                    ORDER BY d.uploaded_at DESC
                ''')
            return jsonify([dict(r) for r in cursor.fetchall()]), 200

    @app.route('/api/documents', methods=['POST'])
    @handle_errors
    def create_document():
        validate_required(request.form, ['property_id', 'doc_type'])
        property_id = int(request.form['property_id'])
        doc_type = request.form['doc_type']
        notes = sanitize_html(validate_string_length(request.form.get('notes', ''), 'notes', 500))

        if doc_type not in ALLOWED_DOC_TYPES:
            raise ValueError(f"Invalid document type. Must be one of: {', '.join(ALLOWED_DOC_TYPES)}")

        if 'file' not in request.files:
            raise ValueError("No file provided")

        file = request.files['file']
        if file.filename == '':
            raise ValueError("No file selected")

        if file.content_length and file.content_length > MAX_FILE_SIZE:
            raise ValueError("File too large (max 10MB)")

        safe_filename = f"{uuid.uuid4().hex}_{file.filename}"
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        file.save(file_path)

        file_size = os.path.getsize(file_path)
        mime_type = file.content_type or 'application/octet-stream'

        with db_cursor() as (_, cursor):
            require_exists(cursor, 'properties', property_id, 'Property')
            cursor.execute(
                'INSERT INTO documents (property_id, filename, original_filename, mime_type, size_bytes, doc_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                (property_id, safe_filename, file.filename, mime_type, file_size, doc_type, notes))
            new_id = cursor.lastrowid
            cursor.execute('''
                SELECT d.*, p.name as property_name
                FROM documents d LEFT JOIN properties p ON d.property_id = p.id
                WHERE d.id = ?
            ''', (new_id,))
            return jsonify(dict(cursor.fetchone())), 201

    @app.route('/api/documents/<int:doc_id>', methods=['GET'])
    @handle_errors
    def download_document(doc_id):
        with db_cursor() as (_, cursor):
            require_exists(cursor, 'documents', doc_id, 'Document')
            cursor.execute('SELECT * FROM documents WHERE id = ?', (doc_id,))
            doc = dict(cursor.fetchone())

        file_path = os.path.join(UPLOAD_DIR, doc['filename'])
        if not os.path.exists(file_path):
            raise FileNotFoundError("File not found on disk")

        return send_file(file_path, mimetype=doc['mime_type'], as_attachment=True, download_name=doc['original_filename'])

    @app.route('/api/documents/<int:doc_id>', methods=['DELETE'])
    @handle_errors
    def delete_document(doc_id):
        with db_cursor() as (_, cursor):
            require_exists(cursor, 'documents', doc_id, 'Document')
            cursor.execute('SELECT filename FROM documents WHERE id = ?', (doc_id,))
            doc = dict(cursor.fetchone())
            file_path = os.path.join(UPLOAD_DIR, doc['filename'])
            if os.path.exists(file_path):
                os.remove(file_path)
            cursor.execute('DELETE FROM documents WHERE id = ?', (doc_id,))
            return jsonify({'message': 'Document deleted successfully'}), 200

    @app.route('/api/documents/types', methods=['GET'])
    @handle_errors
    def get_document_types():
        return jsonify(ALLOWED_DOC_TYPES), 200
