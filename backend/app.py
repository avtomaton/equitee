from flask import Flask
from flask_cors import CORS

from utils.database import get_db
from models.database import init_db
from routes import properties, expenses, income, tenants, events, misc


app = Flask(__name__)
CORS(app)


# Initialize database
with app.app_context():
    conn = get_db()
    init_db(conn)
    conn.close()


# Register all routes
properties.register_routes(app)
expenses.register_routes(app)
income.register_routes(app)
tenants.register_routes(app)
events.register_routes(app)
misc.register_routes(app)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
