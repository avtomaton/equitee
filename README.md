# Real Estate Analytics - Complete Setup Guide

## 🎯 Choose Your Setup Method

### Method 1: Automated Setup (Recommended - Easiest!)

**Windows:**
1. Double-click `setup-windows.bat`
2. Follow the prompts
3. Done! 🎉

**Mac/Linux:**
```bash
chmod +x setup-mac-linux.sh
./setup-mac-linux.sh
```

The script will:
- ✅ Check Python installation
- ✅ Create virtual environment
- ✅ Install all dependencies
- ✅ Start the server

---

### Method 2: Manual Setup (Step by Step)

#### Windows

```cmd
REM 1. Create virtual environment
python -m venv venv

REM 2. Activate it
venv\Scripts\activate

REM 3. Install dependencies
pip install Flask flask-cors

REM 4. Run the app
python flask-app.py
```

#### Mac/Linux

```bash
# 1. Create virtual environment
python3 -m venv venv

# 2. Activate it
source venv/bin/activate

# 3. Install dependencies
pip install Flask flask-cors

# 4. Run the app
python flask-app.py
```

---

### Method 3: Using requirements.txt

```bash
# Create and activate venv (see above)

# Install from requirements file
pip install -r flask-requirements.txt

# Run the app
python flask-app.py
```

---

## 📁 What Files Do You Need?

### Minimum Files to Run:
- ✅ `flask-app.py` - Backend server
- ✅ `flask-frontend.html` - Frontend app
- ✅ `flask-requirements.txt` - Dependencies (optional but recommended)

### Helpful Guides:
- 📖 `VENV_SETUP_GUIDE.md` - Detailed venv tutorial
- 📖 `FLASK_QUICK_START.md` - Quick start guide
- 📖 `FLASK_SETUP.md` - Complete documentation

### Setup Scripts:
- 🪟 `setup-windows.bat` - Windows automated setup
- 🍎 `setup-mac-linux.sh` - Mac/Linux automated setup

---

## 🚀 Quick Start (Choose One)

### Option A: Automated (Easiest)
```bash
# Windows
setup-windows.bat

# Mac/Linux
./setup-mac-linux.sh
```

### Option B: Manual Commands
```bash
python -m venv venv                    # Create venv
source venv/bin/activate               # Activate (Mac/Linux)
venv\Scripts\activate                  # Activate (Windows)
pip install Flask flask-cors           # Install
python flask-app.py                    # Run
```

---

## 📦 Project Structure After Setup

```
real-estate-app/
├── venv/                           # Virtual environment (you create this)
│   ├── Scripts/ or bin/           # Python executables
│   └── Lib/ or lib/               # Installed packages
│
├── flask-app.py                   # ✅ Backend server (REQUIRED)
├── flask-frontend.html            # ✅ Frontend app (REQUIRED)
├── flask-requirements.txt         # Dependencies list
│
├── real_estate.db                 # Database (auto-created)
│
├── setup-windows.bat              # Windows setup script
├── setup-mac-linux.sh             # Mac/Linux setup script
│
├── VENV_SETUP_GUIDE.md           # This detailed venv guide
├── FLASK_QUICK_START.md          # Quick start guide
└── FLASK_SETUP.md                # Complete documentation
```

---

## ✅ Verify Installation

After setup, test that everything works:

### 1. Check Python and venv
```bash
# Should show (venv) prefix
(venv) $ python --version
Python 3.10.0
```

### 2. Check Installed Packages
```bash
pip list
# Should show:
# Flask       3.0.0
# flask-cors  4.0.0
```

### 3. Test API Server
Start the server:
```bash
python flask-app.py
```

You should see:
```
* Running on http://0.0.0.0:5000
Database initialized successfully!
```

### 4. Test API Health
Open in browser: http://localhost:5000/api/health

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2024-03-03T..."
}
```

### 5. Open Frontend
Open `flask-frontend.html` in your browser.
Should show "API Connected" (green status).

---

## 🎓 Understanding Virtual Environments

### What is venv?
A virtual environment is an isolated Python workspace for your project.

### Why use venv?
- ✅ Keeps project dependencies separate
- ✅ Prevents version conflicts
- ✅ Easy to recreate on different machines
- ✅ Professional best practice

### Do I need to create it every time?
**No!** Create once, activate every time you work.

### Visual Indicator
When activated, you'll see:
```bash
(venv) C:\Users\You\project>    # Windows
(venv) user@computer:~/project$ # Mac/Linux
```

---

## 📋 Daily Workflow

### Starting Work
```bash
cd real-estate-app           # Navigate to project
source venv/bin/activate     # Activate venv (Mac/Linux)
venv\Scripts\activate        # Activate venv (Windows)
python flask-app.py          # Start server
# Open flask-frontend.html
```

### Stopping Work
```bash
Ctrl+C                       # Stop server
deactivate                   # Deactivate venv
```

---

## 🔧 Troubleshooting

### "python: command not found"
**Solution:** Install Python from https://www.python.org/downloads/

**Mac:** `brew install python3`
**Ubuntu:** `sudo apt install python3`

### "No module named venv"
**Ubuntu/Debian:**
```bash
sudo apt install python3-venv
```

### PowerShell Execution Policy Error
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### "Address already in use" (Port 5000)
**Option 1:** Change port in `flask-app.py`:
```python
app.run(host='0.0.0.0', port=8080, debug=True)
```

**Option 2:** Kill process using port 5000:
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <process_id> /F

# Mac/Linux
lsof -ti:5000 | xargs kill -9
```

