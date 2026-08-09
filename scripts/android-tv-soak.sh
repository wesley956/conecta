#!/usr/bin/env bash
set -euo pipefail

duration_minutes="${1:-60}"
package_name="com.ronecaplaytv.nativeapp"
interval_seconds=60
iterations=$((duration_minutes * 60 / interval_seconds))

command -v adb >/dev/null || { echo 'adb não encontrado.' >&2; exit 1; }
adb get-state >/dev/null

echo 'minute,pss_kb,rss_kb,java_heap_kb,native_heap_kb,activities'
for ((index = 0; index <= iterations; index += 1)); do
  minute=$((index * interval_seconds / 60))
  meminfo="$(adb shell dumpsys meminfo "$package_name")"
  pss="$(awk '/TOTAL PSS:/ {print $3; exit} /^ *TOTAL / {print $2; exit}' <<<"$meminfo")"
  rss="$(awk '/TOTAL RSS:/ {print $3; exit}' <<<"$meminfo")"
  java_heap="$(awk '/Java Heap:/ {print $3; exit}' <<<"$meminfo")"
  native_heap="$(awk '/Native Heap:/ {print $3; exit}' <<<"$meminfo")"
  activities="$(adb shell dumpsys activity activities | awk -v package="$package_name" '$0 ~ package && /mResumedActivity/ {count += 1} END {print count + 0}')"
  echo "${minute},${pss:-0},${rss:-0},${java_heap:-0},${native_heap:-0},${activities}"
  if (( index < iterations )); then sleep "$interval_seconds"; fi
done
