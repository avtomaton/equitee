from flask import Flask
from flask_cors import CORS
import os

from utils.db import init_db, db_session
from routes import properties, expenses, income, tenants, events, misc, documents


app = Flask(__name__)
CORS(app)


# Initialize database
with app.app_context():
    init_db()


# Register all routes
properties.register_routes(app)
expenses.register_routes(app)
income.register_routes(app)
tenants.register_routes(app)
events.register_routes(app)
misc.register_routes(app)
documents.register_routes(app)


# Close database session after each request
@app.teardown_appcontext
def shutdown_session(exception=None):
    db_session.remove()


if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=5000, debug=debug)
