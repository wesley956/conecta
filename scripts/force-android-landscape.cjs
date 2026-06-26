const fs = require('fs');
const path = require('path');

const manifestPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const xmlDir = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'res', 'xml');
const networkConfigPath = path.join(xmlDir, 'network_security_config.xml');

function setAndroidAttr(attrs, name, value) {
  const pattern = new RegExp(`android:${name}="[^"]*"`, 'g');
  const replacement = `android:${name}="${value}"`;

  if (pattern.test(attrs)) {
    return attrs.replace(pattern, replacement);
  }

  return `${attrs}\n        ${replacement}`;
}

if (!fs.existsSync(manifestPath)) {
  console.log('AndroidManifest.xml não encontrado; pulando configuração Android.');
  process.exit(0);
}

fs.mkdirSync(xmlDir, { recursive: true });

fs.writeFileSync(networkConfigPath, `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`);

let manifest = fs.readFileSync(manifestPath, 'utf8');

manifest = manifest.replace(
  /<application([\s\S]*?)>/,
  (match, attrs) => {
    let next = attrs;

    next = setAndroidAttr(next, 'usesCleartextTraffic', 'true');
    next = setAndroidAttr(next, 'networkSecurityConfig', '@xml/network_security_config');
    next = setAndroidAttr(next, 'hardwareAccelerated', 'true');

    return `<application${next}>`;
  }
);

manifest = manifest.replace(
  /<activity([\s\S]*?android:name="\.MainActivity"[\s\S]*?)>/,
  (match, attrs) => {
    let next = attrs;

    if (/android:screenOrientation=/.test(next)) {
      next = next.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="landscape"');
    } else {
      next += '\n            android:screenOrientation="landscape"';
    }

    if (!/android:configChanges=/.test(next)) {
      next += '\n            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"';
    }

    return `<activity${next}>`;
  }
);

fs.writeFileSync(manifestPath, manifest);

console.log('Android configurado: landscape + cleartext HTTP + network security config.');
