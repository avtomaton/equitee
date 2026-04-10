from flask import request, jsonify, send_file
from utils.db import tenant_session, require_exists
from utils.errors import handle_errors
from middleware.tenant_router import tenant_required
from models.schema import Document, Property
from validation import validate_required, validate_string_length, sanitize_html
import os
import uuid

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Allowed MIME types
ALLOWED_MIME_TYPES = {
    'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
}

# Allowed file extensions (whitelist)
ALLOWED_EXTENSIONS = {
    '.pdf',
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.doc', '.docx',
    '.xls', '.xlsx',
    '.txt',
}

# Extension to MIME type mapping for validation
EXTENSION_MIME_MAP = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
}

ALLOWED_DOC_TYPES = ['Lease', 'Receipt', 'Inspection', 'Insurance', 'Tax', 'Photo', 'Other']


def validate_file_upload(file, max_size=MAX_FILE_SIZE):
    """Comprehensive file upload validation.

    Checks:
    - File exists and has a filename
    - File extension is in whitelist
    - File size is within limits
    - MIME type is allowed
    - File content matches claimed MIME type (magic bytes check)
    - Filename is sanitized (no path traversal)

    Returns:
        tuple: (safe_extension, validated_mime_type)

    Raises:
        ValueError: If any validation fails
    """
    if not file.filename or file.filename == '':
        raise ValueError("No file selected")

    # Check for path traversal attempts in filename
    filename = os.path.basename(file.filename)
    if filename != file.filename:
        raise ValueError("Invalid filename: path traversal not allowed")

    # Get file extension
    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type not allowed. Allowed types: {', '.join(sorted(ALLOWED_EXTENSIONS))}")

    # Check file size
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size > max_size:
        raise ValueError(f"File too large ({file_size / 1024 / 1024:.1f}MB). Maximum size: {max_size / 1024 / 1024:.0f}MB")

    if file_size == 0:
        raise ValueError("File is empty")

    # Derive MIME type from file extension (already validated against ALLOWED_EXTENSIONS)
    claimed_mime = EXTENSION_MIME_MAP.get(ext, 'application/octet-stream')

    # For images, verify magic bytes match the claimed type
    if ext in ('.jpg', '.jpeg', '.png', '.gif', '.webp'):
        header = file.read(32)
        file.seek(0)
        if not _verify_image_magic(header, ext):
            raise ValueError("File content does not match claimed image type")

    # For PDF, check magic bytes
    if ext == '.pdf':
        header = file.read(5)
        file.seek(0)
        if header != b'%PDF-':
            raise ValueError("File content does not match claimed PDF type")

    # For Office documents, verify OLE2 or ZIP magic bytes
    if ext in ('.doc', '.xls'):
        # OLE2 Compound File magic
        header = file.read(8)
        file.seek(0)
        if len(header) < 8 or header[:8] != b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
            raise ValueError("File content does not match claimed Office document type")
    elif ext in ('.docx', '.xlsx'):
        # ZIP file magic bytes (PK\x03\x04)
        header = file.read(4)
        file.seek(0)
        if len(header) < 4 or header[:4] != b'PK\x03\x04':
            raise ValueError("File content does not match claimed Office Open XML type")
    elif ext == '.txt':
        # Verify content is valid text (UTF-8/ASCII)
        try:
            file.read(1024).decode('utf-8')
            file.seek(0)
        except UnicodeDecodeError:
            raise ValueError("File content does not match claimed text type")

    return ext, claimed_mime


def _verify_image_magic(header, ext):
    """Verify image file magic bytes match the claimed extension."""
    if ext in ('.jpg', '.jpeg'):
        return len(header) >= 2 and header[:2] == b'\xff\xd8'
    elif ext == '.png':
        return len(header) >= 8 and header[:8] == b'\x89PNG\r\n\x1a\n'
    elif ext == '.gif':
        return len(header) >= 6 and header[:6] in (b'GIF87a', b'GIF89a')
    elif ext == '.webp':
        return len(header) >= 12 and header[:4] == b'RIFF' and header[8:12] == b'WEBP'
    return True  # Unknown type, skip check


def register_routes(app):
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    @app.route('/api/documents', methods=['GET'])
    @tenant_required
    @handle_errors
    def get_documents():
        with tenant_session() as session:
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
    @tenant_required
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

        # Validate file (extension, size, MIME type, magic bytes)
        ext, mime_type = validate_file_upload(file)

        # Generate safe filename using UUID only — no extension stored on disk
        # to prevent serving executable content (e.g., SVG with <script>).
        # Original filename is preserved in DB and used as download_name.
        safe_filename = uuid.uuid4().hex
        file_path = os.path.join(UPLOAD_DIR, safe_filename)

        # Save file with cleanup on failure
        try:
            file.seek(0)
            file.save(file_path)
            file_size = os.path.getsize(file_path)
        except Exception:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise

        with tenant_session() as session:
            # Verify property exists
            require_exists(session, Property, property_id, 'Property')

            document = Document(
                property_id=property_id,
                filename=safe_filename,
                original_filename=os.path.basename(file.filename),
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
    @tenant_required
    @handle_errors
    def download_document(doc_id):
        with tenant_session() as session:
            document = require_exists(session, Document, doc_id, 'Document')
            doc = document.to_dict()

        file_path = os.path.join(UPLOAD_DIR, doc['filename'])
        if not os.path.exists(file_path):
            raise FileNotFoundError("File not found on disk")

        return send_file(file_path, mimetype=doc['mime_type'], as_attachment=True, download_name=doc['original_filename'])

    @app.route('/api/documents/<int:doc_id>', methods=['DELETE'])
    @tenant_required
    @handle_errors
    def delete_document(doc_id):
        with tenant_session() as session:
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
