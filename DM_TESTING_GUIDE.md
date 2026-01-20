# STANCLICKIN Direct Messaging Testing Guide

This document provides comprehensive testing instructions for the new Direct Messaging system.

## Prerequisites

Before testing, ensure:
1. Firebase Storage rules are deployed: `firebase deploy --only storage`
2. Firestore rules are up to date: `firebase deploy --only firestore:rules`
3. You have at least 2 test accounts to message between
4. The app is running: `npx expo start`

## Quick Start Test (2 minutes)

**Goal**: Verify basic messaging works end-to-end

1. Log in as User A
2. Navigate to any user profile (User B)
3. Tap the "💬 Message" button
4. Type "Hello!" and tap Send
5. Log out, then log in as User B
6. Tap "💬 Messages" in bottom nav
7. Verify: Red badge shows "1" unread
8. Tap the conversation
9. Verify: Message from User A appears
10. Reply with "Hi back!"
11. Verify: Double checkmark ✓✓ appears when User A views it

**Expected Result**: Messages appear instantly, read receipts work, unread counts update.

---

## Comprehensive Test Suite

### Test 1: Message Button Integration
**Location**: User Profile (`/u/[uid]`)

- [ ] Message button appears next to Follow button for other users
- [ ] Message button does NOT appear on own profile
- [ ] Message button does NOT appear for blocked users
- [ ] Tapping button creates new conversation (first time)
- [ ] Tapping button opens existing conversation (subsequent times)
- [ ] Loading indicator shows while creating conversation

