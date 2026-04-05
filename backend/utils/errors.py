from functools import wraps
from flask import jsonify
from validation import ValidationError
from utils.database import NotFoundError


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
            return jsonify({'error': str(e)}), 500
    return wrapper
