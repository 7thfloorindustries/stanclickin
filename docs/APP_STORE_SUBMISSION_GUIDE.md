# App Store Submission Guide for STANCLICKIN

## Age Rating Setup in App Store Connect

When you submit your app to App Store Connect, you'll need to complete the Age Rating questionnaire. Here's exactly how to answer for STANCLICKIN:

### Age Rating Questionnaire Answers:

**Cartoon or Fantasy Violence:** No
**Realistic Violence:** No
**Sexual Content or Nudity:** No
**Profanity or Crude Humor:** No
**Alcohol, Tobacco, or Drug Use or References:** No
**Mature/Suggestive Themes:** No
**Horror/Fear Themes:** No
**Medical/Treatment Information:** No
**Gambling and Contests:** No
**Simulated Gambling:** No *(FLAPPYCLICKIN is skill-based, not gambling)*

**Unrestricted Web Access:** No
**User Generated Content:** **YES** ⚠️ *This is critical - STANCLICKIN is a social network*

**Based on these answers, your app will be rated:**
- **13+** (Infrequent/Mild User Generated Content)

---

## Privacy & Data Information

### Data Types to Declare:

1. **Contact Info**
   - Email Address (for account creation)
   - Name or User ID (username)

2. **User Content**
   - Photos or Videos (user-uploaded images/GIFs)
   - Other User Content (posts, comments)

3. **Identifiers**
   - User ID (Firebase UID)

4. **Usage Data**
   - Product Interaction (likes, comments, follows)

### Third-Party SDKs to Disclose:
- Firebase (Authentication, Firestore, Storage)
- Expo SDK
- FFmpeg Kit (for GIF creation)
- React Native IAP (for in-app purchases)

### Privacy Policy URL:
```
https://7thfloorindustries.github.io/stanclickin-legal/privacy.html
```

### Support URL:
```
https://7thfloorindustries.github.io/stanclickin-legal/
```

### Contact Emails:
- Support: support@7thfloor.digital
- Privacy: privacy@7thfloor.digital

---

## App Review Notes

**Important:** Add these notes in the "App Review Information" section to help reviewers:

```
STANCLICKIN is a social networking app for fans of music artist Stanclickin.

KEY FEATURES:
- STANSPACE: Social network with posts, likes, comments, following/trending feeds
- STANHUB: Exclusive music video hosting
- FLAPPYCLICKIN: Skill-based game with $0.99 IAP for extra lives
- GIF MAKER: Video-to-GIF conversion with STANCLICKIN watermark

MODERATION:
- Content filtering blocks extreme violence, illegal content, and hate speech
- Users can report posts for spam, harassment, or inappropriate content
- Users can block other users
- Admin moderation panel for reviewing reports and removing content
- Contact: moderation@7thfloor.digital

DEMO ACCOUNT (if needed):
Email: [Create a test account and provide credentials]
Password: [Provide password]

Note: GIF Maker and IAP require development/production build (not Expo Go).
```

---

## Screenshots Requirements

You'll need screenshots for different device sizes:

### iPhone Screenshots (Required)
- **6.7" Display** (iPhone 15 Pro Max, 14 Pro Max, etc.)
- **6.5" Display** (iPhone 11 Pro Max, XS Max, etc.)
- **5.5" Display** (iPhone 8 Plus, 7 Plus, etc.)

### iPad Screenshots (If supporting iPad)
- **12.9" Display** (iPad Pro 12.9")
- **11" Display** (iPad Pro 11")

### Screenshot Content Suggestions:
1. **STANSPACE feed** - Show posts with likes/comments
2. **STANHUB** - Video player with music videos
3. **FLAPPYCLICKIN** - Gameplay with leaderboard
4. **GIF MAKER** - Video trimming UI
5. **Profile page** - User profile with theme

---

## In-App Purchases Setup

### Product to Configure:

**Product ID:** `com.stanclickin.app.extralife`
**Reference Name:** Extra Life
**Type:** Consumable
**Price:** $0.99 USD (Tier 1)
**Description:** "Purchase an extra life for FLAPPYCLICKIN game with 3 seconds of invincibility."

**Localization:**
- Display Name: "Extra Life"
- Description: "Get an extra life with 3 seconds of invincibility in FLAPPYCLICKIN!"

---

## Pre-Submission Checklist

Before clicking "Submit for Review":

- [ ] Age rating set to **13+** (User Generated Content)
- [ ] Privacy Policy URL entered
- [ ] Support URL entered
- [ ] Contact email entered (support@7thfloor.digital)
- [ ] App Review Notes added (see above)
- [ ] Screenshots uploaded for all required device sizes
- [ ] App icon uploaded (1024x1024px)
- [ ] In-App Purchase configured (`extralife`)
- [ ] Demo account credentials provided (if needed)
- [ ] Export compliance: "No" for encryption (already set in app.json)

---

## Expected Review Time

- **First submission:** 1-3 days typically
- **Resubmissions:** 24-48 hours

**If rejected:** Don't panic. Use App Store Connect to communicate with the review team and address their concerns.

---

## Post-Approval

Once approved:
1. App will appear on App Store within 24 hours
2. Monitor reviews and respond to user feedback
3. Check Firebase Console for any issues
4. Monitor IAP transactions
5. Check admin panel for user reports

**Good luck! 🚀**
