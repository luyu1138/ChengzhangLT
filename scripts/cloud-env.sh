#!/usr/bin/env bash
# Source this file in the cloud checkout; do not change the user's HOME.
export JAVA_HOME="${JAVA_HOME:-/workspace/.tools/java}"
export ANDROID_HOME="${ANDROID_HOME:-/workspace/.tools/android-sdk}"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-/workspace/.tools/android-user}"
export ANDROID_EMULATOR_HOME="${ANDROID_EMULATOR_HOME:-/workspace/.tools/android-user}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-/workspace/.tools/android-avd}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-/workspace/.tools/gradle-cache}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/19.0/bin:$PATH"
