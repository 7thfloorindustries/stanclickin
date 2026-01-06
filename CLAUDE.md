# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

STANCLICKIN is a creator-owned mobile app for **Stanclickin**, a music artist/YouTuber/TikTok personality with a dedicated internet fanbase.

**Purpose**: Provide an Instagram alternative specifically for Stanclickin's audience, giving the creator direct access to fans without traditional social media algorithms and platform restrictions.

**Target Audience**: Stanclickin's existing fanbase from YouTube, TikTok, and other platforms.

**Value Proposition**:
- Direct fan engagement without algorithm throttling
- Exclusive content (music videos) only available in the app
- Community features for superfans to connect
- Interactive entertainment (mini-games)

**Monetization Strategy**: In-app purchases in FLAPPYCLICKIN game (extra lives).

## Project Overview

STANCLICKIN is a React Native mobile app built with Expo, featuring three main sections:
- **STANSPACE**: Instagram-alternative social network with posts, likes, comments, and following/trending feeds
- **STANHUB**: Exclusive hosting of Stanclickin's music videos (not available elsewhere)
- **FLAPPYCLICKIN**: Flappy Bird-style minigame with in-app purchase monetization

## Development Commands

### Starting the app
```bash
npx expo start       # Start development server
npm run android      # Run on Android emulator
npm run ios          # Run on iOS simulator
npm run web          # Run in web browser
```

### Code quality
```bash
npm run lint         # Run ESLint
```

## Architecture

### Routing & Navigation
- Uses **Expo Router** (v6) with file-based routing in the `app/` directory
- Route structure maps directly to file structure (e.g., `app/stanspace.tsx` → `/stanspace`)
- Dynamic routes use brackets (e.g., `app/u/[uid].tsx` → `/u/:uid`)
- Path alias `@/*` maps to project root

### Authentication Flow
Centralized in `app/_layout.tsx`:
1. Listens to Firebase Auth state with `onAuthStateChanged`
2. For authenticated users, listens to their user document to check if username is set
3. Automatically redirects based on state:
   - Not logged in + accessing protected route → `/login`
   - Logged in + on login page → `/`
   - Logged in + no username + not on username page → `/username`
   - Logged in + has username + on username page → `/`

**Protected routes**: `stanspace`, `stanhub`, `flappyclickin`, `post`, `settings`, `u/[uid]`

### Firebase Integration
Located in `src/lib/firebase.ts`:
- **Auth**: Uses `initializeAuth` with AsyncStorage persistence for React Native
- **Firestore**: Standard initialization
- Firebase config is directly in the file (public config, not sensitive)

### Firestore Data Model
Key collections:
- `users/{uid}` - User profiles (contains username field)
- `posts/{postId}` - Post documents with fields:
  - `uid`: Author's user ID
  - `text`: Post content
  - `likeCount`, `commentCount`, `engagementCount`: Counters
  - `createdAt`: Server timestamp
- `posts/{postId}/likes/{uid}` - Like subcollection for tracking who liked a post
- `follows/{uid}/following/{followedUid}` - Following relationships

### Key Patterns

**Real-time data**: Uses Firestore `onSnapshot` for live updates to posts, likes, and follows

**Transactions for consistency**: Like operations use `runTransaction` to atomically:
- Add/remove like document
- Increment/decrement `likeCount` and `engagementCount` on post

**Username caching**: The `useUsernameCache` hook caches username lookups in a ref to avoid repeated Firestore reads when rendering multiple posts from the same user

**Feed modes**:
- **Trending**: Query posts ordered by `engagementCount` desc, then `createdAt` desc (real-time listener)
- **Following**: Fetch posts from followed users in batches of 10 (Firestore `in` query limit), then sort client-side

**Navigation**: Uses `expo-router`'s `router.push()` and `router.replace()` for programmatic navigation

## Expo Configuration

Key settings in `app.json`:
- New Architecture enabled (`newArchEnabled: true`)
- Typed routes experiment enabled for type-safe navigation
- React Compiler experiment enabled
- Supports iOS, Android, and web platforms
- Edge-to-edge enabled on Android

## TypeScript

- Strict mode enabled
- Uses Expo's base tsconfig
- Path aliases configured (`@/*` → root)
