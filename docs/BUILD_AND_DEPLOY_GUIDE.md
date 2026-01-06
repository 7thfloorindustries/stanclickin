# STANCLICKIN Build & Deploy Guide

Complete guide for building and deploying the iOS app to the App Store.

## Prerequisites

- Paid Apple Developer Account ($99/year)
- Expo account (free)
- GitHub repository with code
- Terminal access on macOS

---

## Part 1: Initial Setup (One-Time)

### 1. Install Required Tools

```bash
# Install Node.js (if not installed)
# Download from https://nodejs.org (LTS version)

# Install EAS CLI
sudo npm install -g eas-cli

# Verify installation
eas --version
```

### 2. Clone the Repository

```bash
cd ~/Desktop
git clone https://github.com/7thfloorindustries/stanclickin.git
cd stanclickin
npm install
```

### 3. Login to Expo

```bash
eas login
```
Enter your Expo credentials (the account that owns the project).

---

## Part 2: Building the iOS App

### Step 1: Ensure Clean State

```bash
# Pull latest code
git pull

# Clean install dependencies
rm -rf node_modules package-lock.json
npm install

# Run health check (optional)
npx expo-doctor
```

### Step 2: Build for iOS

```bash
eas build --platform ios --profile production
```

**What happens:**
1. EAS asks to log in to Apple Developer account
2. Enter Apple ID and app-specific password
3. EAS generates certificates and provisioning profiles
4. Code is uploaded to EAS servers
5. Build runs (takes 15-20 minutes)
6. Build completes with download URL

**IMPORTANT:** This only BUILDS the app. It does NOT submit to App Store Connect.

### Step 3: Submit to App Store Connect

After the build succeeds, run:

```bash
eas submit --platform ios
```

**What happens:**
1. Select "Select a build from EAS"
2. Choose the build you just created (latest build number)
3. EAS uploads to App Store Connect
4. Wait 5-10 minutes for it to appear in TestFlight

---

## Part 3: App Store Connect Setup

### Wait for Build to Process

1. Go to https://appstoreconnect.apple.com
2. Log in with Apple Developer account
3. Go to **My Apps** → **STANCLICKIN** → **TestFlight** tab
4. Wait for build to appear (5-10 minutes)
5. Build status will change from "Processing" → "Ready to Submit"

### Test the Build (Recommended)

1. Install **TestFlight** app on your iPhone (from App Store)
2. In App Store Connect → TestFlight → Add yourself as internal tester
3. Open TestFlight app → Install STANCLICKIN
4. Test all features:
   - Login/signup
   - STANSPACE (posts, likes, comments, follows)
   - STANHUB (video playback)
   - FLAPPYCLICKIN (gameplay, leaderboard, IAP button)
   - Settings (theme, logout)

### Take Screenshots (Required)

You need screenshots for App Store listing:

**Recommended approach:**
1. Install app via TestFlight on iPhone
2. Take screenshots of:
   - Home screen
   - STANSPACE feed with posts
   - STANHUB video player
   - FLAPPYCLICKIN gameplay
   - User profile

**Required sizes:**
- 6.7" Display (iPhone 15 Pro Max) - most important
- Can reuse for other sizes initially

### Configure In-App Purchase

1. In App Store Connect → STANCLICKIN → **Features** → **In-App Purchases**
2. Click **+** to create new IAP
3. Fill out:
   - **Type:** Consumable
   - **Product ID:** `com.stanclickin.app.extralife`
   - **Reference Name:** Extra Life
   - **Price:** $0.99 (Tier 1)
   - **Display Name:** Extra Life
   - **Description:** Get an extra life with 3 seconds of invincibility in FLAPPYCLICKIN!
4. Submit IAP for review (must be approved before app can go live)

### Fill Out App Store Information

Go to **App Store** tab in App Store Connect:

#### App Information
- **Name:** STANCLICKIN
- **Subtitle:** Official Fan Community App
- **Privacy Policy URL:** https://7thfloorindustries.github.io/stanclickin-legal/privacy.html
- **Support URL:** https://7thfloorindustries.github.io/stanclickin-legal/
- **Category:** Social Networking (Primary)

#### Pricing & Availability
- **Price:** Free
- **Availability:** All countries

#### App Privacy
Declare these data types:
1. **Contact Info:** Email Address, Name/User ID
2. **User Content:** Photos/Videos, Other User Content
3. **Identifiers:** User ID
4. **Usage Data:** Product Interaction

#### Age Rating
Answer questionnaire (see `APP_STORE_SUBMISSION_GUIDE.md` for exact answers):
- All "No" except **User Generated Content:** YES
- Result: **13+**

#### App Review Information
- **Contact Email:** support@7thfloor.digital
- **Phone Number:** [Your phone number]
- **Demo Account:** Create test account and provide credentials
- **Notes:** See `APP_STORE_SUBMISSION_GUIDE.md` for template

#### Version Information
- **Version Number:** 1.0.0
- **Build:** Select the build from TestFlight
- **What's New in This Version:** "Initial release of STANCLICKIN"
- **Promotional Text:** [Optional]
- **Description:** [Write compelling app description]
- **Keywords:** stanclickin,music,social,community,fan,videos
- **Screenshots:** Upload screenshots taken earlier
- **App Previews:** [Optional video previews]

### Submit for Review

1. Review all information
2. Check the pre-submission checklist in `APP_STORE_SUBMISSION_GUIDE.md`
3. Click **"Submit for Review"**

---

## Part 4: After Submission

