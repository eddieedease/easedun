#!/usr/bin/env bash
# Builds an upload-ready package for shared hosting:
#   dist/package/                 -> upload the contents to your web root (or a subfolder)
#   dist/dungeon-crawler-*.zip    -> the same, zipped
#
# Deploying in a subfolder? Set BASE_HREF, e.g. BASE_HREF=/dungeon/ ./scripts/build-package.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_HREF="${BASE_HREF:-/}"
OUT="$ROOT/dist/package"

echo "» Building Angular (base href: $BASE_HREF)"
(cd "$ROOT/frontend" && npx ng build --configuration production --base-href "$BASE_HREF")

echo "» Assembling package"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -r "$ROOT/frontend/dist/frontend/browser/." "$OUT/"
cp -r "$ROOT/backend/api" "$ROOT/backend/install" "$ROOT/backend/server" "$OUT/"
rm -f "$OUT/server/config.php"   # never ship your local dev config

cat > "$OUT/.htaccess" <<HTACCESS
Options -Indexes
DirectoryIndex index.html index.php

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase $BASE_HREF
  # Serve real files and folders (api/, install/, assets) as-is…
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  # …and let Angular handle every other URL.
  RewriteRule ^ index.html [L]
</IfModule>
HTACCESS

ZIP="$ROOT/dist/dungeon-crawler-$(date +%Y%m%d-%H%M).zip"
rm -f "$ROOT"/dist/dungeon-crawler-*.zip
if command -v zip >/dev/null; then
  (cd "$OUT" && zip -qr "$ZIP" .)
  echo "» Created $ZIP"
else
  echo "» 'zip' not found; upload the contents of $OUT instead"
fi
echo "» Done. Upload, then open https://your-site$BASE_HREF""install/ to run the installer."
