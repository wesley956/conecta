# RonecaPlayTV - System Documentation

## Executive Summary

RonecaPlayTV is a legal IPTV/P2P player application designed for Android devices (mobile, tablet, TV Box, Android TV, Google TV) with a web-based administrative panel.

**Key Principle:** This application is a media player for **AUTHORIZED CONTENT ONLY**. It does not provide, distribute, or promote pirated content.

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    RonecaPlayTV System                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Mobile     │  │     TV       │  │   Tablet     │      │
│  │    App       │  │    App       │  │    App       │      │
│  │  (Android)   │  │ (Android TV) │  │  (Android)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         └─────────────────┼─────────────────┘               │
│                           │                                 │
│                    ┌──────▼──────┐                         │
│                    │   API/      │                         │
│                    │  Backend    │                         │
│                    └──────┬──────┘                         │
│                           │                                 │
│         ┌─────────────────┼─────────────────┐              │
│         │                 │                 │              │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐        │
│  │   Admin     │  │  Database   │  │   External  │        │
│  │   Panel     │  │ (PostgreSQL)│  │  Services   │        │
│  │   (Web)     │  │             │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend (App & Admin):**
- React 19
- Vite (Build tool)
- TypeScript
- Tailwind CSS 4
- Zustand (State management)
- Lucide React (Icons)
- HLS.js (Video streaming)

**Backend (Planned):**
- Node.js / Express or Fastify
- PostgreSQL (Database)
- Prisma (ORM)
- JWT (Authentication)
- Redis (Caching)

**Mobile/TV:**
- Capacitor (Native wrapper)
- Android SDK
- TV Leanback support

## Core Features

### Phase 1 - Implemented ✅

1. **Visual Identity**
   - Dark neon theme (orange & cyan)
   - TV Box inspired interface
   - Responsive design (TV & Mobile)
   - Smooth animations

2. **Navigation**
   - Remote control support (TV)
   - Touch navigation (Mobile)
   - Focus management
   - Keyboard shortcuts

3. **Screens**
   - Splash screen with loading states
   - Device activation screen
   - Home screen with cards
   - Settings screen
   - Playlists management screen

4. **State Management**
   - Device ID generation
   - Activation status
   - Subscription management
   - Favorites & history
   - App settings

### Phase 2 - IPTV Basic (Planned)

- M3U parser
- Channel listing
- Categories
- HLS player
- Search functionality
- Favorites system

### Phase 3 - Subscription Management (Planned)

- Admin panel
- Customer management
- Device management
- Plans & pricing
- Activation workflow
- Automatic blocking

### Phase 4 - VOD (Planned)

- Movies catalog
- Series with seasons/episodes
- Continue watching
- Progress tracking

### Phase 5 - EPG (Planned)

- XMLTV import
- Program guide
- Current/next show
- Schedule display

### Phase 6 - P2P (Planned)

- Authorized P2P streaming
- Cache management
- Upload limits
- WiFi-only mode

### Phase 7 - Production Build (Planned)

- App icon
- Native splash
- Android build
- TV manifest
- Testing & QA

## User Flow

### First Time User

```
1. Install APK
   ↓
2. Open App
   ↓
3. Splash Screen (checks)
   ↓
4. Activation Screen (show device code)
   ↓
5. User sends code to admin
   ↓
6. Admin approves in panel
   ↓
7. User clicks "Try Again"
   ↓
8. App validates & loads content
   ↓
9. Home Screen
```

### Regular User

```
1. Open App
   ↓
2. Splash Screen (quick checks)
   ↓
3. Home Screen
   ↓
4. Select content (Channels/Movies/Series)
   ↓
5. Player opens
   ↓
6. Watch content
   ↓
7. Progress saved automatically
```

## Data Flow

### Device Activation

```
App → Generate Device ID → Store Locally
  ↓
App → Send Device ID to API → Check Status
  ↓
API → Return Status (pending/approved/blocked)
  ↓
App → Show appropriate screen
```

### Content Loading

```
App → Check Subscription → Valid?
  ↓
App → Get Active Playlist → From API
  ↓
App → Fetch Channels/Movies/Series → Parse
  ↓
App → Display Content → User selects
  ↓
App → Open Player → Stream URL
```