### Review Process
- **Timeline:** 1-3 days typically
- **You'll receive emails:** Status updates from Apple
- **Possible outcomes:**
  - **Approved:** App goes live automatically (or you can schedule release)
  - **Rejected:** Apple explains why, you fix issues and resubmit

### If Rejected
1. Read Apple's feedback carefully
2. Fix the issues in your code
3. Create new build: `eas build --platform ios --profile production`
4. Submit new build: `eas submit --platform ios`
5. Update version info in App Store Connect
6. Resubmit for review

### When Approved
- App appears on App Store within 24 hours
- Monitor Firebase Console for activity
- Check IAP transactions
- Respond to user reviews

---

## Common Issues & Solutions

### Issue: "ffmpeg-kit-react-native" build error
**Solution:** Package is deprecated. Remove it:
```bash
# Remove from package.json
# Delete app/gifmaker.tsx
git add -A
git commit -m "Remove GIF maker temporarily"
git push
```

### Issue: "Reanimated requires New Architecture"
**Solution:** Enable new architecture in `app.json`:
```json
{
  "expo": {
    "newArchEnabled": true
  }
}
```

### Issue: Build succeeds but doesn't appear in TestFlight
**Cause:** Build succeeded but wasn't submitted to App Store Connect.
**Solution:** Run `eas submit --platform ios` after building.

### Issue: "You are not registered as an Apple Developer"
**Cause:** Wrong Apple ID or account doesn't have paid developer membership.
**Solution:** Use the Apple ID with the paid developer account ($99/year).

### Issue: Permission errors during `npm install`
**Solution:** Use sudo for global packages:
```bash
sudo npm install -g eas-cli
```
For local packages, fix ownership:
```bash
sudo chown -R $(whoami) ~/.npm
```

### Issue: Expo version mismatch warnings
**Solution:** Update packages to match Expo SDK:
```bash
npx expo install --check
npx expo install --fix
```

---

## Build Profile Configuration

The project uses these EAS build settings (defined in `eas.json` if it exists, or defaults):

### Production Profile
- **Platform:** iOS
- **Environment:** Production
- **Auto-increment build number:** Yes
- **Bundle identifier:** com.stanclickin.app
- **Provisioning:** Automatic (managed by EAS)

---

## Versioning

### Build Numbers
- Auto-incremented by EAS on each build
- Current: Check `app.json` or App Store Connect

### Version Numbers
- Manually set in `app.json`:
```json
{
  "expo": {
    "version": "1.0.0"
  }
}
```
- Follow semantic versioning: MAJOR.MINOR.PATCH

### When to Increment Version
- **Patch (1.0.0 → 1.0.1):** Bug fixes only
- **Minor (1.0.0 → 1.1.0):** New features, backward compatible
- **Major (1.0.0 → 2.0.0):** Breaking changes

---

## Deployment Checklist

Before submitting to App Store:

- [ ] All features tested locally
- [ ] Code committed and pushed to GitHub
- [ ] `npm install` completes without errors
- [ ] `npx expo-doctor` shows no critical issues
- [ ] Build succeeds: `eas build --platform ios --profile production`
- [ ] Build submitted: `eas submit --platform ios`
- [ ] Build appears in TestFlight
- [ ] App tested via TestFlight on real device
- [ ] Screenshots taken for App Store
- [ ] In-App Purchase configured
- [ ] All App Store Connect fields filled out
- [ ] Privacy Policy and Support URLs working
- [ ] Age rating set to 13+
- [ ] App Review notes added
- [ ] Demo account credentials provided

---

## Emergency Rollback

If you need to roll back to a previous version:

1. In App Store Connect → **App Store** tab
2. Click **"+ Version or Platform"**
3. Create new version with previous version number + 0.0.1
4. Select previous working build from TestFlight
5. Submit for expedited review (explain it's a critical bug fix)

---

## Lessons Learned

### What We Got Wrong Initially

1. **Didn't test build before submission prep**
   - Solution: Always run `eas build` early to catch issues

2. **Assumed build auto-submits to App Store**
   - Solution: Know that `eas build` and `eas submit` are separate steps

3. **Didn't check for deprecated packages**
   - Solution: Run `npx expo-doctor` and fix warnings before building

4. **Focused on code review, not build validation**
   - Solution: Code sweeps should include dependency and build checks

### Best Practices

1. **Test the build pipeline early** - Don't wait until the end
2. **Run builds from a clean state** - Fresh git clone, clean npm install
3. **Document Apple Developer account details** - Which email, where credentials are stored
4. **Keep dependencies up to date** - Use `npx expo install --check` regularly
5. **Test on real devices** - Use TestFlight before public release

---

## Useful Commands

```bash
# Check project health
npx expo-doctor

# Update dependencies to match Expo SDK
npx expo install --check
npx expo install --fix

# Build iOS app
eas build --platform ios --profile production

# Submit to App Store Connect
eas submit --platform ios

# View build history
eas build:list

# View credentials
eas credentials

# Login/logout
eas login
eas logout
eas whoami
```

---

## Support Resources

- **Expo Docs:** https://docs.expo.dev
- **EAS Build Docs:** https://docs.expo.dev/build/introduction/
- **App Store Connect:** https://appstoreconnect.apple.com
- **Apple Developer:** https://developer.apple.com
- **TestFlight:** https://developer.apple.com/testflight/

---

## Contact

- **Developer Support:** support@7thfloor.digital
- **Privacy Questions:** privacy@7thfloor.digital
- **Moderation Issues:** moderation@7thfloor.digital
