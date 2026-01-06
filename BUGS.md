# Known Bugs & Issues

Issues discovered during testing that need to be fixed in future updates.

---

## High Priority

### New Users Cannot Post, Like, Bookmark, or Repost (Comments Work)
**Severity:** BLOCKER - APP CANNOT SHIP (core functionality completely broken)
**Location:** Firebase Security Rules (Firestore + Storage), `app/stanspace.tsx`, `components/PostCard.tsx`
**Description:** New accounts cannot perform core actions. Like, Bookmark, Repost, and **Creating Posts** all fail. Comments work.

**Steps to Reproduce:**
1. Create new account
2. Go to STANSPACE feed
3. Try to create a post → **Error: "Firebase Storage: User does not have permission to access"**
4. Try to like a post → **Error: "Failed to update like"**
5. Try to bookmark a post → **Error: "Failed to update bookmark"**
6. Try to repost → **Error: "Failed to update repost"**
7. BUT commenting DOES work
8. Old accounts can do ALL of these actions

**Expected Behavior:** All interaction buttons should work for new accounts.

**What happens when you tap Like/Bookmark/Repost?**
- [x] Button animates and changes color
- [x] Then reverts back to original state
- [x] Error message shown: "Failed to update repost/bookmark/like"
- [x] Old accounts CAN like/bookmark/repost successfully

**Root Cause:** Firebase Security Rules are too restrictive. Both Firestore and Storage rules are blocking new users from:
- Creating posts (Storage upload blocked)
- Liking posts (Firestore write blocked)
- Bookmarking posts (Firestore write blocked)
- Reposting (Firestore write blocked)

But comments work, suggesting rules allow some writes but not others.

**IMMEDIATE FIX REQUIRED:**
1. Open Firebase Console → Firestore Database → Rules
2. Open Firebase Console → Storage → Rules
3. Update rules to allow authenticated users to:
   - Upload images to Storage
   - Write to posts collection
   - Write to likes/bookmarks subcollections
4. Example working rules needed:
   ```
   // Firestore
   match /posts/{postId}/likes/{userId} {
     allow write: if request.auth.uid == userId;
   }

   // Storage
   match /posts/{allPaths=**} {
     allow write: if request.auth != null;
   }
   ```

**Status:** Discovered in TestFlight testing (2026-01-06)
**Target Fix Version:** 1.0.1 (URGENT - may need hotfix before 1.0 release)
**Assigned To:** TBD

---

### Home Screen Music Doesn't Auto-Play on First Launch
**Severity:** Low (UX issue, not breaking)
**Location:** `app/index.tsx`
**Description:** Background music on the home screen doesn't start playing automatically when the app first opens. User must navigate to another screen and return to home for music to start.

**Steps to Reproduce:**
1. Fresh launch of the app
2. Land on home screen
3. Music doesn't play
4. Navigate to STANSPACE (or any other screen)
5. Return to home screen
6. Music now plays

**Expected Behavior:** Music should start playing automatically when home screen first loads.

**Technical Cause:** Timing issue - the audio file loads asynchronously in `useEffect`, but `useFocusEffect` may run before the sound is fully loaded and ready to play.

**Possible Solution:**
```typescript
// In app/index.tsx, modify the music loading:
useEffect(() => {
  const loadMusic = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        require("../assets/music/rad beat.wav"),
        {
          isLooping: true,
          volume: 0.5,
        }
      );

      backgroundMusic.current = sound;

      // Add: Auto-play after loading
      await sound.playAsync();
    } catch (error) {
      console.error("Error loading background music:", error);
    }
  };

  loadMusic();

  return () => {
    backgroundMusic.current?.unloadAsync();
  };
}, []);
```

**Status:** Discovered in TestFlight testing (2026-01-06)
**Target Fix Version:** 1.0.1
**Assigned To:** TBD

---

## Medium Priority

### Theme Contrast Issues: Multiple UI Elements Unreadable
**Severity:** Medium (affects usability across multiple themes)
**Location:** Various - theme styling throughout app
**Description:** Multiple UI elements have insufficient contrast with backgrounds in certain themes, making them unreadable or invisible.

**Known Issues:**
1. **Cyberpunk theme:** Search results text is too dark to read
2. **Minimal background theme:** Follow button is invisible/unreadable

**Steps to Reproduce:**
1. Test each theme across all app screens
2. Check readability of all interactive elements
3. Verify buttons, text, and icons have sufficient contrast

**Expected Behavior:** All UI elements should be readable in all themes on all screens.

**Comprehensive Fix Needed:**
- Audit all 8+ themes across all screens:
  - Home screen
  - STANSPACE (feed, search results, user profiles)
  - STANHUB
  - FLAPPYCLICKIN
  - Settings
  - Post creation
  - Comments
- Test buttons: Follow, Like, Bookmark, Repost, Comment, etc.
- Test text: Search results, usernames, timestamps, post content
- Add theme-specific color overrides where needed
- Consider adding minimum contrast requirements

**Status:** Discovered in TestFlight testing (2026-01-06)
**Target Fix Version:** 1.0.1
**Assigned To:** TBD

---

## Low Priority

_No issues logged yet_

---

## Fixed

_No fixes yet_

---

## Won't Fix / By Design

_None_

---

Last updated: 2026-01-06
