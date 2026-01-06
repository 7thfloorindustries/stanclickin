# STANCLICKIN Troubleshooting Guide

Common errors encountered during development and deployment, with solutions.

---

## Build Errors

### Error: ffmpeg-kit-ios-https download fails (404)

**Full Error:**
```
[!] Error installing ffmpeg-kit-ios-https
curl: (56) The requested URL returned error: 404
https://github.com/arthenica/ffmpeg-kit/releases/download/v6.0/ffmpeg-kit-https-6.0-ios-xcframework.zip
```

**Cause:** The `ffmpeg-kit-react-native` package is deprecated and the download URLs for iOS frameworks are broken.

**Solution:**
1. Remove the package from `package.json`:
   ```json
   // Remove this line:
   "ffmpeg-kit-react-native": "^6.0.2"
   ```

2. Remove files that import it:
   ```bash
   rm app/gifmaker.tsx
   ```

3. Remove any menu buttons/navigation to the removed feature:
   ```tsx
   // In app/index.tsx, remove:
   <MenuButton
     title="GIF MAKER"
     subtitle="Turn videos into GIFs"
     onPress={() => handlePress("/gifmaker", "gifmaker")}
   />
   ```

4. Commit and push:
   ```bash
   git add -A
   git commit -m "Remove deprecated ffmpeg package"
   git push
   ```

**Alternative:** Find a maintained replacement package for video/GIF processing in future updates.

---

### Error: Reanimated requires New Architecture

**Full Error:**
```
[!] Invalid `RNReanimated.podspec` file:
[Reanimated] Reanimated requires the New Architecture to be enabled.
If you have `RCT_NEW_ARCH_ENABLED=0` set in your environment you should remove it.
```

**Cause:** `react-native-reanimated` version 4.x requires React Native's new architecture to be enabled, but it was disabled in `app.json`.

**Solution:**
Enable new architecture in `app.json`:
```json
{
  "expo": {
    "newArchEnabled": true
  }
}
```

**Note:** The new architecture itself isn't the problem - the ffmpeg package was. Once ffmpeg is removed, new architecture works fine.

---

### Error: Unable to resolve module ffmpeg-kit-react-native

**Full Error:**
```
Unable to resolve module ffmpeg-kit-react-native from /Users/expo/workingdir/build/app/gifmaker.tsx:
ffmpeg-kit-react-native could not be found within the project
```

**Cause:** The package was removed from `package.json` but files still import it.

**Solution:**
Delete all files that import the removed package:
```bash
rm app/gifmaker.tsx
```

Commit and push the deletion.

---

## Permission Errors

### Error: EACCES permission denied (npm install)

**Full Error:**
```
npm error code EACCES
npm error syscall mkdir
npm error path /usr/local/lib/node_modules/eas-cli
npm error errno -13
```

**Cause:** Trying to install global npm packages without admin privileges.

**Solution:**
Use `sudo` for global installs:
```bash
sudo npm install -g eas-cli
```

