# RonecaPlayTV - Quick Start Guide

## Getting Started

This guide will help you set up and run the RonecaPlayTV project locally.

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Git
- (Optional) Android Studio for mobile builds

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd ronecaplaytv
```

2. **Install dependencies**
```bash
npm install
```

3. **Start development server**
```bash
npm run dev
```

4. **Open in browser**
```
http://localhost:5173
```

## Project Structure

```
ronecaplaytv/
├── src/
│   ├── screens/          # Main screens
│   │   ├── SplashScreen.tsx
│   │   ├── ActivationScreen.tsx
│   │   ├── HomeScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── PlaylistsScreen.tsx
│   ├── layouts/          # Layout components
│   │   ├── TVLayout.tsx
│   │   └── MobileLayout.tsx
│   ├── store/            # State management
│   │   └── appStore.ts
│   ├── types/            # TypeScript types
│   │   └── index.ts
│   ├── styles/           # Theme & styles
│   │   └── theme.ts
│   ├── data/             # Mock data
│   │   └── mockData.ts
│   ├── utils/            # Utilities
│   │   └── helpers.ts
│   ├── App.tsx           # Main component
│   └── index.css         # Global styles
├── docs/                 # Documentation
├── dist/                 # Build output
└── package.json
```

## Development

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

### Hot Reload

The development server supports hot module replacement (HMR). Changes to your code will automatically refresh the browser.

## Testing Different Modes

### TV Mode
To test the TV layout on desktop:
1. Open browser DevTools
2. Set viewport to 1920x1080
3. Use keyboard arrow keys to navigate

### Mobile Mode
To test the mobile layout:
1. Open browser DevTools
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select a mobile device
4. Use touch simulation

## Building for Android

### Setup Capacitor

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init RonecaPlayTV com.ronecaplaytv.app
```

### Build APK

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

This will open Android Studio where you can:
- Build the APK
- Run on emulator
- Run on physical device

### TV Configuration

For Android TV support, ensure the `AndroidManifest.xml` includes:

```xml
<uses-feature android:name="android.software.leanback" android:required="false" />
<uses-feature android:name="android.hardware.touchscreen" android:required="false" />
```

## Customization

### Theme Colors

Edit `src/index.css` to customize colors:

```css
:root {
  --neon-orange: #FF7A1A;  /* Change this */
  --neon-cyan: #00E6E6;    /* Change this */
  /* ... */
}
```

### Mock Data

Edit `src/data/mockData.ts` to change demo content.

### App Name

Edit `index.html` to change the app title.

## Debugging

### Common Issues

**Build fails:**
```bash
rm -rf node_modules
rm package-lock.json
npm install
```

**Styles not loading:**
Check that `index.css` is imported in `main.tsx`.

**Navigation not working:**
Ensure all screen components are properly imported in `App.tsx`.

### Console Commands

```javascript
// Check current state
import { useAppStore } from './store/appStore'
const state = useAppStore.getState()
console.log(state)

// Reset storage
localStorage.clear()
window.location.reload()
```

## Next Steps

1. **Read the documentation**
   - `SYSTEM-DOCUMENTATION.md` - Full system overview
   - `API.md` - API documentation
   - `DATABASE.md` - Database schema
   - `LEGAL.md` - Legal documents

2. **Implement Phase 2**
   - Add M3U parser
   - Implement HLS player
   - Create channel listing

3. **Set up Backend**
   - Create API server
   - Set up database
   - Implement authentication

4. **Build APK**
   - Configure Capacitor
   - Build for Android
   - Test on devices

## Support

For questions or issues:
- Check documentation in `/docs`
- Review code comments
- Contact the development team

---

**Happy coding! 🚀**
