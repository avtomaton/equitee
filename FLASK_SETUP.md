# Real Estate Analytics - Flask Backend Setup Guide

## Overview
This solution uses Python Flask as the REST API backend with SQLite database. Full control over your data and server.

## Prerequisites
- Python 3.8 or higher
- pip (Python package manager)
- A text editor or IDE
- Terminal/Command Prompt

## Quick Start (5 minutes)

### Step 1: Install Python
**Windows:**
1. Download from https://www.python.org/downloads/
2. Run installer
3. ✅ Check "Add Python to PATH"
4. Verify: `python --version`

**Mac:**
```bash
# Using Homebrew
brew install python3

# Verify
python3 --version
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3 python3-pip

# Verify
python3 --version
```

### Step 2: Set Up the Backend

1. **Navigate to the backend folder:**
```bash
cd flask_backend
```

2. **Install dependencies:**
```bash
pip install -r requirements.txt
```

Or manually:
```bash
pip install Flask flask-cors
```

3. **Run the server:**
```bash
python app.py
```

You should see:
```
* Running on http://0.0.0.0:5000
* Debug mode: on
```

✅ **Backend is now running!**

### Step 3: Run the Frontend

1. Open `frontend.html` in your web browser
2. The app will automatically connect to `http://localhost:5000/api`
3. You should see "API Connected" (green status)
4. Start adding properties!

## File Structure
```
flask_backend/
├── app.py              # Flask server & API endpoints
├── requirements.txt    # Python dependencies
├── frontend.html       # Frontend application
└── real_estate.db     # SQLite database (auto-created)
```

## API Endpoints

### Properties
- `GET /api/properties` - Get all properties
- `GET /api/properties/<id>` - Get single property
- `POST /api/properties` - Create new property
- `PUT /api/properties/<id>` - Update property
- `DELETE /api/properties/<id>` - Delete property

### Data Management
- `GET /api/statistics` - Get portfolio statistics
- `POST /api/import` - Import from JSON
- `GET /api/export` - Export to JSON
- `GET /api/health` - Health check

## Features

### Full Backend Control
- SQLite database (easy to backup)
- Full REST API
- No vendor lock-in
- Run locally or deploy anywhere

### JSON Import/Export
- **Export**: GET request to `/api/export`
- **Import**: POST JSON array to `/api/import`
- Button integration in frontend

### Database Management
- All data in `real_estate.db` file
- Easy to backup: just copy the file
- View with any SQLite browser

## Usage

### Starting the Server
```bash
cd flask_backend
python app.py
```

Keep this terminal window open while using the app.

### Stopping the Server
Press `Ctrl+C` in the terminal

### Accessing the API
**In browser:**
- http://localhost:5000/ - API documentation
- http://localhost:5000/api/health - Health check

**Using curl:**
```bash
# Get all properties
curl http://localhost:5000/api/properties

# Get statistics
curl http://localhost:5000/api/statistics

# Create property
curl -X POST http://localhost:5000/api/properties \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Property",
    "address": "123 Main St",
    "purchasePrice": 300000,
    "monthlyRent": 2500,
    "expenses": [
      {"type": "Mortgage", "amount": 1500, "recurring": true}
    ]
  }'
```

## Configuration

### Change Port
In `app.py`, modify the last line:
```python
app.run(host='0.0.0.0', port=8080, debug=True)  # Change 5000 to 8080
```

Then update frontend URL:
```javascript
const DEFAULT_API_URL = 'http://localhost:8080/api';
```

### Enable CORS for Different Origins
Already enabled by default. To restrict:
```python
from flask_cors import CORS

# Only allow specific origin
CORS(app, origins=['http://yourfrontend.com'])
```

### Database Location
Default: `real_estate.db` in the same folder as `app.py`

To change:
```python
DATABASE = '/path/to/your/database.db'
```

## Deployment

### Option 1: Local Network Access
Make accessible to other devices on your network:

1. Find your local IP:
```bash
# Windows
ipconfig

# Mac/Linux
ifconfig
```

2. Server is already listening on `0.0.0.0:5000`
3. Access from other devices: `http://YOUR_IP:5000`
4. Update frontend API URL to: `http://YOUR_IP:5000/api`

### Option 2: Deploy to Cloud (Render.com - Free)

1. **Prepare files:**
   - Ensure `requirements.txt` exists
   - Add `Procfile`:
   ```
   web: python app.py
   ```

2. **Create Render account:**
   - Go to https://render.com
   - Sign up (free tier available)

3. **Deploy:**
   - Click "New +" → "Web Service"
   - Connect GitHub repo or upload files
   - Settings:
     - Environment: Python 3
     - Build Command: `pip install -r requirements.txt`
     - Start Command: `python app.py`
   - Click "Create Web Service"

4. **Get URL:**
   - Render gives you: `https://your-app.onrender.com`
   - Update frontend: `const DEFAULT_API_URL = 'https://your-app.onrender.com/api';`

### Option 3: Deploy to Railway.app (Free)

1. Visit https://railway.app
2. Sign up with GitHub
3. "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway auto-detects Python and deploys
6. Get your URL and update frontend

### Option 4: Deploy to Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Launch app
flyctl launch

