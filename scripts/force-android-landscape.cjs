const fs = require('fs');
const path = require('path');

const manifestPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.log('AndroidManifest.xml não encontrado; pulando landscape.');
  process.exit(0);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');

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
console.log('Android MainActivity configurada para landscape.');
