#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Invoice-ish"
VERSION="0.1.0"
DMG_NAME="${APP_NAME}-${VERSION}.dmg"

APP_DIR="$ROOT_DIR/.build/release/${APP_NAME}.app"
STAGING_DIR="$ROOT_DIR/.build/dmg-staging"
OUTPUT_DIR="$ROOT_DIR/.build/release"
DMG_PATH="$OUTPUT_DIR/$DMG_NAME"

"$ROOT_DIR/scripts/build-app-bundle.sh" >/dev/null

rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR" "$OUTPUT_DIR"

ditto "$APP_DIR" "$STAGING_DIR/${APP_NAME}.app"
ln -s /Applications "$STAGING_DIR/Applications"

hdiutil create \
    -volname "$APP_NAME" \
    -srcfolder "$STAGING_DIR" \
    -ov \
    -format UDZO \
    "$DMG_PATH" >/dev/null

echo "$DMG_PATH"