# Deploy
flyctl deploy
```

### Option 5: Traditional VPS (DigitalOcean, Linode, AWS)

**Production setup with Gunicorn:**

1. **Install Gunicorn:**
```bash
pip install gunicorn
```

2. **Update requirements.txt:**
```
Flask==3.0.0
flask-cors==4.0.0
gunicorn==21.2.0
```

3. **Run with Gunicorn:**
```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

4. **Use systemd for auto-start:**
Create `/etc/systemd/system/realestate-api.service`:
```ini
[Unit]
Description=Real Estate Analytics API
After=network.target

[Service]
User=youruser
WorkingDirectory=/path/to/flask_backend
ExecStart=/usr/bin/gunicorn -w 4 -b 0.0.0.0:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable realestate-api
sudo systemctl start realestate-api
```

5. **Set up Nginx reverse proxy:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Backup & Restore

### Backup Database
**Simple method:**
```bash
# Just copy the file
cp real_estate.db backup-$(date +%Y%m%d).db
```

**Using SQLite:**
```bash
sqlite3 real_estate.db ".backup backup.db"
```

### Restore Database
```bash
cp backup.db real_estate.db
```

### Export to JSON (for migration)
```bash
curl http://localhost:5000/api/export > backup.json
```

### Import from JSON
```bash
curl -X POST http://localhost:5000/api/import \
  -H "Content-Type: application/json" \
  -d @backup.json
```

## Troubleshooting

### "Address already in use"
Port 5000 is taken. Options:
1. Stop the other service
2. Change port in `app.py`

### "Module not found" errors
```bash
pip install -r requirements.txt
```

### CORS errors in browser
Check that `flask-cors` is installed and CORS is enabled in `app.py`

### Database locked errors
SQLite doesn't handle high concurrency. For production with multiple users, upgrade to PostgreSQL:

```python
# Use PostgreSQL instead
from flask_sqlalchemy import SQLAlchemy

app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://user:pass@localhost/dbname'
db = SQLAlchemy(app)
```

### Frontend can't connect
1. Verify server is running: `curl http://localhost:5000/api/health`
2. Check browser console for errors
3. Verify API URL in frontend matches server address
4. Check firewall settings

## Security (Production)

### Add Authentication
```python
from flask_httpauth import HTTPBasicAuth
auth = HTTPBasicAuth()

@auth.verify_password
def verify_password(username, password):
    # Implement your auth logic
    return username == 'admin' and password == 'secret'

@app.route('/api/properties')
@auth.login_required
def get_properties():
    # Your code
```

### Use Environment Variables
```python
import os

# Never hardcode secrets
SECRET_KEY = os.environ.get('SECRET_KEY')
DATABASE = os.environ.get('DATABASE_URL', 'real_estate.db')
```

### Enable HTTPS
Use Let's Encrypt with Nginx or use platform SSL (Render, Railway provide it free)

### Rate Limiting
```python
from flask_limiter import Limiter

limiter = Limiter(app, key_func=lambda: request.remote_addr)

@app.route('/api/properties')
@limiter.limit("100 per hour")
def get_properties():
    # Your code
```

## Switching from SQLite to PostgreSQL

For production with multiple concurrent users:

1. **Install PostgreSQL:**
```bash
# Ubuntu
sudo apt install postgresql
```

2. **Install Python driver:**
```bash
pip install psycopg2-binary
```

3. **Update app.py:**
```python
import psycopg2
from psycopg2.extras import RealDictCursor

def get_db():
    conn = psycopg2.connect(
        host="localhost",
        database="realestate",
        user="your_user",
        password="your_password"
    )
    conn.row_factory = RealDictCursor
    return conn
```

## Monitoring

### Check Server Status
```bash
curl http://localhost:5000/api/health
```

### View Logs
```bash
tail -f /var/log/realestate-api.log
```

### Database Size
```bash
ls -lh real_estate.db
```

## Performance Tips

1. **Use indexes** for faster queries:
```sql
CREATE INDEX idx_properties_name ON properties(name);
```

2. **Enable caching** for read-heavy workloads:
```python
from flask_caching import Cache
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

@app.route('/api/statistics')
@cache.cached(timeout=60)
def get_statistics():
    # Cached for 60 seconds
```

3. **Use database connection pooling** for PostgreSQL

4. **Gzip compression**:
```python
from flask_compress import Compress
Compress(app)
```

## Cost Comparison

### Free Options
- **Railway.app**: Free tier includes $5 credit/month
- **Render.com**: Free tier available (sleeps after 15 min inactivity)
- **Fly.io**: Free tier includes 3 VMs
- **Self-hosted**: $0 (runs on your computer)

### Paid Options
- **DigitalOcean Droplet**: $6/month (basic)
- **AWS EC2**: ~$10/month (t3.micro)
- **Heroku**: $7/month (basic dyno)

## Next Steps

- [ ] Add user authentication
- [ ] Implement API rate limiting
- [ ] Add more analytics endpoints
- [ ] Set up automated backups
- [ ] Add property photos upload
- [ ] Create admin dashboard
- [ ] Add email notifications
- [ ] Implement caching layer

## Support

Common issues:
1. Check Python version: `python --version`
2. Verify dependencies: `pip list`
3. Test API: `curl http://localhost:5000/api/health`
4. Check logs in terminal
5. Verify database exists: `ls real_estate.db`