**Edge Cases**:
- [ ] Try messaging a user who blocked you (should show "Cannot send message")
- [ ] Try messaging yourself (button shouldn't appear)

---

### Test 2: Inbox Screen
**Location**: Messages Tab (`/messages`)

- [ ] Accessible from bottom nav "💬 Messages" button
- [ ] Shows all conversations sorted by most recent
- [ ] Displays other user's avatar (or placeholder)
- [ ] Shows last message preview
- [ ] Shows time since last message (now, 5m, 2h, 3d, 1w)
- [ ] Unread badge appears on conversations with unread messages
- [ ] Unread count badge on bottom nav shows total unread across all conversations
- [ ] Pull to refresh works
- [ ] Tapping conversation navigates to thread
- [ ] Back button returns to stanspace

**Data Scenarios**:
- [ ] Empty state shows "No messages yet"
- [ ] Blocked conversations don't appear in list
- [ ] If last message was an image, preview shows "📷 Image"
- [ ] If last message was a post, preview shows "📝 Shared a post"

---

### Test 3: Conversation Screen - Text Messages
**Location**: Conversation Thread (`/messages/[conversationId]`)

**Basic Functionality**:
- [ ] Header shows other user's avatar and @username
- [ ] Tapping avatar navigates to their profile
- [ ] Messages appear in chronological order (oldest at top)
- [ ] Own messages appear on right (blue bubble)
- [ ] Other user's messages appear on left (gray bubble)
- [ ] Timestamps show for each message
- [ ] Auto-scrolls to bottom when opening
- [ ] Auto-scrolls to bottom after sending
- [ ] Back button returns to inbox

**Sending Messages**:
- [ ] Type text and tap Send
- [ ] Send button disabled when text is empty
- [ ] Send button enabled when text is entered
- [ ] Message appears immediately after sending
- [ ] Text input clears after sending
- [ ] Can send messages up to 500 characters
- [ ] Multiline messages work correctly
- [ ] Keyboard doesn't cover input field (KeyboardAvoidingView)

**Typing Indicators**:
- [ ] "User is typing..." appears when other user types
- [ ] Indicator disappears 3 seconds after they stop typing
- [ ] Indicator auto-expires if not updated for 5 seconds
- [ ] Own typing doesn't show indicator to self

**Read Receipts**:
- [ ] Sent messages show timestamp only
- [ ] When other user opens conversation, sent messages show "✓✓"
- [ ] Read time updates in real-time

---

### Test 4: Image Messaging
**Location**: Conversation Thread

**Sending Images**:
- [ ] Tap 📷 button to open image picker
- [ ] Select image from library
- [ ] Image preview appears above input
- [ ] Preview shows full width (150px height)
- [ ] Tap ✕ button to remove preview
- [ ] Send button enabled when image selected (even without text)
- [ ] Tap Send to upload and send
- [ ] Loading indicator shows while uploading
- [ ] Image appears in message bubble (200x200px)
- [ ] Can send image with text caption
- [ ] Can send image without text

**Image Validation**:
- [ ] Images over 5MB show error: "Image too large. Maximum size is 5MB."
- [ ] Error restores image to preview (doesn't lose it)
- [ ] Permission denied shows: "Please allow access to your photo library"

**Receiving Images**:
- [ ] Received images display at 200x200px
- [ ] Images load progressively
- [ ] Caption text appears below image (if present)
- [ ] Can't interact with images (no full-screen view yet)

---

### Test 5: Post Sharing
**Location**: Conversation Thread

**Sharing Posts**:
- [ ] Tap 📝 button to open post picker modal
- [ ] Modal shows "Share a Post" title
- [ ] Modal displays recent 20 posts from feed
- [ ] Each post shows text preview (3 lines max) and image (if present)
- [ ] Tap post to share it
- [ ] Modal closes automatically
- [ ] Loading indicator shows while sending
- [ ] Shared post appears in message thread

**Shared Post Display**:
- [ ] Shows author @username in gray text
- [ ] Shows post text (up to 3 lines)
- [ ] Shows post image if present (120px height)
- [ ] Post has card-like background with border
- [ ] Tapping shared post navigates to full post view (`/post`)

**Edge Cases**:
- [ ] Empty state shows "No posts to share" if no posts exist
- [ ] Can share posts from any user (not just followed users)
- [ ] Shared post navigates correctly even if original is deleted

---

### Test 6: Blocking Integration
**Location**: Throughout DM system

- [ ] Cannot DM a user who blocked you (DMButton shows error)
- [ ] Cannot DM a user you blocked (DMButton shows error)
- [ ] Existing conversations disappear from inbox when blocked
- [ ] Existing messages become inaccessible when blocked
- [ ] Unblocking restores conversation access
- [ ] Can't send messages in existing conversation after blocking

---

### Test 7: Push Notifications
**Location**: Device notifications

**Setup**:
- User A and User B both logged in on separate devices
- User A sends message to User B while User B's app is backgrounded

**Tests**:
- [ ] Notification appears on User B's device
- [ ] Notification shows: "New Message" title
- [ ] Notification shows: "Username: Message preview"
- [ ] Tapping notification opens app
- [ ] App navigates directly to conversation
- [ ] Conversation loads and scrolls to new message
- [ ] Badge count updates on app icon

**Notification Grouping** (if multiple messages):
- [ ] Multiple messages from same user group together
- [ ] Badge count reflects total unread across all conversations

---

### Test 8: Real-Time Updates
**Location**: Open conversation on 2 devices

**Setup**: User A and User B both have same conversation open

**Tests**:
- [ ] User A sends message → appears instantly for User B
- [ ] User B sends message → appears instantly for User A
- [ ] User A starts typing → "User B is typing..." shows for User A
- [ ] User B stops typing → indicator disappears after 3 seconds
- [ ] User A's messages show ✓✓ immediately when User B views
- [ ] Unread count decrements in real-time when User B opens conversation

---

### Test 9: Unread Count Tracking
**Location**: Throughout app

**User A Perspective**:
- [ ] Inbox shows red badge on conversations with unread
- [ ] Badge shows count (1, 2, 3, etc.)
- [ ] Bottom nav Messages button shows total unread across all conversations
- [ ] Badge shows "99+" for counts over 99
- [ ] Opening conversation clears unread count
- [ ] Badge disappears when all conversations are read
- [ ] App icon badge shows total (notifications + DMs)

**User B Sends 5 Messages**:
- [ ] Inbox badge increments to 5
- [ ] Bottom nav badge increments to 5
- [ ] Opening conversation → badge clears to 0
- [ ] Closing and reopening → badge stays 0

---

### Test 10: Navigation Flow
**Location**: Throughout app

**From Stanspace**:
- [ ] Tap Messages → Opens inbox
- [ ] Tap conversation → Opens thread
- [ ] Back from thread → Returns to inbox
- [ ] Back from inbox → Returns to stanspace

**From Push Notification**:
- [ ] Tap notification → Opens conversation directly
- [ ] Back button → Returns to Messages (not crash)

**From User Profile**:
- [ ] Tap "💬 Message" → Opens conversation
- [ ] Back button → Returns to profile

---

### Test 11: Error Handling
**Location**: Throughout DM system

**Network Errors**:
- [ ] Enable Airplane Mode
- [ ] Try sending message
- [ ] Error alert: "Failed to send message"
- [ ] Message text preserved in input (not lost)
- [ ] Disable Airplane Mode → Can resend

**Image Upload Errors**:
- [ ] Select large image (>5MB)
- [ ] Error alert shows: "Image too large. Maximum size is 5MB."
- [ ] Image preview preserved (not lost)
- [ ] Can remove image and try different one

**Permission Errors**:
- [ ] Deny photo library access
- [ ] Tap 📷 button
- [ ] Error alert: "Please allow access to your photo library"
- [ ] Can tap OK and grant permission in Settings

---

### Test 12: Performance & Edge Cases
**Location**: Throughout DM system

**Stress Tests**:
- [ ] Send 100 messages rapidly (conversation should handle)
- [ ] Open conversation with 100+ messages (scrolls to bottom)
- [ ] Send very long message (500 chars) (wraps correctly)
- [ ] Send empty message (button should be disabled)
- [ ] Send only whitespace "   " (button should be disabled)

**Concurrent Use**:
- [ ] Both users typing at same time (indicators don't conflict)
- [ ] Both users sending images at same time (both appear)
- [ ] Rapid back-and-forth messages (no race conditions)

**Edge Cases**:
- [ ] User deletes account → Conversation shows "Deleted User"
- [ ] User changes username → Conversation header updates
- [ ] User changes profile picture → Avatar updates in inbox

---

### Test 13: Theme Integration
**Location**: All DM screens

- [ ] Messages screens respect user's selected theme
- [ ] Message bubbles use theme colors (own messages = theme.linkColor)
- [ ] Input field uses theme colors
- [ ] Typing indicator uses theme colors
- [ ] Background uses theme background/banner if selected
- [ ] Text readable in all themes (light/dark/cyberpunk/retro)

---

## Security Testing

**Firebase Rules Verification**:
1. Log out completely
2. Try accessing: `firebase.firestore().collection('conversations').doc('abc').get()`
3. **Expected**: Permission denied

**Storage Rules Verification**:
1. Try uploading to: `messages/someone-elses-uid/test.jpg`
2. **Expected**: Permission denied
3. Try uploading to: `messages/your-uid/test.jpg` with 6MB file
4. **Expected**: File too large error

---

## Performance Benchmarks

**Inbox Load Time**: < 2 seconds for 50 conversations
**Message Send**: < 1 second from tap to appear
**Image Upload**: < 5 seconds for 2MB image
**Typing Indicator**: < 500ms delay
**Read Receipt**: < 1 second from view to ✓✓

---

## Known Limitations (Not Bugs)

1. **No message deletion**: Once sent, messages are permanent
2. **No message editing**: Can't edit after sending
3. **No GIF picker**: Only static images supported (GIFs upload as static)
4. **No voice messages**: Text and images only
5. **No group chats**: 1-on-1 conversations only
6. **No reactions**: Can't react to messages with emoji
7. **No full-screen image view**: Images shown inline only
8. **100 message limit**: Only latest 100 messages loaded initially

---

## Regression Testing (After Future Changes)

When making changes to other parts of the app, verify:
- [ ] DMButton still appears on user profiles
- [ ] Messages tab still appears in bottom nav
- [ ] Push notifications still navigate correctly
- [ ] Firestore rules still protect conversations
- [ ] Storage rules still protect message images

---

## Testing Checklist Summary

- [ ] All 13 test sections completed
- [ ] No critical bugs found
- [ ] All edge cases handled gracefully
- [ ] Performance benchmarks met
- [ ] Security rules verified
- [ ] Theme integration working
- [ ] Push notifications delivering

---

## Reporting Issues

When reporting bugs, include:
1. Device (iOS/Android)
2. Steps to reproduce
3. Expected behavior
4. Actual behavior
5. Screenshots/video if applicable
6. Console logs if available

---

**Last Updated**: 2026-01-19
**Version**: v1.0.0 (Initial DM Release)
