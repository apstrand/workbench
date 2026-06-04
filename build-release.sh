#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

# Clear visual spacer
echo "============================================="
echo "        Tauri Release Build Script           "
echo "============================================="

# Detect the Operating System
OS="$(uname -s)"
echo "Detected OS: $OS"

# Setup release directory
RELEASES_DIR="./releases"
mkdir -p "$RELEASES_DIR"

# 1. Ensure node dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Node modules not found. Running npm install..."
  npm install
else
  echo "Node modules verified."
fi

# 2. Check and prepare system dependencies based on OS
if [ "$OS" = "Darwin" ]; then
  echo "Verifying macOS compilation targets..."
  
  # Check if rustup is installed to add targets
  if command -v rustup &> /dev/null; then
    echo "Adding macOS targets for universal binary..."
    rustup target add x86_64-apple-darwin aarch64-apple-darwin
  else
    echo "Warning: rustup not found. Compilation might fail if target targets are missing."
  fi
  
  # Run the universal build
  echo "Building macOS universal binary..."
  npm run tauri build -- --target universal-apple-darwin

  # Find and copy macOS bundles
  echo "Organizing build assets into $RELEASES_DIR..."
  
  # Target paths for universal builds
  UNIVERSAL_BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle"
  
  if [ -d "$UNIVERSAL_BUNDLE_DIR" ]; then
    # Copy .dmg files
    find "$UNIVERSAL_BUNDLE_DIR" -type f -name "*.dmg" -exec cp {} "$RELEASES_DIR/" \;
    
    # Copy .app folders (using recursive copy since .app is a folder)
    find "$UNIVERSAL_BUNDLE_DIR" -type d -name "*.app" -prune -exec cp -R {} "$RELEASES_DIR/" \;
  else
    # Fallback to standard release build target if universal target didn't compile there
    STANDARD_BUNDLE_DIR="src-tauri/target/release/bundle"
    if [ -d "$STANDARD_BUNDLE_DIR" ]; then
      find "$STANDARD_BUNDLE_DIR" -type f -name "*.dmg" -exec cp {} "$RELEASES_DIR/" \;
      find "$STANDARD_BUNDLE_DIR" -type d -name "*.app" -prune -exec cp -R {} "$RELEASES_DIR/" \;
    fi
  fi

elif [ "$OS" = "Linux" ]; then
  echo "Checking Linux system dependencies..."
  
  # Define list of Debian/Ubuntu dependencies
  DEPS=("libwebkit2gtk-4.1-dev" "build-essential" "curl" "wget" "file" "libxdo-dev" "libssl-dev" "libayatana-appindicator3-dev" "librsvg2-dev" "libdbus-1-dev" "pkg-config")
  MISSING_DEPS=()
  
  if command -v dpkg -s &> /dev/null; then
    for dep in "${DEPS[@]}"; do
      if ! dpkg -s "$dep" &> /dev/null; then
        MISSING_DEPS+=("$dep")
      fi
    done
  fi
  
  if [ ${#MISSING_DEPS[@]} -ne 0 ]; then
    echo "Warning: The following package dependencies are missing:"
    for m_dep in "${MISSING_DEPS[@]}"; do
      echo "  - $m_dep"
    done
    echo "You may need to run: sudo apt-get update && sudo apt-get install -y ${MISSING_DEPS[*]}"
    echo "Attempting build anyway..."
  else
    echo "All Linux dependencies verified."
  fi

  # Run standard Linux build
  echo "Building Linux binaries..."
  npm run tauri build

  # Find and copy Linux bundles (.deb and .AppImage)
  echo "Organizing build assets into $RELEASES_DIR..."
  LINUX_BUNDLE_DIR="src-tauri/target/release/bundle"
  
  if [ -d "$LINUX_BUNDLE_DIR" ]; then
    find "$LINUX_BUNDLE_DIR" -type f \( -name "*.deb" -o -name "*.AppImage" \) -exec cp {} "$RELEASES_DIR/" \;
  fi

else
  echo "Unsupported OS for building macOS/Linux binaries: $OS"
  exit 1
fi

# 3. Report completed outputs
echo "---------------------------------------------"
echo "Build complete! Output binaries in $RELEASES_DIR:"
ls -la "$RELEASES_DIR"
echo "============================================="
