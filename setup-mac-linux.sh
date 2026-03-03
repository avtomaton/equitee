#!/bin/bash

echo "========================================"
echo "Real Estate Analytics - Setup Script"
echo "========================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python from https://www.python.org/downloads/"
    echo "Or use: brew install python3 (Mac) or sudo apt install python3 (Ubuntu)"
    exit 1
fi

echo "[1/4] Python found: $(python3 --version)"
echo ""

# Create virtual environment
echo "[2/4] Creating virtual environment..."
python3 -m venv venv
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to create virtual environment"
    echo "Try: sudo apt install python3-venv (Ubuntu)"
    exit 1
fi
echo "✓ Virtual environment created successfully!"
echo ""

# Activate virtual environment
echo "[3/4] Activating virtual environment..."
source venv/bin/activate
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to activate virtual environment"
    exit 1
fi
echo "✓ Virtual environment activated!"
echo ""

# Install dependencies
echo "[4/4] Installing dependencies..."
pip install Flask flask-cors
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    exit 1
fi
echo "✓ Dependencies installed successfully!"
echo ""

echo "========================================"
echo "Setup Complete! "
echo "========================================"
echo ""
echo "To run the app:"
echo "  1. Activate venv:  source venv/bin/activate"
echo "  2. Start server:   python flask-app.py"
echo "  3. Open flask-frontend.html in your browser"
echo ""
echo "Press Enter to start the server now..."
read

echo ""
echo "Starting Flask server..."
python flask-app.py
