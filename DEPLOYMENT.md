# DEPLOYMENT GUIDE

Complete guide for building and submitting STANCLICKIN to the Apple App Store.

## Prerequisites

- Apple Developer Account (paid, $99/year)
- EAS CLI installed: `npm install -g eas-cli`
- Logged into EAS: `eas login`
- Access to App Store Connect
- Xcode installed (for partner building on Mac)

## Build Process

### Step 1: Prepare Code

```bash
# Pull latest code
git pull

# Install dependencies
npm install

# Verify version in app.json
# Check that version number is correct for this release
```

### Step 2: Build and Auto-Submit

**Single command that builds AND submits to App Store Connect:**

```bash
eas build --platform ios --profile production --auto-submit
```

**What this does:**
1. Builds the iOS app using EAS Build service
2. Increments build number automatically (`autoIncrement: true` in eas.json)
3. Uploads build to App Store Connect when complete
4. Takes ~20-40 minutes total

**Monitor build:**
- Check status: https://expo.dev/accounts/7thfloorindustries/projects/stanclickin/builds
- Wait for "Build finished" status
- Wait additional time for upload to App Store Connect

### Step 3: Verify Upload

1. Go to App Store Connect: https://appstoreconnect.apple.com
2. Navigate to STANCLICKIN app
3. Go to TestFlight section
4. Verify new build number appears
5. Wait for "Ready to Submit" status (~5-10 minutes for processing)

## App Store Submission

### Step 1: Select Build

1. In App Store Connect, go to your app
2. Click on the version you're submitting (e.g., 1.0.1)
3. Scroll to "Build" section
4. Click "Select a build from TestFlight"
5. Choose the latest build number

### Step 2: Configure In-App Purchases

**For versions WITH IAP:**
1. Go to "In-App Purchases and Subscriptions"
2. Click "Add" or select existing IAP
3. Link the IAP product to this version

**For versions WITHOUT IAP (like 1.0.1):**
1. Make sure NO IAP products are linked
2. Delete any existing IAP products if this version has no IAP code

### Step 3: Add App Review Information

**Test Account (Required):**
```
Email: appreviewer@test.com
Password: StanReview2026!
```

**App Review Notes Template:**

```
IMPORTANT INFORMATION FOR APP REVIEW:

CONTENT MODERATION (Guideline 1.2):

1. Terms of Service:
   - Users must accept ToS on signup
   - Zero tolerance policy for objectionable content

2. Automated Content Filtering:
   - All posts and comments filtered before creation
   - Blocks violence, slurs, illegal content

3. User Reporting:
   - Report posts: Tap ⋯ menu → "Report" (Spam/Harassment/Inappropriate)
   - Report comments: Long-press comment → "Report"
   - Block users from profile pages

4. In-App Admin Moderation Panel:
   - Access: Settings → Tap "Admin" → "Open Admin Panel"
   - Review all pending reports in real-time
   - Delete objectionable content or dismiss false reports
   - Contact: moderation@7thfloor.digital

STANHUB VIDEO RIGHTS (Guideline 5.2.3):
- All music videos created and owned by Stanclickin (the artist)
- This is Stanclickin's official app for distributing original music
- YouTube: https://www.youtube.com/@stanclickin
- Spotify: https://open.spotify.com/artist/4HYh1sZodt2swP123khrp9
- Screenshots showing ownership attached

TEST ACCOUNT:
- Email: appreviewer@test.com
- Password: StanReview2026!
- This account has admin access to test moderation tools

APP OVERVIEW:
STANCLICKIN is a creator-owned social network for fans of Stanclickin (music artist/content creator):

1. STANSPACE - Social feed for fan posts and photos
2. STANHUB - Exclusive music videos not available elsewhere
3. FLAPPYCLICKIN - Flappy Bird-style mini-game

[ADD THIS IF NO IAP IN VERSION:]
IMPORTANT NOTE:
In-app purchases have been temporarily removed from this version and will be added in a future update.

Thank you for reviewing STANCLICKIN!
```

### Step 4: Attach Screenshots (for Video Rights)

1. In App Review Information section
2. Scroll to "Attachments"
3. Upload screenshots showing:
   - Stanclickin YouTube channel ownership
   - Stanclickin Spotify artist account
   - Any other proof of content ownership

**Link to screenshots:**
https://drive.google.com/drive/folders/1mtWBdzlPfcGmLrsakg5BbqTqq1T4ocdv?usp=sharing

### Step 5: Submit for Review

1. Review all information
2. Click "Add for Review" (if not already added)
3. Click "Submit for Review"
4. Confirm submission

**Expected review time:** 1-3 days

## Post-Submission Checklist

- [ ] Build uploaded to App Store Connect
- [ ] Correct build number selected
- [ ] IAP configured correctly (linked or deleted depending on version)
- [ ] Test account credentials added
- [ ] App Review Notes filled out
- [ ] Screenshots attached (for video rights)
- [ ] Submitted for review
- [ ] Confirmation email received from Apple

## Version Management

### Version Numbering
- **Version**: User-facing (e.g., 1.0.1) - Change in `app.json`
- **Build**: Auto-incremented by EAS (e.g., 16, 17, 18)

### When to Increment Version
- New features
- Bug fixes
- Any code changes submitted to App Store

### When Build Auto-Increments
- Every EAS build automatically gets new build number
- No manual management needed

## Common Issues

### Build fails
- Check EAS build logs at expo.dev
- Verify `eas.json` configuration is correct
- Make sure all dependencies in `package.json` are compatible

### Upload to App Store Connect fails
- Verify Apple Developer account is active
- Check that account has proper permissions
- Try manual submit: `eas submit --platform ios --latest`

### Build doesn't appear in App Store Connect
- Wait 10-15 minutes after build completes
- Check TestFlight processing status
- Verify bundle ID matches App Store Connect app

### App rejected after submission
- Read rejection email carefully for specific guidelines violated
- See `TROUBLESHOOTING.md` for common rejection reasons
- Fix issues and resubmit (doesn't require new version number)

## Emergency: Cancel Submission

If you need to cancel a submission in review:

1. Go to App Store Connect
2. Navigate to your app version
3. Click "Remove from Review" (top right)
4. Fix issues
5. Resubmit when ready

## Next Steps After Approval

1. Check email for approval notification
2. App automatically goes live (unless you set manual release)
3. Monitor for crash reports in App Store Connect
4. Watch user feedback and ratings
5. Plan next version based on feedback

## Contact

- Support: support@7thfloor.digital
- Moderation: moderation@7thfloor.digital
- Developer: [Your contact info]
