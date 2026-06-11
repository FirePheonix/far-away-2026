#!/bin/bash
# Build local-stt for macOS
# Produces: dist/local-stt.app  →  zip it into local-stt-mac.zip for distribution
#
# Requirements:
#   pip install pyinstaller
#   pip install -r requirements.txt
#
# Run from project root:
#   chmod +x build_mac.sh && ./build_mac.sh

set -e

echo "[local-stt] Installing dependencies..."
pip install -r requirements.txt
pip install pyinstaller

echo ""
echo "[local-stt] Building macOS app bundle..."
pyinstaller \
  --windowed \
  --onedir \
  --name "local-stt" \
  --icon "assets/icon.icns" \
  --collect-all faster_whisper \
  --collect-all ctranslate2 \
  --collect-all customtkinter \
  --collect-all sounddevice \
  --hidden-import pystray._darwin \
  --hidden-import pynput.keyboard._darwin \
  --hidden-import pynput.mouse._darwin \
  --hidden-import pyperclip \
  --osx-bundle-identifier "com.localstt.app" \
  app.py

echo ""
echo "[local-stt] Packaging into .zip for distribution..."
cd dist
zip -r local-stt-mac.zip local-stt.app
cd ..

echo ""
echo "[local-stt] Done!"
echo "  App:      dist/local-stt.app"
echo "  Download: dist/local-stt-mac.zip"
echo ""
echo "NOTE: On first launch, macOS will ask for Accessibility permissions"
echo "for the global hotkey (Ctrl+Shift+Space) to work. Allow it in:"
echo "  System Settings > Privacy & Security > Accessibility"
