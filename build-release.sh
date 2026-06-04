#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

# Parse command line options
SKIP_DMG=false
for arg in "$@"; do
  if [ "$arg" = "--no-dmg" ] || [ "$arg" = "-n" ]; then
    SKIP_DMG=true
  fi
done

# Clear visual spacer
echo "============================================="
echo "        Tauri Release Build Script           "
if [ "$SKIP_DMG" = true ]; then
  echo "        (DMG bundling is disabled)           "
fi
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
  set +e
  if [ "$SKIP_DMG" = true ]; then
    npm run tauri build -- --target universal-apple-darwin --bundles app
  else
    npm run tauri build -- --target universal-apple-darwin
  fi
  BUILD_EXIT_CODE=$?
  set -e

  if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "ERROR: Tauri build failed (Exit Code: $BUILD_EXIT_CODE)."
    if [ "$SKIP_DMG" = false ]; then
      echo "------------------------------------------------------------"
      echo "TIPS FOR macOS DMG BUNDLING FAILURES:"
      echo "This error (e.g. running bundle_dmg.sh) is common on macOS."
      echo "It typically occurs because AppleScript/Finder Automation"
      echo "permissions are not granted to the terminal or compile task."
      echo ""
      echo "You can bypass DMG generation and compile only the '.app' bundle by running:"
      echo "  ./build-release.sh --no-dmg"
      echo ""
      echo "To grant Finder control permissions (if you need a DMG):"
      echo "  Go to: System Settings > Privacy & Security > Automation"
      echo "  Enable permissions for your terminal application."
      echo "------------------------------------------------------------"
    fi
    exit $BUILD_EXIT_CODE
  fi

  # Find and copy macOS bundles
  echo "Organizing build assets into $RELEASES_DIR..."
  
  # Target paths for universal builds
  UNIVERSAL_BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle"
  
  if [ -d "$UNIVERSAL_BUNDLE_DIR" ]; then
    # Copy .dmg files (if they exist)
    find "$UNIVERSAL_BUNDLE_DIR" -type f -name "*.dmg" -exec cp {} "$RELEASES_DIR/" \; 2>/dev/null || true
    
    # Copy .app folders (using recursive copy since .app is a folder)
    find "$UNIVERSAL_BUNDLE_DIR" -type d -name "*.app" -prune -exec cp -R {} "$RELEASES_DIR/" \;
  else
    # Fallback to standard release build target if universal target didn't compile there
    STANDARD_BUNDLE_DIR="src-tauri/target/release/bundle"
    if [ -d "$STANDARD_BUNDLE_DIR" ]; then
      find "$STANDARD_BUNDLE_DIR" -type f -name "*.dmg" -exec cp {} "$RELEASES_DIR/" \; 2>/dev/null || true
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
