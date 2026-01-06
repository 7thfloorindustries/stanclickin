# Known Bugs & Issues

Issues discovered during testing that need to be fixed in future updates.

---

## High Priority

### New Users Cannot Upload Photos or Bookmark Posts
**Severity:** CRITICAL (major functionality broken)
**Location:** Firebase Storage Rules, Bookmark functionality in `components/PostCard.tsx`
**Description:** New accounts have issues with photo uploads and bookmarks. Other features work with limitations.

**What Works:**
- ✅ Text posts (without images)
- ✅ Like own posts
- ✅ Repost own posts
- ✅ Comment on any post
- ✅ Like/repost OTHER users' posts (needs verification)

**What Fails:**
- ❌ **Photo posts** → Error: "Firebase Storage: User does not have permission to access"
- ❌ **Bookmark ANY post** (even own posts) → Error: "Failed to update bookmark"

**Steps to Reproduce:**
1. Create new account
2. Try to create post WITH photo → Storage permission error
3. Try to create text-only post → Works!
4. Try to bookmark any post (including own) → Fails
5. Try to like own post → Works!
6. Try to repost own post → Works!

**Expected Behavior:** All interaction buttons should work for new accounts.

**What happens when you tap Like/Bookmark/Repost?**
- [x] Button animates and changes color
- [x] Then reverts back to original state
- [x] Error message shown: "Failed to update repost/bookmark/like"
- [x] Old accounts CAN like/bookmark/repost successfully

**Root Cause - Two Separate Issues:**

1. **Storage Rules Too Restrictive:**
   - Firebase Storage not allowing authenticated users to upload images
   - Blocks photo posts but text posts work fine

2. **Bookmark Functionality Broken:**
   - Bookmarks fail even on own posts
   - Likely code bug, not just permissions (since like/repost own posts work)
   - May be missing Firestore collection or incorrect path

**FIXES REQUIRED:**

**Fix 1: Firebase Storage Rules**
1. Open Firebase Console → Storage → Rules
2. Update to allow authenticated users to upload:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /posts/{allPaths=**} {
         allow write: if request.auth != null;
         allow read: if true;
       }
     }
   }
   ```

**Fix 2: Bookmark Functionality**
1. Check if `bookmarks` collection/subcollection exists in Firestore
2. Verify Firestore rules for bookmarks path
3. Debug bookmark code in `components/PostCard.tsx`

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

### Photo Upload Forces Cropping - Is This Intentional?
**Severity:** Low (UX question, not a bug per se)
**Location:** `app/stanspace.tsx` image picker configuration
**Description:** When uploading a photo for a post, the app forces the user to crop the image before posting. This may be intentional design, but worth verifying.

**Current Behavior:**
- Select photo from library
- Forced into crop/edit screen
- Cannot skip cropping

**Question:** Is forced cropping intentional, or should users be able to post photos without cropping?

**If Not Intentional:**
Change expo-image-picker config from:
```typescript
allowsEditing: true  // Forces crop
```
To:
```typescript
allowsEditing: false  // Skip crop, use original
```

**Status:** Discovered in TestFlight testing (2026-01-06)
**Decision Needed:** Product decision - keep forced crop or make it optional?

---

## Fixed

_No fixes yet_

---

## Won't Fix / By Design

_None_

---

Last updated: 2026-01-06
