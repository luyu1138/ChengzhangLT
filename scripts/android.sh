#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/workspace/.tools/java}"
export ANDROID_HOME="${ANDROID_HOME:-/workspace/.tools/android-sdk}"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-/workspace/.tools/android-user}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-/workspace/.tools/gradle-cache}"
export PATH="$JAVA_HOME/bin:$PATH"
rm -rf "$project_dir/android/app/src/main/assets/web"
mkdir -p "$project_dir/android/app/src/main/assets/web"
cp -R "$project_dir/dist/." "$project_dir/android/app/src/main/assets/web/"
cp "$project_dir/THIRD_PARTY_NOTICES.txt" "$project_dir/android/app/src/main/assets/web/THIRD_PARTY_NOTICES.txt"
gradle_command="${GRADLE_CMD:-$project_dir/android/gradlew}"
if [[ -z "${GRADLE_CMD:-}" && -x /workspace/.tools/gradle-8.13/bin/gradle ]]; then gradle_command=/workspace/.tools/gradle-8.13/bin/gradle; fi
exec "$gradle_command" --project-dir "$project_dir/android" --no-daemon "$@"
