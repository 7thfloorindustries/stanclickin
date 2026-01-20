import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  increment,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { createNotification } from "./notifications";

export type MessageType = "text" | "image" | "post" | "gif";

export interface SendMessageParams {
  conversationId: string;
  senderId: string;
  recipientId: string;
  text?: string;
  type: MessageType;
  imageUrl?: string;
  postData?: {
    postId: string;
    text: string;
    imageUrl?: string;
    authorUid: string;
    authorUsername: string;
  };
}

/**
 * Generate deterministic conversation ID from two UIDs
 */
function getConversationId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

/**
 * Get or create a conversation between two users
 * Checks for blocks before creating
 */
export async function getOrCreateConversation(
  myUid: string,
  otherUid: string
): Promise<{ conversationId: string; blocked: boolean }> {
  // Check if either user has blocked the other
  const [iBlockedThem, theyBlockedMe] = await Promise.all([
    getDoc(doc(db, "blocks", myUid, "blocked", otherUid)),
    getDoc(doc(db, "blocks", otherUid, "blocked", myUid)),
  ]);

  if (iBlockedThem.exists() || theyBlockedMe.exists()) {
    return { conversationId: "", blocked: true };
  }

  const conversationId = getConversationId(myUid, otherUid);
  const conversationRef = doc(db, "conversations", conversationId);
  const conversationSnap = await getDoc(conversationRef);

  if (!conversationSnap.exists()) {
    // Fetch participant data
    const [myDoc, otherDoc] = await Promise.all([
      getDoc(doc(db, "users", myUid)),
      getDoc(doc(db, "users", otherUid)),
    ]);

    const myData = myDoc.data();
    const otherData = otherDoc.data();

    // Create new conversation
    await setDoc(conversationRef, {
      participants: [myUid, otherUid].sort(),
      participantData: {
        [myUid]: {
          username: myData?.username || "user",
          profilePictureUrl: myData?.profilePictureUrl || null,
        },
        [otherUid]: {
          username: otherData?.username || "user",
          profilePictureUrl: otherData?.profilePictureUrl || null,
        },
      },
      lastMessage: null,
      lastMessageAt: serverTimestamp(),
      unreadCount: {
        [myUid]: 0,
        [otherUid]: 0,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return { conversationId, blocked: false };
}

/**
 * Send a message in a conversation
 * Uses transaction for atomic updates
 */
export async function sendMessage(params: SendMessageParams): Promise<void> {
  const {
    conversationId,
    senderId,
    recipientId,
    text,
    type,
    imageUrl,
    postData,
  } = params;

  // Create message preview for lastMessage
  let messagePreview = text || "";
  if (type === "image") messagePreview = "📷 Image";
  if (type === "gif") messagePreview = "🎞️ GIF";
  if (type === "post")
    messagePreview = `📝 ${postData?.text.substring(0, 50) || "Shared a post"}`;

  try {
    // Create message document (outside transaction - can't use addDoc in transactions)
    const messagesRef = collection(
      db,
      "conversations",
      conversationId,
      "messages"
    );

    const messageData: any = {
      senderId,
      text: text || null,
      type,
      createdAt: serverTimestamp(),
      read: false,
    };

    if (imageUrl) messageData.imageUrl = imageUrl;
    if (postData) messageData.postData = postData;

    const messageRef = await addDoc(messagesRef, messageData);

    // Use transaction to update conversation and user counts
    await runTransaction(db, async (transaction) => {
      const conversationRef = doc(db, "conversations", conversationId);
      const recipientRef = doc(db, "users", recipientId);

      // Update conversation
      transaction.update(conversationRef, {
        lastMessage: {
          text: messagePreview,
          senderId,
          createdAt: serverTimestamp(),
          type,
        },
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        [`unreadCount.${recipientId}`]: increment(1),
      });

      // Update recipient's total unread DM count
      transaction.update(recipientRef, {
        unreadDMCount: increment(1),
      });
    });

    // Send push notification (after transaction completes)
    const senderDoc = await getDoc(doc(db, "users", senderId));
    const senderUsername = senderDoc.data()?.username || "Someone";

    await createNotification({
      recipientUid: recipientId,
      type: "dm_message",
      fromUid: senderId,
      fromUsername: senderUsername,
      text: messagePreview,
      conversationId,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
}

/**
 * Mark messages as read in a conversation
 * Updates all unread messages from the other user
 */
export async function markConversationAsRead(
  conversationId: string,
  myUid: string
): Promise<void> {
  try {
    const conversationRef = doc(db, "conversations", conversationId);

    // Get all unread messages not sent by me
    const messagesRef = collection(
      db,
      "conversations",
      conversationId,
      "messages"
    );
    const unreadQuery = query(
      messagesRef,
      where("read", "==", false),
      where("senderId", "!=", myUid)
    );

    const unreadSnap = await getDocs(unreadQuery);
    const unreadCount = unreadSnap.size;

    if (unreadCount === 0) return;

    // Use batch to mark all as read
    const batch = writeBatch(db);

    unreadSnap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        read: true,
        readAt: serverTimestamp(),
      });
    });

    // Update conversation unread count
    batch.update(conversationRef, {
      [`unreadCount.${myUid}`]: 0,
    });

    // Update user's total unread DM count
    const userRef = doc(db, "users", myUid);
    batch.update(userRef, {
      unreadDMCount: increment(-unreadCount),
    });

    await batch.commit();
  } catch (error) {
    console.error("Error marking conversation as read:", error);
    // Don't throw - marking as read failing shouldn't break the main flow
  }
}

/**
 * Set typing indicator for a user in a conversation
 */
export async function setTypingIndicator(
  conversationId: string,
  uid: string,
  isTyping: boolean
): Promise<void> {
  try {
    const typingRef = doc(db, "conversations", conversationId, "typing", uid);

    await setDoc(typingRef, {
      typing: isTyping,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error setting typing indicator:", error);
    // Don't throw - typing indicator failing shouldn't break messaging
  }
}

/**
 * Delete a conversation for a user (sets unread count to 0)
 * For MVP - just hides from inbox. Can implement proper deletion later.
 */
export async function deleteConversation(
  conversationId: string,
  uid: string
): Promise<void> {
  try {
    await updateDoc(doc(db, "conversations", conversationId), {
      [`unreadCount.${uid}`]: 0,
    });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    throw error;
  }
}
