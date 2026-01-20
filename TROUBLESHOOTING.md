# TROUBLESHOOTING GUIDE

Complete history of issues encountered and their solutions.

## Table of Contents
- [Apple App Store Rejections](#apple-app-store-rejections)
- [In-App Purchase (IAP) Issues](#in-app-purchase-iap-issues)
- [Firebase/Firestore Issues](#firebasefirestore-issues)
- [Build Issues](#build-issues)
- [Runtime Issues](#runtime-issues)

---

## Apple App Store Rejections

### Rejection 1: Multiple Guideline Violations

**Date:** Initial submission (Version 1.0.0)

**Violations:**
1. Guideline 2.3.8 - Placeholder app icons
2. Guideline 1.2 - Missing user-generated content moderation
3. Guideline 5.2.3 - Video content rights not documented
4. Guideline 2.1 - IAP not working

#### Fix 1: App Icons (Guideline 2.3.8)

**Problem:** Using placeholder/generic icons

**Solution:**
- Created custom app icons featuring Stanclickin branding
- Updated `icon.png` in project root
- Used proper sizing and format for iOS

**Files Changed:**
- `icon.png`
- `adaptive-icon.png`

#### Fix 2: Content Moderation (Guideline 1.2)

**Problem:** No moderation system for user-generated content (STANSPACE posts/comments)

**Solution Implemented:**

**1. Terms of Service Acceptance**
- Added ToS checkbox to login flow
- Users must accept before creating account
- ToS states zero tolerance for objectionable content

**Files:** `app/login.tsx` (lines 21-24)

**2. Automated Content Filtering**
- Custom regex patterns to block extreme harmful content
- Filters applied before post/comment creation
- Blocks: violence, slurs, illegal content, hate speech

**Files:**
- `app/stanspace.tsx` (lines 318-341)
- `app/post.tsx` (lines 521-542)
- `app/u/[uid].tsx` (lines 258-279)

**Code example:**
```typescript
const containsExtremeContent = (text: string): boolean => {
  const patterns = [
    /\b(kill|murder|shoot|stab|bomb)\s+(you|him|her|them|myself)\b/i,
    /\b(n[i1]gg[ae]r|f[a4]gg[o0]t|ch[i1]nk|sp[i1]c)\b/i,
    // ... more patterns
  ];
  return patterns.some(pattern => pattern.test(text));
};
```

**3. User Reporting System**
- Report button on all posts (three-dot menu)
- Long-press comments to report
- Report reasons: Spam, Harassment, Inappropriate
- Reports stored in Firestore `/reports` collection

**Files:** `app/post.tsx` (report modal)

**4. Admin Moderation Panel**
- Created dedicated admin panel
- View all pending reports
- Delete content or dismiss reports
- User directory view
- Contact info displayed for compliance

**Files:** `app/admin.tsx` (full admin interface)

**Access:** Settings → "Admin" section → "Open Admin Panel"

**5. Block Users**
- Block functionality on user profiles
- Blocked users' content hidden from feed

#### Fix 3: Video Rights (Guideline 5.2.3)

**Problem:** No proof that we have rights to music videos in STANHUB

**Solution:**
- Documented that Stanclickin is the artist/creator
- Uploaded screenshots showing ownership of:
  - YouTube channel (@stanclickin)
  - Spotify artist account
- Added explanation in App Review Notes
- Included links to public profiles

**Screenshots:** https://drive.google.com/drive/folders/1mtWBdzlPfcGmLrsakg5BbqTqq1T4ocdv?usp=sharing

#### Fix 4: IAP Not Working (Guideline 2.1)

**Problem:** IAP never worked, causing rejection

**Temporary Solution for v1.0.1:**
- Completely removed IAP code
- Uninstalled `react-native-iap` dependency
- Deleted IAP product from App Store Connect
- Will re-implement properly in v1.0.2

**Permanent Solution (for v1.0.2):**
- See [In-App Purchase Issues](#in-app-purchase-iap-issues) section below

---

## In-App Purchase (IAP) Issues

### Critical Bug: Purchase Event Listeners Missed

**Symptoms:**
- "Could not start purchase. Please try again." error
- IAP never worked, even in TestFlight
- No visible errors in console (production builds strip console.log)

**Root Cause:**
Purchase event listeners were set up AFTER calling `requestPurchase()`, causing the purchase events to be missed.

**Original Broken Code:**
```typescript
const purchaseLife = async () => {
  await IAP.requestPurchase({ sku: productId }); // Purchase happens here

  // TOO LATE! Listeners set up after purchase already completed
  const purchaseUpdateSubscription = IAP.purchaseUpdatedListener((purchase) => {
    // This never fires because event already happened
  });
}
```

**Fix:**
Move listeners to `useEffect` on component mount, BEFORE any purchases can happen:

```typescript
// Set up listeners ONCE when component mounts
useEffect(() => {
  const initIAP = async () => {
    await IAP.initConnection();
    const products = await IAP.getProducts({ skus: PRODUCT_IDS });
    // Optional: Add debug alerts for TestFlight debugging
  };

  initIAP();

  // Listeners active BEFORE any purchase is requested
  const purchaseUpdateSubscription = IAP.purchaseUpdatedListener(async (purchase) => {
    const receipt = purchase.transactionReceipt;
    if (receipt) {
      await IAP.finishTransaction({ purchase });
      Alert.alert("Purchase Successful!", "Extra life granted!");
      grantLife();
    }
  });

  const purchaseErrorSubscription = IAP.purchaseErrorListener((error) => {
    if (error.code !== 'E_USER_CANCELLED') {
      Alert.alert("Purchase Failed", "Could not complete purchase.");
    }
  });

  return () => {
    purchaseUpdateSubscription.remove();
    purchaseErrorSubscription.remove();
    IAP.endConnection();
  };
}, []);

// Now purchase function is simple
const purchaseLife = async () => {
  try {
    await IAP.requestPurchase({ sku: PRODUCT_IDS[0] });
    // Listeners already active, will catch the event
  } catch (error) {
    Alert.alert("Purchase Error", "Could not start purchase.");
  }
};
```

**Status:** Fixed in code but not yet tested (removed from v1.0.1, will test in v1.0.2)

### IAP Configuration Checklist

When re-adding IAP for v1.0.2:

**1. App Store Connect Setup:**
- [ ] Create IAP product
  - Product ID: `com.stanclickin.app.extralife`
  - Type: Consumable
  - Price: $0.99
  - Display Name: "Extra Life"
  - Description: "Get an extra life with 3 seconds of invincibility"
- [ ] Set to "Ready to Submit"
- [ ] Link to app version
- [ ] Verify Paid Apps Agreement is signed

**2. Code Setup:**
```typescript
const PRODUCT_IDS = Platform.select({
  ios: ['com.stanclickin.app.extralife'],
  android: ['extralife'],
}) || [];
```

**3. Testing:**
- [ ] Test in sandbox with sandbox Apple ID
- [ ] Verify purchase flow completes
- [ ] Verify life is granted
- [ ] Verify invincibility activates
- [ ] Test in TestFlight with real Apple ID
- [ ] Add debug alerts for production debugging

**4. Common IAP Errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| "Could not connect to iTunes Store" | No network / Sandbox account issue | Check network, sign out/in to sandbox account |
| "Product not found" | Product ID mismatch or not set to "Ready to Submit" | Verify product ID exact match, check status in App Store Connect |
| "Purchase Error" | Listener not set up or code error | Verify listeners in useEffect before requestPurchase |
| No response | Listeners set up after purchase | Move listeners to useEffect |

---

## Firebase/Firestore Issues

### Issue: Bookmarks Not Working

**Symptom:** "Missing or insufficient permissions" when creating bookmark

**Cause:** No Firestore rules for `bookmarks` collection

**Fix:** Added rules to `firestore.rules`:
```javascript
match /users/{uid}/bookmarks/{postId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

### Issue: Can't Like Other Users' Posts

**Symptom:** "Missing or insufficient permissions" when liking posts from other users

**Cause:** Post update rules only allowed post owner to update

**Original (Broken):**
```javascript
match /posts/{postId} {
  allow update: if request.auth.uid == resource.data.uid;  // Only owner!
}
```

**Fix:** Allow anyone to update counter fields only:
```javascript
match /posts/{postId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.uid;
  allow update: if request.auth != null && (
    // Owner can update their own post
    request.auth.uid == resource.data.uid
    // OR anyone can update ONLY these counter fields
    || (
      request.resource.data.diff(resource.data).affectedKeys().hasOnly([
        'likeCount', 'commentCount', 'repostCount', 'engagementCount'
      ])
    )
  );
}
```

### Issue: Comment Deletion Shows Error But Works

**Symptom:** "Delete failed: missing or insufficient permissions" but comment deletes successfully

**Cause:** Trying to delete subcollections before parent document

**Fix:** Delete subcollections first, then parent:
```typescript
// Delete likes subcollection first
const likesSnapshot = await getDocs(
  collection(db, "posts", postId, "comments", commentId, "likes")
);
const deletePromises = likesSnapshot.docs.map(doc => deleteDoc(doc.ref));
await Promise.all(deletePromises);

// Then delete comment document
await deleteDoc(doc(db, "posts", postId, "comments", commentId));
```

---

## Build Issues

### Issue: Build Fails with Dependency Error

**Cause:** Incompatible package versions or corrupted `node_modules`

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
eas build --platform ios --profile production --auto-submit
```

### Issue: Build Succeeds But Doesn't Upload to App Store Connect

**Cause:** Missing `--auto-submit` flag

**Solution:**
Use the correct command:
```bash
eas build --platform ios --profile production --auto-submit
```

Or submit manually after build:
```bash
eas submit --platform ios --latest
```

### Issue: TypeScript Errors During Build

**Common causes:**
- Missing type definitions
- Strict mode violations
- Import path issues

**Solution:**
```bash
npx tsc --noEmit  # Check for type errors locally
npm run lint      # Check for linting issues
```

---

## Runtime Issues

### Issue: App Crashes on STANHUB Section

**Symptom:** App crashes when opening STANHUB or videos won't load

**Cause:** Bunny CDN account expired or videos not accessible

**Solution:**
1. Log into Bunny CDN dashboard
2. Check account status and balance
3. Top up account if needed
4. Verify video URLs are accessible

**Prevention:** Set up billing alerts in Bunny CDN

### Issue: Console.log Not Showing in TestFlight

**Symptom:** Debug statements don't appear in TestFlight builds

**Cause:** Production builds strip console.log statements

**Solution:** Use `Alert.alert()` for debugging production builds:
```typescript
// Instead of:
console.log("Product found:", product);

// Use:
Alert.alert("Debug", `Product found: ${product.productId}`);
```

### Issue: Authentication Loops

**Symptom:** User keeps getting redirected between login and app

**Cause:** Auth state listener or username check racing

**Check:**
- `app/_layout.tsx` auth redirection logic
- Make sure username is properly set after creation
- Verify Firebase persistence is working

### Issue: Posts Not Showing in Feed

**Common causes:**
1. No posts exist yet
2. Feed mode (following) but not following anyone
3. Firestore rules blocking read access
4. Timestamp issues

**Debug:**
```typescript
// Check Firestore rules
// Check if posts collection has documents
// Verify onSnapshot listener is set up
// Check for errors in console
```

---

## Debugging Tips

### TestFlight Debugging

Since console.log doesn't work in production builds:

1. **Use Alerts:**
```typescript
Alert.alert("Debug", `Value: ${JSON.stringify(value)}`);
```

2. **Write to Firestore:**
```typescript
await addDoc(collection(db, "debug_logs"), {
  message: "Something happened",
  timestamp: serverTimestamp(),
  data: value
});
```

3. **Xcode Console (for partner with physical device):**
- Connect device to Mac
- Open Xcode → Window → Devices and Simulators
- Select device → View Device Logs
- Search for "stanclickin"

### Common Firebase Debugging

```typescript
// Enable Firestore debug logging
import { enableIndexedDbPersistence } from 'firebase/firestore';
// Check persistence status

// Log all Firestore operations
onSnapshot(query,
  (snapshot) => {
    console.log("Snapshot size:", snapshot.size);
    console.log("Metadata:", snapshot.metadata);
  },
  (error) => {
    console.error("Snapshot error:", error);
  }
);
```

---

## Prevention Checklist

Before submitting to App Store:

- [ ] Test all major features work (STANSPACE, STANHUB, FLAPPYCLICKIN)
- [ ] Verify content moderation is active
- [ ] Test report system works
- [ ] Verify admin panel is accessible
- [ ] Check Bunny CDN account is active
- [ ] Test on actual iOS device (not just simulator)
- [ ] Review App Review Notes accuracy
- [ ] Verify test account credentials work
- [ ] Check IAP configuration (if version has IAP)
- [ ] Run through user flow as reviewer would

---

## Emergency Contacts

**If app goes down in production:**

1. Check Bunny CDN status (videos)
2. Check Firebase status (auth/database)
3. Check App Store Connect for crash reports
4. Monitor user reviews for common issues

**Support Channels:**
- support@7thfloor.digital
- moderation@7thfloor.digital

---

## Known Limitations

### Current Limitations (v1.0.1)
- No in-app purchases (temporarily removed)
- No push notifications
- No Android version yet
- No direct messaging between users
- Regular profanity not filtered (by design for adult audience)

### Future Improvements (Planned)
- Re-add IAP (v1.0.2)
- Push notifications for likes/comments
- Android version
- Direct messaging
- Advanced moderation tools
- Analytics dashboard
