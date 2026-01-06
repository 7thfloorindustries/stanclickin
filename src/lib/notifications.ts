import { addDoc, collection, serverTimestamp } from "firebase/firestore";
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
  } catch (error) {
    console.error("Error creating notification:", error);
    // Don't throw - notifications failing shouldn't break the main action
  }
}
