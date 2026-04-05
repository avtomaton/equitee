from contextlib import contextmanager
import sqlite3

DATABASE = 'real_estate.db'


def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_cursor():
    """Open a connection, yield (conn, cursor), commit on success, always close."""
    conn = get_db()
    try:
        cursor = conn.cursor()
        yield conn, cursor
        conn.commit()
    finally:
        conn.close()


def row_to_dict(row):
    return dict(row)


def require_exists(cursor, table, resource_id, label):
    """Raise NotFoundError if the row doesn't exist."""
    cursor.execute(f'SELECT id FROM {table} WHERE id = ?', (resource_id,))
    if not cursor.fetchone():
        raise NotFoundError(f'{label} not found')


class NotFoundError(Exception):
    """Raised when a requested resource doesn't exist."""
    pass
