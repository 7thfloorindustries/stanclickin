# STANCLICKIN

Official mobile app for Stanclickin - A creator-owned social platform for fans.

## About

STANCLICKIN is a React Native mobile app built with Expo that provides:
- **STANSPACE:** Instagram-alternative social network for the community
- **STANHUB:** Exclusive music video hosting
- **FLAPPYCLICKIN:** Flappy Bird-style game with in-app purchases

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Run on specific platform
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # Web browser
```

### Production Build & Deploy

See the comprehensive guides in `/docs`:

- **[BUILD_AND_DEPLOY_GUIDE.md](docs/BUILD_AND_DEPLOY_GUIDE.md)** - Complete walkthrough for building and shipping to App Store
- **[APP_STORE_SUBMISSION_GUIDE.md](docs/APP_STORE_SUBMISSION_GUIDE.md)** - Detailed App Store Connect configuration
- **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common errors and solutions

**Quick build commands:**
```bash
# Build iOS app
eas build --platform ios --profile production

# Submit to App Store Connect
eas submit --platform ios
```

## Tech Stack

- **Framework:** React Native with Expo SDK 54
- **Navigation:** Expo Router (file-based routing)
- **Backend:** Firebase (Auth, Firestore, Storage)
- **Languages:** TypeScript
- **Monetization:** React Native IAP (In-App Purchases)

## Project Structure

```
stanclickin/
├── app/                    # Expo Router pages
│   ├── _layout.tsx        # Root layout with auth routing
│   ├── index.tsx          # Home screen
│   ├── login.tsx          # Login/signup
│   ├── stanspace.tsx      # Social network feed
│   ├── stanhub.tsx        # Music videos
│   ├── flappyclickin.tsx  # Game
│   └── u/[uid].tsx        # User profiles
├── components/            # Reusable React components
│   ├── Avatar.tsx
│   └── PostCard.tsx
├── src/
│   └── lib/
│       └── firebase.ts    # Firebase configuration
├── docs/                  # Documentation
│   ├── BUILD_AND_DEPLOY_GUIDE.md
│   ├── APP_STORE_SUBMISSION_GUIDE.md
│   └── TROUBLESHOOTING.md
└── assets/               # Images, fonts, videos
```

## Key Features

### Authentication
- Email/password authentication via Firebase
- Automatic routing based on auth state
- Username system for social features

### STANSPACE (Social Network)
- Create posts with text and images
- Like and comment on posts
- Follow other users
- Trending and Following feeds
- Real-time updates via Firestore listeners

### STANHUB (Video Platform)
- Exclusive music video hosting
- Video player with controls
- Firebase Storage integration

### FLAPPYCLICKIN (Game)
- Flappy Bird-style gameplay
- Leaderboard system
- In-app purchase for extra lives ($0.99)
- Invincibility power-up

### Theming
- Multiple color themes (Default, Sunset, Ocean, Forest, etc.)
- Dark/light mode support
- User preference persistence

## Development Notes

### Firebase Setup
Firebase configuration is in `src/lib/firebase.ts`. The config uses public API keys (this is normal - security comes from Firestore rules, not hiding keys).

### Routing & Navigation
Uses Expo Router with file-based routing. Protected routes automatically redirect to `/login` if user is not authenticated (see `app/_layout.tsx`).

### New Architecture
The app uses React Native's new architecture (`newArchEnabled: true`). This is required for `react-native-reanimated` 4.x.

### In-App Purchases
IAP is implemented with `react-native-iap`. Product ID: `com.stanclickin.app.extralife`. Requires configuration in App Store Connect before going live.

## Known Limitations

- **GIF Maker:** Temporarily removed due to deprecated `ffmpeg-kit-react-native` package. Will be reimplemented in future update.
- **Web Platform:** Some features (IAP, native modules) are iOS/Android only.

## Deployment

### Prerequisites
- Paid Apple Developer Account ($99/year)
- Expo account (free at expo.dev)
- Firebase project with Auth, Firestore, and Storage enabled
- App-specific password from Apple (for EAS Build)

### First-Time Setup
1. Clone repository
2. Run `npm install`
3. Create Expo account: `eas login`
4. Build: `eas build --platform ios --profile production`
5. Submit: `eas submit --platform ios`
6. Configure in App Store Connect (see docs/APP_STORE_SUBMISSION_GUIDE.md)

### Updates
1. Make code changes
2. Increment version in `app.json` if needed
3. Commit and push to GitHub
4. Build new version: `eas build --platform ios --profile production`
5. Submit: `eas submit --platform ios`
6. Update in App Store Connect and submit for review

## Troubleshooting

See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common errors and solutions.

**Quick checks:**
```bash
# Check project health
npx expo-doctor

# Fix dependency versions
npx expo install --check
npx expo install --fix

# Clean install
rm -rf node_modules package-lock.json
npm install
```

## Legal & Privacy

- **Privacy Policy:** https://7thfloorindustries.github.io/stanclickin-legal/privacy.html
- **Support:** support@7thfloor.digital
- **Privacy:** privacy@7thfloor.digital
- **Moderation:** moderation@7thfloor.digital

## App Store Details

- **Bundle ID:** com.stanclickin.app
- **Age Rating:** 13+ (User Generated Content)
- **Category:** Social Networking
- **Price:** Free (with in-app purchases)

## Contributing

This is a private, creator-owned project. Not accepting external contributions at this time.

## License

Proprietary. All rights reserved by 7th Floor Industries.

---

**Built with ❤️ for the Stanclickin community**
