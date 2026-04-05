from flask import request, jsonify, send_file
from utils.db import db_session_scope, require_exists
from utils.errors import handle_errors
from models.schema import Document, Property
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
        with db_session_scope() as session:
            property_id = request.args.get('property_id')
            query = session.query(Document)
            if property_id:
                query = query.filter(Document.property_id == property_id)
            documents = query.order_by(Document.uploaded_at.desc()).all()

            # Add property_name for backward compatibility
            result = []
            for d in documents:
                doc_dict = d.to_dict()
                doc_dict['property_name'] = d.property.name if d.property else None
                result.append(doc_dict)

            return jsonify(result), 200

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

        with db_session_scope() as session:
            # Verify property exists
            require_exists(session, Property, property_id, 'Property')

            document = Document(
                property_id=property_id,
                filename=safe_filename,
                original_filename=file.filename,
                mime_type=mime_type,
                size_bytes=file_size,
                doc_type=doc_type,
                notes=notes
            )
            session.add(document)
            session.flush()

            doc_dict = document.to_dict()
            doc_dict['property_name'] = document.property.name
            return jsonify(doc_dict), 201

    @app.route('/api/documents/<int:doc_id>', methods=['GET'])
    @handle_errors
    def download_document(doc_id):
        with db_session_scope() as session:
            document = require_exists(session, Document, doc_id, 'Document')
            doc = document.to_dict()

        file_path = os.path.join(UPLOAD_DIR, doc['filename'])
        if not os.path.exists(file_path):
            raise FileNotFoundError("File not found on disk")

        return send_file(file_path, mimetype=doc['mime_type'], as_attachment=True, download_name=doc['original_filename'])

    @app.route('/api/documents/<int:doc_id>', methods=['DELETE'])
    @handle_errors
    def delete_document(doc_id):
        with db_session_scope() as session:
            document = require_exists(session, Document, doc_id, 'Document')
            file_path = os.path.join(UPLOAD_DIR, document.filename)

            if os.path.exists(file_path):
                os.remove(file_path)

            session.delete(document)
            return jsonify({'message': 'Document deleted successfully'}), 200

    @app.route('/api/documents/types', methods=['GET'])
    @handle_errors
    def get_document_types():
        return jsonify(ALLOWED_DOC_TYPES), 200
