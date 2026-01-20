# Direct Messaging Deployment Checklist

Before testing or releasing the DM feature, complete these steps:

## 1. Deploy Firebase Storage Rules ⚠️ CRITICAL

```bash
firebase deploy --only storage
```

**Verify deployment**:
```bash
firebase deploy --only storage --dry-run
```

**What this does**:
- Restricts message image uploads to authenticated users only
- Enforces 5MB file size limit
- Prevents unauthorized access to user messages

**Without this**: Anyone can upload/download/delete all message images!

---

## 2. Verify Firestore Rules Are Up to Date

```bash
firebase deploy --only firestore:rules
```

**What's included**:
- `/conversations` collection with participant checks
- `/conversations/{id}/messages` subcollection
- `/conversations/{id}/typing` subcollection
- Block validation via `isBlocked()` helper

---

## 3. Test TypeScript Compilation

```bash
npx tsc --noEmit
```

**Expected**: No errors (all type issues fixed)

**If errors appear**: Check these files:
- `app/messages/[conversationId].tsx` - SendMessage params
- `src/lib/messaging.ts` - Notification params
- `app/_layout.tsx` - Router navigation types

---

## 4. Run the App

```bash
npx expo start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- Scan QR code for physical device

---

## 5. Quick Smoke Test (2 min)

On Device/Simulator:
1. Log in with test account
2. Navigate to Messages tab
3. Verify: No crash
4. Tap a user profile
5. Tap "💬 Message" button
6. Type "Test" and send
7. Verify: Message appears

**If this works**: System is functional ✅

---

## 6. Two-Device Test Setup

**Required for full testing**:
- 2 different Firebase auth accounts
- 2 devices/simulators OR 2 browser tabs (if using web)

**Quick Setup**:
```bash
# Terminal 1: iOS
npx expo start
# Press 'i'

# Terminal 2: Android
npx expo start
# Press 'a'
```

Log in with different accounts on each device.

---

## 7. Verify Firebase Console

**Firestore Database**:
1. Go to Firebase Console → Firestore Database
2. Look for `conversations` collection
3. After sending first message, verify:
   - Conversation document created
   - `messages` subcollection exists
   - `typing` subcollection exists

**Storage**:
1. Go to Firebase Console → Storage
2. After sending first image:
   - `messages/` folder exists
   - `messages/{uid}/` folder has images
   - Files are named with timestamps

---

## 8. Check for Console Warnings

After using the app, check terminal for:
- ❌ Firebase permission errors → Rules not deployed
- ❌ TypeScript errors → Type mismatches exist
- ❌ Navigation errors → Route misconfigured
- ⚠️ "Possible unhandled promise rejection" → Error handling needed

**Clean console** = Good to go ✅

---

## 9. Test on Physical Device (Recommended)

Push notifications require physical device:
1. Build app: `eas build --profile development --platform ios`
2. Install on device
3. Enable notifications when prompted
4. Send message from another account
5. Background the app
6. Verify: Notification appears

---

## 10. Performance Check

**Expected Metrics**:
- Inbox loads in < 2 seconds
- Messages send in < 1 second
- Images upload in < 5 seconds (2MB)
- Typing indicators appear instantly

**If slow**:
- Check internet connection
- Verify Firebase location (should be nearest region)
- Check Firestore indexes (may need creating)

---

## 11. Security Verification

**Test 1: Unauthenticated Access**
```javascript
// In browser console or test file
firebase.firestore().collection('conversations').doc('test').get()
  .then(() => console.log('❌ SECURITY ISSUE: Unauthenticated read allowed'))
  .catch(() => console.log('✅ Security working: Access denied'));
```

**Test 2: Cross-User Access**
1. Log in as User A
2. Find conversation ID for User B & User C
3. Try: `router.push('/messages/userB-userC-conversation-id')`
4. Expected: ❌ Permission denied or empty messages

**Test 3: Image Upload to Wrong Path**
- Try uploading to `messages/someone-else-uid/test.jpg`
- Expected: ❌ Permission denied

---

## 12. Post-Deployment Monitoring

**First 24 Hours**:
- [ ] Check Firebase Usage dashboard for quotas
- [ ] Monitor Firestore read/write counts
- [ ] Check Storage bandwidth usage
- [ ] Review error logs in Firebase Crashlytics (if enabled)

**Thresholds to Watch**:
- Firestore: < 50k reads/day (Spark plan)
- Storage: < 5GB downloads/day (Spark plan)
- Functions: N/A (not used in DM system)

---

## Rollback Plan (If Issues Found)

**Option 1: Disable DM Feature**
1. Remove "💬 Messages" from bottom nav in `stanspace.tsx`
2. Hide DMButton in user profiles
3. Push update to production

**Option 2: Revert Deployment**
```bash
# Revert to previous Firestore rules
firebase deploy --only firestore:rules --force

# Delete storage.rules and redeploy
firebase deploy --only storage --force
```

**Option 3: Emergency Fix**
- Fix bug in codebase
- Deploy: `eas build --profile production --platform all`
- Submit to stores

---

## Success Criteria

✅ All items checked:
- [ ] Storage rules deployed
- [ ] Firestore rules deployed
- [ ] TypeScript compiles with no errors
- [ ] App runs without crashes
- [ ] Can send text messages
- [ ] Can send images
- [ ] Can share posts
- [ ] Push notifications work
- [ ] Security rules block unauthorized access
- [ ] No console errors

**If all ✅**: Ready for production! 🚀

---

## Common Issues & Fixes

### Issue: "Permission denied" when sending images
**Fix**: Deploy storage rules: `firebase deploy --only storage`

### Issue: "Cannot read property 'conversationId' of undefined"
**Fix**: Check notification payload includes `conversationId` field

### Issue: Messages don't appear in real-time
**Fix**: Check Firestore listener is active (not unsubscribed early)

### Issue: Typing indicator stuck on "typing..."
**Fix**: Verify typing timeout clears after 3 seconds

### Issue: Images over 5MB don't show error
**Fix**: Check `uploadImage` function has size validation

### Issue: Navigation fails from push notification
**Fix**: Verify routes configured in `app/_layout.tsx`

---

**Last Updated**: 2026-01-19
**Deployment Version**: v1.0.0
