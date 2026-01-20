import { addDoc, collection, serverTimestamp, getDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

export type NotificationType = "post_like" | "post_comment" | "follow" | "comment_like" | "post_repost" | "post_mention";

export interface CreateNotificationParams {
  recipientUid: string;
  type: NotificationType;
  fromUid: string;
  fromUsername?: string;
  postId?: string;
  commentId?: string;
  text?: string;
}

/**
 * Create a notification for a user
 * @param params Notification parameters
 */
export async function createNotification(params: CreateNotificationParams) {
  const { recipientUid, type, fromUid, fromUsername, postId, commentId, text } = params;

  // Don't create notifications for your own actions
  if (recipientUid === fromUid) return;

  try {
    await addDoc(collection(db, "notifications", recipientUid, "items"), {
      type,
      fromUid,
      fromUsername: fromUsername || null,
      postId: postId || null,
      commentId: commentId || null,
      text: text || null,
      createdAt: serverTimestamp(),
      read: false,
    });

    // Send push notification
    await sendPushNotification(recipientUid, type, fromUsername || 'Someone', text, postId, commentId);
  } catch (error) {
    console.error("Error creating notification:", error);
    // Don't throw - notifications failing shouldn't break the main action
  }
}

/**
 * Send push notification to device with retry and validation
 */
async function sendPushNotification(
  recipientUid: string,
  type: NotificationType,
  fromUsername: string = 'Someone',
  previewText?: string,
  postId?: string,
  commentId?: string,
  retryCount: number = 0
): Promise<void> {
  try {
    // Get recipient's push token
    const userDoc = await getDoc(doc(db, 'users', recipientUid));
    if (!userDoc.exists()) {
      console.log('[Push] User document not found:', recipientUid);
      return;
    }

    const userData = userDoc.data();
    const pushToken = userData.pushToken;

    // No push token = can't send
    if (!pushToken) {
      console.log('[Push] No push token for user:', recipientUid);
      return;
    }

    // VALIDATION: Verify token format
    const tokenRegex = /^ExponentPushToken\[[a-zA-Z0-9_-]+\]$/;
    if (!tokenRegex.test(pushToken)) {
      console.error('[Push] Invalid token format:', pushToken);
      // Clear invalid token from Firestore
      await updateDoc(doc(db, 'users', recipientUid), { pushToken: null });
      return;
    }

    // Check notification preferences
    const prefs = userData.notificationPreferences || {};
    if (!shouldSendNotification(type, prefs)) {
      console.log('[Push] User has disabled', type, 'notifications');
      return;
    }

    // Build notification message
    const message = getNotificationMessage(type, fromUsername, previewText);

    // Send via Expo Push API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title: message.title,
        body: message.body,
        data: {
          type,
          fromUsername,
          postId: postId || null,
          commentId: commentId || null,
        },
        badge: 1,
        priority: 'high',
        channelId: 'default',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    // Check for Expo-specific errors
    if (result.data && result.data.status === 'error') {
      const errorDetails = result.data.details;

      // Handle specific error cases
      if (errorDetails?.error === 'DeviceNotRegistered') {
        console.log('[Push] Token expired, clearing from Firestore');
        await updateDoc(doc(db, 'users', recipientUid), { pushToken: null });
        return;
      }

      throw new Error(`Expo Push Error: ${errorDetails?.error || 'Unknown'}`);
    }

    console.log('[Push] ✅ Notification sent successfully');

  } catch (error: any) {
    console.error('[Push] ❌ Error sending notification:', error.message);

    // RETRY LOGIC: Retry up to 2 times for network errors
    if (retryCount < 2 && isRetryableError(error)) {
      console.log(`[Push] Retrying... (attempt ${retryCount + 1}/2)`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
      return sendPushNotification(recipientUid, type, fromUsername, previewText, postId, commentId, retryCount + 1);
    }

    // Log error to Firestore for monitoring
    try {
      await addDoc(collection(db, 'push_errors'), {
        recipientUid,
        type,
        error: error.message,
        timestamp: serverTimestamp(),
      });
    } catch (logError) {
      // Silently fail - don't let logging errors break notification flow
    }

    // Don't throw - in-app notification sent to Firestore is enough
  }
}

/**
 * Determine if error is retryable
 */
function isRetryableError(error: any): boolean {
  const retryableErrors = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'Network request failed',
    'Timeout',
    'aborted',
  ];

  return retryableErrors.some(err =>
    error.message?.toLowerCase().includes(err.toLowerCase()) || error.code === err
  );
}

/**
 * Check if user wants this notification type
 */
function shouldSendNotification(
  type: NotificationType,
  prefs: any
): boolean {
  // Default to true if preferences not set
  if (!prefs) return true;

  switch (type) {
    case 'post_like':
    case 'comment_like':
      return prefs.likes !== false;
    case 'post_comment':
      return prefs.comments !== false;
    case 'follow':
      return prefs.follows !== false;
    case 'post_repost':
      return prefs.reposts !== false;
    default:
      return true;
  }
}

/**
 * Get notification title and body for each type
 */
function getNotificationMessage(
  type: NotificationType,
  fromUsername: string,
  previewText?: string
): { title: string; body: string } {
  switch (type) {
    case 'post_like':
      return {
        title: 'New Like',
        body: `${fromUsername} liked your post`,
      };
    case 'post_comment':
      return {
        title: 'New Comment',
        body: previewText ? `${fromUsername}: ${previewText}` : `${fromUsername} commented on your post`,
      };
    case 'comment_like':
      return {
        title: 'New Like',
        body: `${fromUsername} liked your comment`,
      };
    case 'follow':
      return {
        title: 'New Follower',
        body: `${fromUsername} started following you`,
      };
    case 'post_repost':
      return {
        title: 'New Repost',
        body: `${fromUsername} reposted your post`,
      };
    default:
      return {
        title: 'STANCLICKIN',
        body: `${fromUsername} interacted with your content`,
      };
  }
}