## Security Measures

1. **Device Validation**
   - Unique device ID
   - Server-side validation
   - Remote blocking capability

2. **Subscription Control**
   - Expiration checking
   - Automatic blocking on expiry
   - Device limit enforcement

3. **Data Protection**
   - Encrypted storage
   - Secure API communication
   - No sensitive data exposure

4. **Access Control**
   - Token-based authentication
   - Role-based permissions (admin panel)
   - Rate limiting

## Database Schema

See `DATABASE.md` for complete schema documentation.

### Key Tables

- `customers` - Client information
- `devices` - Registered devices
- `subscriptions` - Active subscriptions
- `playlists` - Content playlists
- `channels` - TV channels
- `movies` - Movies catalog
- `series` - Series catalog
- `favorites` - User favorites
- `watch_history` - Viewing history

## API Endpoints

See `API.md` for complete API documentation.

### Main Endpoints

- `POST /devices/register` - Register device
- `GET /devices/:code/status` - Check device status
- `GET /subscriptions/:id` - Get subscription
- `GET /playlists/:id/channels` - List channels
- `POST /favorites` - Add favorite
- `GET /notices` - Get announcements

## UI/UX Design

### Color Palette

```
Background:  #050B0F (Primary)
             #07131A (Secondary)
             #111C24 (Card)

Borders:     #253541 (Default)
             #FF7A1A (Focused - Orange)
             #31D67B (Active - Green)

Neon:        #FF7A1A (Orange)
             #00E6E6 (Cyan)
             #31D67B (Green)
             #FFD447 (Yellow)
             #FF4D4D (Red)

Text:        #FFFFFF (Primary)
             #B8C2CC (Secondary)
             #6B7C8C (Muted)
```

### Typography

- Font: Inter (Google Fonts)
- TV Mode: Larger fonts (18px base)
- Mobile Mode: Standard fonts (16px base)

### Components

- Cards with neon borders on focus
- Gradient buttons
- Status indicators
- Progress bars
- Modal dialogs

## Deployment

### Web App

```bash
npm run build
# Output: dist/index.html
# Deploy to any static hosting (Vercel, Netlify, etc.)
```

### Android APK

```bash
npm run build
npx cap sync android
npx cap open android
# Build APK in Android Studio
```

### Admin Panel

```bash
# Same build process
# Deploy to web server
# Configure API endpoint
```

## Testing Strategy

### Unit Tests
- Utility functions
- State management
- Component logic

### Integration Tests
- API endpoints
- Database operations
- Authentication flow

### E2E Tests
- User activation flow
- Content playback
- Admin operations

### Device Testing
- Mobile (Android 7+)
- Tablet (Various sizes)
- TV Box (Multiple brands)
- Android TV (Official)
- Google TV (Chromecast)

## Monitoring & Analytics

### Metrics to Track

- Active devices
- Subscription status
- Content usage
- Error rates
- Performance metrics

### Tools

- Server logs
- Error tracking (Sentry)
- Analytics (custom)
- Performance monitoring

## Legal Compliance

### Important Disclaimers

1. **Content Responsibility:** User is responsible for content sources
2. **No Piracy:** App does not provide or promote pirated content
3. **Authorized Use:** Only authorized playlists should be added
4. **Copyright:** User must have rights to accessed content

### Documentation

- Terms of Use (`LEGAL.md`)
- Privacy Policy (`LEGAL.md`)
- Legal Notice (`LEGAL.md`)
- DMCA Compliance (`LEGAL.md`)

## Future Considerations

### Scalability

- Horizontal scaling for API
- CDN for content delivery
- Database optimization
- Caching strategies

### Features

- Multi-language support
- Parental controls
- Offline mode
- Cloud sync
- Social features

### Platforms

- iOS app
- Web PWA
- Samsung Tizen
- LG webOS
- Roku

## Support & Maintenance

### Support Channels

- Email support
- In-app help
- Documentation
- FAQ section

### Maintenance

- Regular updates
- Security patches
- Bug fixes
- Feature improvements

---

**Document Version:** 1.0.0  
**Last Updated:** January 2024  
**Status:** Phase 1 Complete
