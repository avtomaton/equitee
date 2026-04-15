import logging

from functools import wraps
from flask import jsonify
from validation import ValidationError
from utils.db import NotFoundError

logger = logging.getLogger(__name__)


def handle_errors(f):
    """Decorator: catch NotFoundError -> 404,
    ValidationError -> 400,
    any other Exception -> 500."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except NotFoundError as e:
            return jsonify({'error': str(e)}), 404
        except ValidationError as e:
            return jsonify({'error': str(e)}), 400
        except ValueError as e:
            return jsonify({'error': str(e)}), 400
        except Exception as e:
            logger.exception("Unhandled error in %s", f.__name__)
            return jsonify({'error': 'Internal server error'}), 500
    return wrapper
