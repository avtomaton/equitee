# Virtual Environment Setup Guide for Flask App

## What is a Virtual Environment?

A virtual environment (venv) is an isolated Python environment that keeps your project dependencies separate from your system Python. This prevents conflicts between different projects.

## Setup Instructions

### Windows

#### Step 1: Open Command Prompt or PowerShell
Navigate to your project folder:
```cmd
cd path\to\your\project
```

#### Step 2: Create Virtual Environment
```cmd
python -m venv venv
```

This creates a folder called `venv` with Python and pip inside it.

#### Step 3: Activate Virtual Environment
**Command Prompt:**
```cmd
venv\Scripts\activate
```

**PowerShell:**
```powershell
venv\Scripts\Activate.ps1
```

**If you get an error in PowerShell** about execution policy:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Then try activating again.

#### Step 4: Install Dependencies
```cmd
pip install -r flask-requirements.txt
```

Or manually:
```cmd
pip install Flask flask-cors
```

#### Step 5: Run the App
```cmd
python flask-app.py
```

#### Step 6: Deactivate (when done)
```cmd
deactivate
```

---

### Mac / Linux

#### Step 1: Open Terminal
Navigate to your project folder:
```bash
cd /path/to/your/project
```

#### Step 2: Create Virtual Environment
```bash
python3 -m venv venv
```

#### Step 3: Activate Virtual Environment
```bash
source venv/bin/activate
```

You'll see `(venv)` appear at the start of your command prompt.

#### Step 4: Install Dependencies
```bash
pip install -r flask-requirements.txt
```

Or manually:
```bash
pip install Flask flask-cors
```

#### Step 5: Run the App
```bash
python flask-app.py
```

Or:
```bash
python3 flask-app.py
```

#### Step 6: Deactivate (when done)
```bash
deactivate
```

---

## Project Structure

After setup, your project should look like this:

```
real-estate-app/
├── venv/                    # Virtual environment (created by you)
│   ├── Scripts/            # (Windows)
│   ├── bin/                # (Mac/Linux)
│   ├── Lib/                # Python packages
│   └── ...
├── flask-app.py            # Backend server
├── flask-frontend.html     # Frontend app
├── flask-requirements.txt  # Dependencies
├── real_estate.db          # Database (created automatically)
└── FLASK_QUICK_START.md    # This guide
```

---

## Quick Reference Card

### Windows
```cmd
# Create
python -m venv venv

# Activate
venv\Scripts\activate

# Install
pip install -r flask-requirements.txt

# Run
python flask-app.py

# Deactivate
deactivate
```

### Mac/Linux
```bash
# Create
python3 -m venv venv

# Activate
source venv/bin/activate

# Install
pip install -r flask-requirements.txt

# Run
python flask-app.py

# Deactivate
deactivate
```

---

## Visual Guide

### Before Activation
```
C:\Users\You\real-estate-app> _
```

### After Activation
```
(venv) C:\Users\You\real-estate-app> _
```

The `(venv)` prefix shows you're in the virtual environment!

---

## Troubleshooting

### Problem: "python: command not found"

**Windows:**
- Use `py` instead of `python`
- Or reinstall Python and check "Add to PATH"

**Mac/Linux:**
```bash
# Try python3 instead
python3 -m venv venv
```

### Problem: "No module named venv"

Your Python installation is incomplete. Reinstall Python or:

**Ubuntu/Debian:**
```bash
sudo apt install python3-venv
```

**macOS:**
```bash
# Reinstall Python with Homebrew
brew install python3
```

### Problem: PowerShell execution policy error

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then try activating again.

### Problem: "pip: command not found"

After activating venv:
```bash
# Mac/Linux
python -m pip install --upgrade pip

# Windows
python -m pip install --upgrade pip
```

### Problem: Virtual environment activated but can't find packages

Make sure you installed packages AFTER activating:
```bash
# 1. Activate first
source venv/bin/activate  # Mac/Linux
venv\Scripts\activate     # Windows

# 2. Then install
pip install Flask flask-cors
```

---

## Best Practices

### DO ✅
- Always activate venv before working on project
- Install packages inside venv
- Add `venv/` to `.gitignore` if using git
- Keep `requirements.txt` updated