Enter your Mac password when prompted (you won't see it as you type).

---

### Error: Permission denied on npm cache

**Full Error:**
```
npm error EACCES: permission denied, mkdir '/Users/username/.npm/_cacache/content-v2/sha512/6b/85'
```

**Cause:** npm cache directory ownership is incorrect.

**Solution:**
Fix cache ownership:
```bash
sudo chown -R $(whoami) ~/.npm
```

Then retry:
```bash
npm install
```

If still failing, clear cache:
```bash
npm cache clean --force
npm install
```

---

## Apple Developer / Authentication Errors

### Error: "You are not registered as an Apple Developer"

**Cause:** Either:
1. Using wrong Apple ID
2. Account doesn't have paid Apple Developer Program membership ($99/year)

**Solution:**
1. Verify you're using the Apple ID with paid developer membership
2. Check at https://developer.apple.com - should show "Account" tab
3. If no membership, either:
   - Pay for membership on that account
   - Use different Apple ID that has membership
   - Have someone with membership build the app

---

### Error: "Invalid username and password" (Apple)

**Cause:** Cannot use regular Apple password with command-line tools.

**Solution:**
Create app-specific password:
1. Go to https://appleid.apple.com
2. Sign in with your Apple ID
3. Under "Security" → "App-Specific Passwords"
4. Click "Generate Password"
5. Name it (e.g., "EAS Build")
6. Copy the password (format: xxxx-xxxx-xxxx-xxxx)
7. Use this password when EAS asks for Apple password

---

### Error: Build succeeds but doesn't appear in TestFlight

**Cause:** EAS built the app but didn't submit it to App Store Connect. Building and submitting are separate steps.

**Solution:**
After build succeeds, run:
```bash
eas submit --platform ios
```

Select "Select a build from EAS" and choose the latest build.

---

## Expo / EAS Errors

### Error: "Entity not authorized" (Expo)

**Full Error:**
```
You don't have the required permissions to perform this operation.
Entity not authorized: AppEntity[411874fc-21c1-41e1-8cd3-ef06b4db6a2b]
```

**Cause:** Logged into wrong Expo account. The EAS project belongs to a different account.

**Solution:**
1. Logout: `eas logout`
2. Login with correct account: `eas login`
3. Enter credentials for the Expo account that owns the project
4. Retry build

---

### Error: "Input is required, but stdin is not readable"

**Full Error:**
```
Input is required, but stdin is not readable.
Failed to display prompt: Do you want to log in to your Apple account?
```

**Cause:** Running `eas build` in background mode where it can't prompt for input.

**Solution:**
Run in foreground (normal terminal, not background):
```bash
eas build --platform ios --profile production
```

Don't use `&` at the end or run via background task runners.

---

## Dependency Errors

### Warning: Package version mismatch

**Example:**
```
package                         expected  found
@react-native-community/slider  5.0.1     4.5.7
```

**Cause:** Package version doesn't match Expo SDK requirements.

**Solution:**
Update packages to match Expo SDK:
```bash
npx expo install --check
npx expo install --fix
```

Or manually:
```bash
npx expo install @react-native-community/slider
```

---

### Error: deprecated package warnings

**Example:**
```
deprecated inflight@1.0.6: This module is not supported, and leaks memory
deprecated glob@6.0.4: Glob versions prior to v9 are no longer supported
```

**Cause:** Dependencies use old packages. These are warnings, not errors.

**Impact:** Usually safe to ignore unless causing actual errors.

**Solution (if concerned):**
```bash
npm audit
npm audit fix
```

Or update to latest Expo SDK which may include newer dependencies.

---

## Git Errors

### Error: "fatal: could not read Password"

**Cause:** Git needs authentication for private repository.

**Solution:**
Create GitHub Personal Access Token:
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (full control of private repositories)
4. Generate token and copy it
5. When git asks for password, paste the token (not your GitHub password)

---

### Error: "Your branch is behind 'origin/main'"

**Cause:** Remote repository has newer commits.

**Solution:**
```bash
git pull
```

If you have local changes:
```bash
git stash        # Save local changes temporarily
git pull         # Get remote changes
git stash pop    # Restore local changes
```

---

## App Store Connect Issues

### Issue: Build not appearing after 30+ minutes

**Troubleshooting steps:**

1. **Check Expo build page:**
   - Go to build URL
   - Verify status is "Finished" not "In Progress"

2. **Verify submission happened:**
   - If no "Submit to App Store" button was clicked
   - Run: `eas submit --platform ios`

3. **Check correct Apple account:**
   - Verify you're logged into App Store Connect with the right Apple ID
   - The one used during `eas build`

4. **Check email:**
   - Apple sends emails about build processing issues
   - Check spam folder

5. **Check build status in Xcode:**
   - Download Xcode (if on Mac)
   - Open Xcode → Window → Organizer
   - May show more details about build processing

---

### Issue: IAP not available in TestFlight

**Cause:** In-App Purchases need separate approval.

**Solution:**
1. Configure IAP in App Store Connect
2. Submit IAP for review (separate from app review)
3. IAP must be approved before it works in production
4. Can test IAP in Sandbox mode before approval

---

## Firebase Errors

### Error: Firebase not initialized

**Cause:** Firebase config missing or incorrect.

**Solution:**
Verify `src/lib/firebase.ts` has correct config:
```typescript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  // ... etc
};
```

Get config from Firebase Console → Project Settings → General → Your apps.

---

### Error: "Permission denied" on Firestore

**Cause:** Firestore security rules blocking access.

**Solution:**
Check Firestore rules in Firebase Console → Firestore Database → Rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Add your rules here
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }
    // ... etc
  }
}
```

---

## Runtime Errors (After Deploy)

### Error: White screen / App crashes on launch

**Common causes:**
1. JavaScript bundle error
2. Missing environment variables
3. Firebase initialization failure
4. Navigation misconfiguration

**Debugging:**
1. Check Xcode Console logs (if available)
2. Add error boundaries to catch errors
3. Test in Expo Go first to see errors
4. Check Firebase Console for crashes

---

### Error: IAP not working in production

**Checklist:**
- [ ] IAP configured in App Store Connect with correct Product ID
- [ ] IAP submitted for review and approved
- [ ] App submitted with IAP capability enabled
- [ ] Bundle ID matches exactly
- [ ] Agreements, Tax, and Banking set up in App Store Connect

**Testing:**
- Use Sandbox tester account (create in App Store Connect)
- Sign out of real App Store account on test device
- Sign in with sandbox tester credentials
- Test purchase flow

---

## Prevention & Best Practices

### Before Building

1. **Clean dependency install:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Run diagnostics:**
   ```bash
   npx expo-doctor
   ```

3. **Check for deprecated packages:**
   ```bash
   npm outdated
   ```

4. **Test locally first:**
   ```bash
   npx expo start
   # Test in Expo Go app
   ```

### During Build

1. **Monitor the build logs** - Don't just run and walk away
2. **Save build URLs** - You'll need them for troubleshooting
3. **Document any errors** - With full error messages

### After Build

1. **Test in TestFlight first** - Before public release
2. **Check all features** - Especially IAP and Firebase integration
3. **Monitor Firebase Console** - For errors after release

---

## Getting Help

### Official Resources
- Expo Forums: https://forums.expo.dev
- Expo Discord: https://chat.expo.dev
- EAS Build Docs: https://docs.expo.dev/build/introduction/

### When Asking for Help

Include:
1. **Full error message** - Not just "it doesn't work"
2. **Build URL** - From Expo dashboard
3. **What you tried** - Steps already taken
4. **System info** - OS version, Node version (`node --version`)
5. **Relevant config** - app.json, package.json (sanitize sensitive data)

### Example Good Help Request

```
I'm getting an error when building iOS app with EAS:

Error: "Unable to resolve module ffmpeg-kit-react-native"

Build URL: https://expo.dev/accounts/.../builds/...

Steps I've tried:
- Removed package from package.json
- Deleted app/gifmaker.tsx
- Ran npm install
- Still getting the error

System:
- macOS Sonoma 14.5
- Node v20.11.0
- EAS CLI 5.8.0

Relevant package.json:
{
  "dependencies": {
    "expo": "~54.0.30",
    "react-native": "0.81.5"
  }
}
```

---

## Emergency Contacts

- **Apple Developer Support:** https://developer.apple.com/contact/
- **Expo Support:** https://expo.dev/support
- **Firebase Support:** https://firebase.google.com/support

---

Last updated: 2026-01-06
