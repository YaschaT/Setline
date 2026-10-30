#!/usr/bin/env bash
# Installs the current Setline build on an iPhone connected to this Mac —
# yours or a friend's. Run it from anywhere:
#
#   ios/scripts/install-on-iphone.sh            # the only connected iPhone, or pick one
#   ios/scripts/install-on-iphone.sh "iPhone Jan"
#
# The phone must be unlocked, trust this Mac (cable the first time) and have
# Developer Mode on (Settings › Privacy & Security › Developer Mode).
# Building for the phone registers it on the Apple account automatically.
# With a free Apple account the app opens for 7 days; run this again to renew.
set -euo pipefail

cd "$(dirname "$0")/.."
WANTED="${1:-}"
LIST="$(mktemp -t setline-devices).json"

xcrun devicectl list devices --json-output "$LIST" >/dev/null
# name|udid|devicectl id|developer mode — connected iPhones only. A phone on
# the cable (or on this Wi-Fi) shows its tunnel "disconnected" until something
# opens it, so being reachable is enough; it is opened below.
PHONES="$(python3 - "$LIST" <<'EOF'
import json, sys
for d in json.load(open(sys.argv[1]))["result"]["devices"]:
    h, c, p = d.get("hardwareProperties", {}), d.get("connectionProperties", {}), d.get("deviceProperties", {})
    reachable = c.get("tunnelState") == "connected" or c.get("transportType") in ("wired", "localNetwork")
    if h.get("deviceType") == "iPhone" and c.get("pairingState") == "paired" and reachable:
        print(f'{p.get("name")}|{h.get("udid")}|{d.get("identifier")}|{p.get("developerModeStatus")}')
EOF
)"
rm -f "$LIST"

if [ -n "$WANTED" ]; then
  PHONES="$(printf '%s\n' "$PHONES" | grep -F "$WANTED" || true)"
fi
if [ -z "$PHONES" ]; then
  echo "No connected iPhone${WANTED:+ named \"$WANTED\"}. Plug it in, unlock it and tap Trust." >&2
  exit 1
fi
if [ "$(printf '%s\n' "$PHONES" | wc -l | tr -d ' ')" -gt 1 ]; then
  echo "More than one iPhone is connected — name the one to install on:" >&2
  printf '%s\n' "$PHONES" | cut -d'|' -f1 | sed 's/^/  /' >&2
  exit 1
fi

IFS='|' read -r NAME UDID ID DEVMODE <<<"$PHONES"
if [ "$DEVMODE" != "enabled" ]; then
  echo "Developer Mode is off on $NAME: Settings › Privacy & Security › Developer Mode, then restart it." >&2
  exit 1
fi

# Opens the connection; fails while the phone is locked.
if ! xcrun devicectl device info details --device "$ID" >/dev/null 2>&1; then
  echo "Can't reach $NAME. Unlock it (and tap Trust if it asks), then run this again." >&2
  exit 1
fi

echo "Building Setline for $NAME…"
APP="DerivedData-device/Build/Products/Release-iphoneos/Setline.app"
# A failed build must never install the previous one.
rm -rf "$APP"
xcodebuild -project Setline.xcodeproj -scheme Setline -configuration Release \
  -destination "id=$UDID" -derivedDataPath "$PWD/DerivedData-device" \
  -allowProvisioningUpdates build | grep -E "error:|BUILD" || true
[ -d "$APP" ] || { echo "The build failed — see the errors above." >&2; exit 1; }

echo "Installing on $NAME…"
xcrun devicectl device install app --device "$ID" "$APP" >/dev/null
EXPIRES="$(security cms -D -i "$APP/embedded.mobileprovision" | plutil -extract ExpirationDate raw -o - - 2>/dev/null || true)"
echo "Done. Setline is on $NAME${EXPIRES:+ — it opens until $EXPIRES}."
echo "First time: on the phone, Settings › General › VPN & Device Management › trust the developer."