### "pip: command not found"
```bash
python -m pip install Flask flask-cors
```

### Frontend shows "API Offline"
1. ✅ Make sure Flask server is running
2. ✅ Check browser console for errors (F12)
3. ✅ Verify URL: http://localhost:5000/api/health
4. ✅ Check firewall settings

---

## 🌐 Accessing from Other Devices

Want to access from your phone or another computer?

### 1. Find Your Local IP
**Windows:**
```cmd
ipconfig
# Look for IPv4 Address: 192.168.1.x
```

**Mac/Linux:**
```bash
ifconfig
# Look for inet: 192.168.1.x
```

### 2. Server is Already Configured
The Flask app runs on `0.0.0.0:5000`, which means it's accessible from other devices.

### 3. Update Frontend
In `flask-frontend.html`, change:
```javascript
const DEFAULT_API_URL = 'http://192.168.1.x:5000/api';
```

### 4. Access from Other Device
Open in browser: `http://192.168.1.x:5000/api/health`

---

## 📚 Additional Resources

### Detailed Guides
- **VENV_SETUP_GUIDE.md** - Everything about virtual environments
- **FLASK_QUICK_START.md** - Get started in 5 minutes
- **FLASK_SETUP.md** - Complete deployment & production guide

### Comparisons
- **COMPARISON.md** - Flask vs Supabase comparison

---

## 💾 Backup Your Data

Your database is stored in `real_estate.db`.

### Backup
```bash
cp real_estate.db backup-2024-03-03.db
```

### Restore
```bash
cp backup-2024-03-03.db real_estate.db
```

### Export to JSON
Use the export button in the frontend, or:
```bash
curl http://localhost:5000/api/export > backup.json
```

---

## 🔐 Security Notes

### Development Mode (Current Setup)
- ✅ Perfect for personal use
- ✅ Works on local network
- ⚠️ Debug mode enabled

### Production Deployment
For internet access, see **FLASK_SETUP.md** for:
- HTTPS setup
- Authentication
- Security hardening
- Cloud deployment options

---

## 🆘 Getting Help

### Check These First:
1. Python version: `python --version` (need 3.8+)
2. Venv activated: Look for `(venv)` in prompt
3. Packages installed: `pip list`
4. Server running: Check terminal for errors

### Common Issues:
- Server won't start → Check if port 5000 is free
- Can't find module → Make sure venv is activated
- Frontend can't connect → Verify server is running

### Still Stuck?
- Check the detailed guides in VENV_SETUP_GUIDE.md
- Review FLASK_SETUP.md troubleshooting section
- Verify all files are in the same folder

---

## ✨ Features

Your app includes:
- ✅ Add/Edit/Delete properties
- ✅ Track monthly rent & expenses
- ✅ Visual charts (bar chart, pie chart)
- ✅ Portfolio statistics dashboard
- ✅ JSON import/export
- ✅ Responsive design
- ✅ Works offline
- ✅ SQLite database (easy backup)

---

## 🎯 Next Steps

After successful setup:

1. **Add Your Properties**
   - Click "+ Add Property"
   - Enter details and expenses
   - View analytics update in real-time

2. **Customize**
   - Modify colors in frontend HTML
   - Add new expense categories
   - Customize charts

3. **Deploy** (Optional)
   - See FLASK_SETUP.md for cloud deployment
   - Options include: Render, Railway, DigitalOcean

4. **Backup**
   - Export JSON regularly
   - Copy `real_estate.db` file

---

## 📊 Success Checklist

- [ ] Python 3.8+ installed
- [ ] Virtual environment created
- [ ] Dependencies installed
- [ ] Flask server starts successfully
- [ ] Can access http://localhost:5000
- [ ] Frontend connects (green "API Connected" status)
- [ ] Can add/edit/delete properties
- [ ] Charts display correctly

---

## 🎉 You're All Set!

**Quick Start Command:**
```bash
# Activate venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Run server
python flask-app.py

# Open flask-frontend.html in browser
```

**Daily Use:**
1. Activate venv
2. Run `python flask-app.py`
3. Open frontend
4. Start tracking properties!

Enjoy your real estate analytics platform! 🏠📈
