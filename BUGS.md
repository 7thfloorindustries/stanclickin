# Known Bugs & Issues

Issues discovered during testing that need to be fixed in future updates.

---

## High Priority

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

### Keyboard Covers Comment Input on Long Posts
**Severity:** Medium (UX issue)
**Location:** `app/post.tsx`
**Description:** When commenting on long posts (like the Flappyclickin post), the keyboard covers the comment input field, making it impossible to see what you're typing.

**Steps to Reproduce:**
1. Go to STANSPACE
2. Click on a long post (e.g., Flappyclickin announcement)
3. Tap the comment input field at bottom
4. Keyboard appears and covers the input
5. Cannot see what you're typing

**Expected Behavior:** Page should scroll up or adjust so comment input is visible above keyboard.

**Technical Cause:** Missing or misconfigured KeyboardAvoidingView/KeyboardAwareScrollView in post detail screen.

**Possible Solution:**
- Wrap post detail content in `KeyboardAvoidingView` with `behavior="padding"` (iOS)
- Or use `react-native-keyboard-aware-scroll-view` (already installed)
- Ensure comment input has proper `keyboardVerticalOffset`

**Status:** Discovered in TestFlight testing (2026-01-06)
**Target Fix Version:** 1.0.1
**Assigned To:** TBD

---

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

### Photo Uploads and Social Interactions (Fixed 2026-01-06)
**Was:** New users couldn't upload photos, like/repost/bookmark other users' posts
**Root Cause:**
1. Firebase Storage rules missing `/posts/` path
2. Firestore rules didn't allow counter updates on posts you don't own
3. Firestore rules missing `/bookmarks/` path

**Fix Applied:**
1. Added Storage rules for `/posts/{allPaths=**}`
2. Updated post rules to allow counter field updates
3. Added Firestore rules for `/bookmarks/{userId}/posts/{postId}`

**Status:** ✅ FIXED - All features now work for all users

---

## Won't Fix / By Design

_None_

---

Last updated: 2026-01-06
