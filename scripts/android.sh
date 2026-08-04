#!/usr/bin/env bash
# ============================================================
# Gradle, with the two things a Mac never has set.
#
#   JAVA_HOME     Capacitor 8 compiles at Java 21. The system JDK on
#                 this machine is 18, which fails with a message about
#                 an unsupported class file version and no hint that
#                 the answer is sitting inside Android Studio.
#   ANDROID_HOME  written into android/local.properties, which is
#                 machine-specific and therefore gitignored — so it has
#                 to be regenerated rather than committed.
#
# Usage:  scripts/android.sh assembleDebug
#         scripts/android.sh --install      # build, then push to the
#                                           # attached device/emulator
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

# --- the JDK ------------------------------------------------------
# Capacitor 8 compiles at Java 21, so every candidate is version-checked
# rather than trusted. `java_home -v 21` in particular does NOT fail when
# 21 is absent — on this machine it answers with the 18 it found, which
# then dies inside Gradle talking about class file versions.
java_major() {
  "$1/bin/java" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/'
}

JAVA_HOME_FOUND=""
for CANDIDATE in \
  "$(/usr/libexec/java_home -v 21 2>/dev/null || true)" \
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
  "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
  "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
  "${JAVA_HOME:-}"; do
  [ -n "$CANDIDATE" ] && [ -x "$CANDIDATE/bin/java" ] || continue
  [ "$(java_major "$CANDIDATE")" -ge 21 ] 2>/dev/null || continue
  JAVA_HOME_FOUND="$CANDIDATE"
  break
done

if [ -z "$JAVA_HOME_FOUND" ]; then
  echo "No JDK 21+ found. Capacitor 8 needs one." >&2
  echo "Either install Android Studio (its bundled runtime is a 21)," >&2
  echo "or: brew install --cask temurin@21
   (brew install openjdk@21 works too — it is keg-only, so java_home
    cannot see it, but the candidate list below now looks there)" >&2
  exit 1
fi
export JAVA_HOME="$JAVA_HOME_FOUND"

# --- the SDK ------------------------------------------------------
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
if [ ! -d "$SDK/platform-tools" ]; then
  echo "No Android SDK at $SDK. Set ANDROID_HOME, or install it via Android Studio." >&2
  exit 1
fi
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
echo "sdk.dir=$SDK" > "$ROOT/android/local.properties"

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"

# --install is a convenience, not a gradle task: `gradlew installDebug`
# needs a device at configure time, and this reads better when it fails.
if [ "${1:-}" = "--install" ]; then
  if [ ! -f "$APK" ]; then
    echo "No debug APK yet — run: npm run android:apk" >&2
    exit 1
  fi
  if ! "$SDK/platform-tools/adb" get-state >/dev/null 2>&1; then
    echo "No device or emulator attached. Start one, then rerun." >&2
    exit 1
  fi
  "$SDK/platform-tools/adb" install -r "$APK"
  "$SDK/platform-tools/adb" shell monkey -p in.matchpoint.pride \
    -c android.intent.category.LAUNCHER 1 >/dev/null
  echo "Installed and launched."
  exit 0
fi

cd "$ROOT/android"
./gradlew "$@"

if [ -f "$APK" ]; then
  echo
  echo "APK: $APK"
fi