### DON'T ❌
- Don't commit `venv/` folder to git (too large)
- Don't install packages globally when working on project
- Don't forget to activate venv before running app

---

## Git Integration

If you're using git, create a `.gitignore` file:

```gitignore
# Virtual Environment
venv/
env/
ENV/

# Database
*.db
*.sqlite
*.sqlite3

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python

# IDE
.vscode/
.idea/
*.swp
*.swo
```

---

## Updating Dependencies

### Add new package
```bash
# Activate venv first
source venv/bin/activate

# Install package
pip install package-name

# Update requirements.txt
pip freeze > flask-requirements.txt
```

### Update all packages
```bash
pip install --upgrade Flask flask-cors
```

---

## Complete Workflow Example

### First Time Setup
```bash
# 1. Create project folder
mkdir real-estate-app
cd real-estate-app

# 2. Copy your files here
# (flask-app.py, flask-frontend.html, flask-requirements.txt)

# 3. Create virtual environment
python -m venv venv

# 4. Activate it
source venv/bin/activate  # Mac/Linux
venv\Scripts\activate     # Windows

# 5. Install dependencies
pip install -r flask-requirements.txt

# 6. Run the app
python flask-app.py

# 7. Open flask-frontend.html in browser
# (You're now running!)
```

### Daily Usage
```bash
# 1. Navigate to project
cd real-estate-app

# 2. Activate venv
source venv/bin/activate

# 3. Run app
python flask-app.py

# 4. When done, deactivate
deactivate
```

---

## IDE Integration

### VS Code
VS Code auto-detects virtual environments!

1. Open project folder in VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Python: Select Interpreter"
4. Choose the one in `venv/` folder

Now when you run Python in VS Code, it automatically uses your venv!

### PyCharm
1. File → Settings → Project → Python Interpreter
2. Click gear icon → Add
3. Select "Existing environment"
4. Navigate to `venv/Scripts/python.exe` (Windows) or `venv/bin/python` (Mac/Linux)

---

## Why Use Virtual Environments?

### Without venv ❌
```
System Python
├── Flask 2.0 (Project A needs this)
├── Flask 3.0 (Project B needs this)  ← CONFLICT!
└── 100 other packages
```

### With venv ✅
```
System Python
└── (clean)

Project A/venv
└── Flask 2.0 (isolated)

Project B/venv
└── Flask 3.0 (isolated)
```

No conflicts! Each project has its own dependencies.

---

## FAQ

**Q: Do I need to create venv every time?**
A: No! Create once, activate every time you work.

**Q: Can I delete venv folder?**
A: Yes! Just recreate it: `python -m venv venv`

**Q: Why is venv so large (100MB+)?**
A: It contains a complete Python installation. This is normal.

**Q: Can I rename venv folder?**
A: Yes, but `venv` is the standard name everyone uses.

**Q: Do I need venv if I only have one Python project?**
A: Yes! It's best practice and prevents future issues.

**Q: How do I know if venv is activated?**
A: You'll see `(venv)` at the start of your command prompt.

---

## Next Steps

After setup:
1. ✅ Virtual environment created
2. ✅ Dependencies installed
3. ✅ App running

Now you can:
- Add more properties to track
- Customize the frontend design
- Deploy to production (see FLASK_SETUP.md)
- Add new features

---

## Quick Commands Cheat Sheet

```bash
# CREATE VENV
python -m venv venv

# ACTIVATE
source venv/bin/activate      # Mac/Linux
venv\Scripts\activate         # Windows

# INSTALL
pip install -r flask-requirements.txt

# RUN
python flask-app.py

# DEACTIVATE
deactivate

# UPDATE REQUIREMENTS
pip freeze > flask-requirements.txt

# CHECK PACKAGES
pip list

# REMOVE PACKAGE
pip uninstall package-name
```

---

## Getting Help

If you run into issues:
1. Make sure Python 3.8+ is installed: `python --version`
2. Ensure venv is activated (look for `(venv)` in prompt)
3. Try reinstalling: `pip install --force-reinstall Flask flask-cors`
4. Check Python path: `which python` (Mac/Linux) or `where python` (Windows)

---

**You're all set!** Your Flask app now runs in an isolated, clean environment. 🎉
