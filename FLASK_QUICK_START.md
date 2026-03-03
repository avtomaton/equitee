# Flask Backend Solution - Quick Start

## What You Have

Three files for the Flask backend solution:
1. **flask-app.py** - The Python backend server
2. **flask-frontend.html** - The frontend application
3. **flask-requirements.txt** - Python dependencies

## Quick Setup (5 Minutes)

### Step 1: Install Python
Make sure you have Python 3.8+ installed:
```bash
python --version
# or
python3 --version
```

If not installed, download from: https://www.python.org/downloads/

### Step 2: Install Dependencies
```bash
# Install Flask and flask-cors
pip install -r flask-requirements.txt

# Or install manually:
pip install Flask flask-cors
```

### Step 3: Run the Server
```bash
# Run the backend server
python flask-app.py

# Or on Mac/Linux:
python3 flask-app.py
```

You should see:
```
* Running on http://0.0.0.0:5000
Database initialized successfully!
```

✅ **Backend is now running!**

### Step 4: Open the Frontend
1. Open `flask-frontend.html` in your web browser
2. You should see "API Connected" (green status)
3. Start adding properties!

## File Organization

Rename the files to organize them better:
```
your-folder/
├── app.py (rename from flask-app.py)
├── requirements.txt (rename from flask-requirements.txt)
├── frontend.html (rename from flask-frontend.html)
└── real_estate.db (created automatically)
```

## Features

✅ Full REST API with Flask
✅ SQLite database (local file)
✅ Add/Edit/Delete properties
✅ Track income & expenses
✅ Beautiful charts and statistics
✅ JSON Import/Export
✅ Runs 100% offline

## Common Issues

### "Address already in use"
Port 5000 is taken. Change the port in `flask-app.py`:
```python
app.run(host='0.0.0.0', port=8080, debug=True)  # Change to 8080
```

Then update in `flask-frontend.html`:
```javascript
const DEFAULT_API_URL = 'http://localhost:8080/api';
```

### "Module not found: Flask"
Install dependencies:
```bash
pip install Flask flask-cors
```

### Frontend shows "API Offline"
1. Make sure the Flask server is running
2. Check terminal for errors
3. Try: http://localhost:5000/api/health in your browser

## What Next?

Read **FLASK_SETUP.md** for:
- Detailed deployment options
- Security best practices
- Production configuration
- Switching to PostgreSQL
- And much more!

## API Endpoints

Your backend exposes these endpoints:

- `GET http://localhost:5000/api/properties` - Get all properties
- `POST http://localhost:5000/api/properties` - Create property
- `PUT http://localhost:5000/api/properties/<id>` - Update property
- `DELETE http://localhost:5000/api/properties/<id>` - Delete property
- `GET http://localhost:5000/api/statistics` - Get statistics
- `GET http://localhost:5000/api/export` - Export JSON
- `POST http://localhost:5000/api/import` - Import JSON

## Testing the API

Open http://localhost:5000 in your browser to see API documentation.

Or use curl:
```bash
# Check health
curl http://localhost:5000/api/health

# Get all properties
curl http://localhost:5000/api/properties

# Get statistics
curl http://localhost:5000/api/statistics
```

## Backup Your Data

Your database is in `real_estate.db` - just copy this file to backup!

```bash
# Backup
cp real_estate.db backup.db

# Restore
cp backup.db real_estate.db
```

## Need Help?

Check **FLASK_SETUP.md** for complete documentation including:
- Troubleshooting guide
- Deployment instructions
- Security configuration
- Database migration
- And more!

---

**That's it!** You now have a fully functional real estate analytics platform with a Python backend. 🎉
