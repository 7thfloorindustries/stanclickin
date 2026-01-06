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

_No issues logged yet_

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
