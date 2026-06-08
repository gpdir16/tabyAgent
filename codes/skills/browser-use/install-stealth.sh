#!/bin/sh
set -e

STEALTH_DIR="/app/codes/skills/browser-use"
SITE_PACKAGES="$(python3 -c 'import site; print(site.getsitepackages()[0])')"
PTH_FILE="${SITE_PACKAGES}/tabyagent_browser_stealth.pth"

cat > "${PTH_FILE}" <<EOF
${STEALTH_DIR}
import tabyagent_stealth.patch
EOF

echo "Installed browser stealth patch: ${PTH_FILE}"
