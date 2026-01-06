# STANCLICKIN Production Deployment Checklist

## ✅ Pre-Flight Security Checks

### Admin Access
- [x] **Admin panel secured**: Only users with `isAdmin: true` in Firestore can access
- [x] **Admin panel hidden**: UI only shows "Open Admin Panel" button if user is admin
- [x] **Admin routes protected**: `/admin` route checks `isAdmin` before rendering content
- [ ] **Set your admin account**: Manually set `isAdmin: true` in Firestore for your user account
- [ ] **Remove test admin accounts**: Check Firebase Console → Firestore → `users` collection → remove `isAdmin: true` from any test accounts

### Firestore Security Rules
- [x] **Production rules deployed**: Comprehensive security rules in `firestore.rules`
- [ ] **Deploy rules to Firebase**: Run `firebase deploy --only firestore:rules` OR copy/paste into Firebase Console

**Key security features:**
- ✅ Users can only modify their own data
- ✅ Reports collection only readable by admins
- ✅ Videos (STANHUB) only manageable by admins
- ✅ Block lists private to each user
- ✅ All write operations require authentication

---

## 📱 App Store Compliance

### Required URLs (Already Set Up)
- [x] **Privacy Policy**: https://7thfloorindustries.github.io/stanclickin-legal/privacy.html
- [x] **Terms of Service**: https://7thfloorindustries.github.io/stanclickin-legal/terms.html
- [x] **Contact emails**: support@7thfloor.digital, moderation@7thfloor.digital, privacy@7thfloor.digital

### App Store Requirements
- [x] User reporting system
- [x] User blocking system
- [x] Content moderation (Admin panel)
- [x] Account deletion
- [x] Privacy Policy
- [x] Terms of Service
- [x] Contact information
- [x] Age requirements (13+)

---

## 🔧 Code Cleanup for Production

### In-App Purchases (IAP)
**Status**: Currently disabled for Expo Go testing

**Action Required**:
1. Open `app/flappyclickin.tsx`
2. **Uncomment** the IAP import (line ~6):
   ```typescript
   import * as IAP from "react-native-iap";
   ```
3. **Uncomment** the IAP initialization useEffect (lines ~80-120)
4. **Replace** the stub `purchaseLife` function with the real implementation (lines ~122-180)

**When to do this**:
- ✅ For TestFlight builds
- ✅ For production App Store builds
- ❌ NOT for Expo Go testing (will crash)

### Console Logs
**Status**: Present throughout the app for debugging

**Recommendation**:
- Keep `console.error()` - useful for production error tracking
- Consider removing `console.log()` - can impact performance
- Files with console logs: Found in 12 files

**Optional cleanup** (not required):
```bash
# Search for console.logs
grep -r "console\.log" app/
```

### Development Artifacts
- [ ] **Remove `.bak` files**: Delete `app/stanspace.tsx.bak2` if not needed
- [ ] **Check for test data**: Review Firebase Console for any test posts/users
- [ ] **Verify all placeholder content replaced**: Check STANHUB videos are uploaded

---

## 🚀 Building for Production

### Prerequisites
```bash
# Ensure EAS CLI is installed
npm install -g eas-cli

# Login to Expo
eas login
```

### iOS Production Build
```bash
# Configure EAS if not already done
eas build:configure

# Create production build for App Store
eas build --platform ios --profile production

# Or create TestFlight build first
eas build --platform ios --profile preview
```

### Android Production Build
```bash
# Create production build for Google Play
eas build --platform android --profile production
```

---

## 📋 Final Pre-Launch Checklist

### Firebase Configuration
- [ ] Verify Firebase project is in production mode (not test mode)
- [ ] Deploy Firestore security rules
- [ ] Review Firebase Authentication settings
- [ ] Check Firebase Storage rules (if using)
- [ ] Verify billing is enabled for Firebase (required for production scale)

### Testing
- [ ] Test IAP in TestFlight build (NOT Expo Go)
- [ ] Test all moderation features (report, block, admin panel)
- [ ] Test account deletion flow
- [ ] Verify Privacy Policy and Terms of Service links open correctly
- [ ] Test STANHUB video playback
- [ ] Test FLAPPYCLICKIN game
- [ ] Test user registration and login

### Admin Setup
- [ ] Set `isAdmin: true` for your main account in Firestore
- [ ] Test admin panel access
- [ ] Create a few test reports to practice moderation
- [ ] Upload all STANHUB videos to Firebase Storage
- [ ] Create video entries in Firestore `videos` collection

### App Store Submission
- [ ] App Store screenshots prepared
- [ ] App Store description written
- [ ] Keywords selected
- [ ] App icon finalized (1024x1024px)
- [ ] Privacy Policy URL: https://7thfloorindustries.github.io/stanclickin-legal/privacy.html
- [ ] Support URL: https://7thfloorindustries.github.io/stanclickin-legal/
- [ ] Age rating: 13+

---

## 🎯 Post-Launch

### Monitoring
- Monitor Firebase Console for:
  - User growth
  - Error rates
  - Report submissions
  - Storage usage

### Moderation
- Check Admin Panel daily for new reports
- Respond to user emails at support@7thfloor.digital
- Monitor moderation@7thfloor.digital for automated reports

### Firebase Costs
- Monitor Firebase billing
- Free tier limits:
  - Firestore: 50K reads/day, 20K writes/day
  - Storage: 5GB total, 1GB/day downloads
  - Authentication: Unlimited (free)

---

## 🔐 Security Notes

**Admin Access**:
- Only manually set `isAdmin: true` in Firestore for trusted users
- Never expose admin credentials
- Regularly audit who has admin access

**API Keys**:
- Firebase config in `src/lib/firebase.ts` is safe to expose (client-side config)
- These are NOT secret keys - they identify your Firebase project

**Firestore Rules**:
- Current rules are production-ready and secure
- Test any rule changes in Firebase Console simulator before deploying

---

## ✅ Ready to Ship When:

1. ✅ Firestore rules deployed to production
2. ✅ IAP code re-enabled in flappyclickin.tsx
3. ✅ Admin account(s) configured with `isAdmin: true`
4. ✅ Production build created with EAS
5. ✅ All features tested in TestFlight
6. ✅ Privacy Policy & Terms accessible online
7. ✅ STANHUB videos uploaded

**Congratulations! You're ready to launch STANCLICKIN! 🚀**
