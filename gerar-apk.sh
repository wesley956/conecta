#!/usr/bin/env bash
set -e

echo "==> Instalando dependências..."
npm install

echo "==> Validando parser, TypeScript e build web..."
npm run verify

echo "==> Sincronizando Capacitor Android..."
npx cap sync android

echo "==> Aplicando configuração Android adaptativa..."
node scripts/configure-android-adaptive.cjs

echo "==> Gerando APK debug instalável..."
cd android
chmod +x ./gradlew
./gradlew assembleDebug

echo ""
echo "APK pronto:"
echo "android/app/build/outputs/apk/debug/app-debug.apk"
