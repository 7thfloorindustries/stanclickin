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

**Current Status (as of 2026-01-19)**:
- Version 1.0.1 submitted to Apple App Store (awaiting review)
- IAP temporarily removed from this version, will be re-added in 1.0.2
- Previous rejections resolved: icons fixed, content moderation implemented, video rights documented
- Bunny CDN hosting active for STANHUB videos

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
- `reports/{reportId}` - User reports for content moderation:
  - `type`: "post" or "comment"
  - `postId`, `commentId`: IDs of reported content
  - `reportedBy`: Username of reporter
  - `reason`: "spam", "harassment", or "inappropriate"
  - `status`: "pending", "dismissed", or "resolved"

### Content Moderation System

**Required for Apple App Store Guideline 1.2 compliance**

**1. Terms of Service** (`app/login.tsx:21-24`)
- Users must check ToS acceptance before creating account
- ToS states zero tolerance for objectionable content

**2. Automated Content Filtering** (Custom regex patterns)
- Implemented in: `app/stanspace.tsx:318-341`, `app/post.tsx:521-542`, `app/u/[uid].tsx:258-279`
- Blocks extreme harmful content before posts/comments are created
- Filters: violence threats, slurs, illegal content, extreme hate speech
- Regular profanity is allowed (adult/teen audience)

**3. User Reporting System**
- Report posts: Three-dot menu → "Report" button
- Report comments: Long-press comment → "Report"
- Report reasons: Spam, Harassment, Inappropriate content
- Reports stored in Firestore `/reports` collection

**4. Admin Moderation Panel** (`app/admin.tsx`)
- Access: Settings → "Admin" section → "Open Admin Panel"
- View all pending reports in real-time
- Review reported content before action
- Delete content or dismiss false reports
- View user directory
- Contact information displayed for App Store compliance
- Admin access controlled by `isAdmin` field in user document

**5. Block Users**
- Block from user profile pages
- Blocked users' content hidden from feed

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

## External Services

### Bunny CDN (Video Hosting)
- **Purpose**: Hosts exclusive music videos for STANHUB section
- **Location**: `app/stanhub.tsx`
- **CDN URL**: Videos served from Bunny CDN domain
- **Cost**: Paid hosting service (free trial expired)
- **Important**: If Bunny account expires, STANHUB will break. Keep account active.

### Firebase
- **Authentication**: Email/password auth with AsyncStorage persistence
- **Firestore**: Real-time database for posts, users, follows, reports
- **Security**: Rules configured in `firestore.rules`
- **Config**: Public client config in `src/lib/firebase.ts` (not sensitive)

## Version History

### Version 1.0.1 (Current - In Review)
- **Status**: Submitted to App Store 2026-01-19
- **Changes from 1.0.0**:
  - IAP temporarily removed (will return in 1.0.2)
  - Content moderation system implemented
  - ToS acceptance required on signup
  - Report system for posts/comments
  - Admin moderation panel added
  - App icons updated
  - Fixed Firestore security rules for bookmarks, likes, reposts

### Version 1.0.0 (Rejected)
- **Rejection reasons**:
  - Guideline 2.3.8: Placeholder app icons
  - Guideline 1.2: Missing UGC moderation
  - Guideline 5.2.3: Video content rights not documented
  - Guideline 2.1: IAP not working properly

## See Also
- `DEPLOYMENT.md` - Build and submission process
- `TROUBLESHOOTING.md` - Common issues and solutions
