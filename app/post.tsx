import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  ActionSheetIOS,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Keyboard,
  KeyboardAvoidingView,
  Image as RNImage,
  Modal,
  Animated,
  RefreshControl,
} from "react-native";
import { KeyboardAwareFlatList } from "react-native-keyboard-aware-scroll-view";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  increment,
  getDoc,
  deleteDoc,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "../src/lib/firebase";
import { Avatar } from "../components/Avatar";
import { createNotification } from "../src/lib/notifications";
import { type ThemeId, getTheme } from "../src/lib/themes";

type Comment = {
  id: string;
  uid: string;
  text: string;
  createdAt?: any;

  // threading
  parentId?: string | null;          // thread root id
  replyToUid?: string | null;
  replyToUsername?: string | null;
  replyToCommentId?: string | null;  // exact comment replied to

  // likes
  likeCount?: number;
};

type RenderItem =
  | { kind: "comment"; comment: Comment; isReply: boolean }
  | { kind: "toggle"; parentId: string; count: number; expanded: boolean };

type SortMode = "newest" | "top";

function formatRelativeTime(ts: any) {
  try {
    if (!ts) return "";
    const d: Date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return "now";
    const sec = Math.floor(diffMs / 1000);
    if (sec < 15) return "now";
    const min = Math.floor(sec / 60);
    if (min < 1) return "now";
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d`;
    const wk = Math.floor(day / 7);
    if (wk < 4) return `${wk}w`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}mo`;
    const yr = Math.floor(day / 365);
    return `${yr}y`;
  } catch {
    return "";
  }
}

function useUsernameCache() {
  const cache = useRef<Record<string, string>>({});
  const getUsername = async (uid: string) => {
    if (cache.current[uid]) return cache.current[uid];
    const snap = await getDoc(doc(db, "users", uid));
    const name = (snap.exists() ? (snap.data() as any)?.username : null) || "user";
    cache.current[uid] = name;
    return name;
  };
  return { getUsername };
}

function ToggleRow({
  parentId,
  count,
  expanded,
  onToggle,
}: {
  parentId: string;
  count: number;
  expanded: boolean;
  onToggle: (parentId: string) => void;
}) {
  return (
    <Pressable onPress={() => onToggle(parentId)} style={styles.toggleRow}>
      <Text style={styles.toggleText}>{expanded ? "Hide replies" : `View replies (${count})`}</Text>
    </Pressable>
  );
}

const CommentRow = React.memo(function CommentRow({
  postId,
  item,
  isReply,
  onLongPress,
  onReplyPress,
  onToggleLike,
  getUsername,
  hasTheme,
}: {
  postId: string;
  item: Comment;
  isReply: boolean;
  onLongPress: (c: Comment) => void;
  onReplyPress: (c: Comment) => void;
  onToggleLike: (commentId: string) => void;
  getUsername: (uid: string) => Promise<string>;
  hasTheme?: boolean;
}) {
  const me = auth.currentUser?.uid;
  const [handle, setHandle] = useState<string>("…");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(item.likeCount ?? 0);

  // Animation values
  const likeScale = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  // Sync like count when prop updates
  useEffect(() => {
    setLikeCount(item.likeCount ?? 0);
  }, [item.likeCount]);

  const animateButton = (scale: Animated.Value) => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.15,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleLike = () => {
    // Optimistic updates - toggle immediately
    const isCurrentlyLiked = liked;
    setLiked(!isCurrentlyLiked);
    setLikeCount((prev) => (isCurrentlyLiked ? prev - 1 : prev + 1));

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    animateButton(likeScale);
    onToggleLike(item.id);
  };

  useEffect(() => {
    let mounted = true;
    getUsername(item.uid).then((u) => mounted && setHandle(`@${u}`));
    return () => {
      mounted = false;
    };
  }, [item.uid]);

  useEffect(() => {
    if (!me) return;
    const likeRef = doc(db, "posts", postId, "comments", item.id, "likes", me);
    return onSnapshot(likeRef, (snap) => setLiked(snap.exists()));
  }, [me, postId, item.id]);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <Pressable onLongPress={() => onLongPress(item)} delayLongPress={250}>
        <View style={[styles.comment, isReply && styles.replyComment, liked && styles.likedComment]}>
          <View style={styles.commentTopRow}>
            <Pressable onPress={() => router.push(`/u/${item.uid}`)}>
              <Text style={[styles.handle, hasTheme && styles.handleWithBanner]}>{handle}</Text>
            </Pressable>
            <Text style={[styles.time, hasTheme && styles.timeWithBanner]}>{formatRelativeTime(item.createdAt)}</Text>
          </View>

          {isReply && item.replyToUsername ? (
            <Text style={[styles.replyTo, hasTheme && styles.replyToWithBanner]}>Replying to @{item.replyToUsername}</Text>
          ) : null}

          <Text style={[styles.commentText, hasTheme && styles.commentTextWithBanner]}>{item.text}</Text>

          <View style={styles.actionsRow}>
            <Pressable style={styles.commentActionBtn} onPress={() => onReplyPress(item)}>
              <Text style={styles.commentActionIcon}>💬</Text>
              <Text style={styles.commentActionText}>Reply</Text>
            </Pressable>

            <Pressable style={styles.commentActionBtn} onPress={handleLike}>
              <Animated.View style={[styles.commentLikeContent, { transform: [{ scale: likeScale }] }]}>
                <Text style={[styles.commentActionIcon, liked && styles.commentActionIconLiked]}>
                  {liked ? "♥" : "♡"}
                </Text>
                {likeCount > 0 ? (
                  <Text style={styles.commentLikeCount}>{likeCount}</Text>
                ) : null}
              </Animated.View>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

export default function PostScreen() {
  const navigation = useNavigation<any>();
  const me = auth.currentUser?.uid;
  const { postId, text, imageUrl } = useLocalSearchParams<{ postId: string; text?: string; imageUrl?: string }>();
  const pid = postId as string;

  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [postData, setPostData] = useState<{ text: string; imageUrl?: string; uid?: string; createdAt?: any }>({ text: text || "" });
  const [author, setAuthor] = useState<{ username: string; profilePictureUrl?: string | null }>({ username: "..." });
  const [userTheme, setUserTheme] = useState<ThemeId | null>(null);

  const theme = getTheme(userTheme);

  const [comments, setComments] = useState<Comment[]>([]);
  const [optimisticComments, setOptimisticComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");

  const [replyTarget, setReplyTarget] = useState<null | { threadId: string; replyToCommentId: string; uid: string; username: string; text: string; profilePictureUrl?: string | null }>(null);

  const [expandedParents, setExpandedParents] = useState<string[]>([]);
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Track last send time for smart keyboard persistence
  const lastSendTime = useRef<number>(0);

  // ✅ Top comments (less jumpy): we freeze parent order while in Top mode
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [topParentOrder, setTopParentOrder] = useState<string[]>([]); // array of parent ids in fixed order

  const listRef = useRef<KeyboardAwareFlatList<RenderItem>>(null);
  const inputRef = useRef<TextInput>(null);

  const didInitialScroll = useRef(false);
  const nearBottomRef = useRef(true);

  const { getUsername } = useUsernameCache();

  // Load user theme
  useEffect(() => {
    if (!me) {
      console.log("POST PAGE: No user logged in");
      return;
    }

    const userRef = doc(db, "users", me);
    return onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const themeId = data?.theme || null;
        console.log("POST PAGE: Loaded theme:", themeId);
        setUserTheme(themeId);
      }
    });
  }, [me]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", (e) => {
      setKeyboardOpen(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardWillHide", () => {
      setKeyboardOpen(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const isExpanded = (parentId: string) => expandedParents.includes(parentId);
  const toggleExpanded = (parentId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedParents((prev) => (prev.includes(parentId) ? prev.filter((x) => x !== parentId) : [...prev, parentId]));
  };

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const paddingToBottom = 80;
    nearBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom;
  };

  const goBack = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else router.replace("/stanspace");
  };

  // Load post data
  useEffect(() => {
    if (!pid) return;
    const fetchPost = async () => {
      const postDoc = await getDoc(doc(db, "posts", pid));
      if (postDoc.exists()) {
        const data = postDoc.data() as any;
        setPostData({
          text: data?.text || text || "",
          imageUrl: data?.imageUrl || imageUrl || undefined,
          uid: data?.uid,
          createdAt: data?.createdAt,
        });

        // Fetch author info
        if (data?.uid) {
          const userDoc = await getDoc(doc(db, "users", data.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as any;
            setAuthor({
              username: userData?.username || "user",
              profilePictureUrl: userData?.profilePictureUrl || null,
            });
          }
        }
      }
    };
    fetchPost();
  }, [pid]);

  // Load comments
  useEffect(() => {
    if (!pid) return;
    const q = query(collection(db, "posts", pid, "comments"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Comment[];
      setComments(rows);

      // Clear optimistic comments when real ones arrive
      setOptimisticComments([]);

      if (!didInitialScroll.current) {
        didInitialScroll.current = true;
        setTimeout(() => scrollToBottom(false), 50);
      } else if (scrollToId) {
        // handled by scrollToId effect
      } else if (nearBottomRef.current) {
        setTimeout(() => scrollToBottom(true), 50);
      }
    });
  }, [pid]);

  // Helpers to compute "Top" order (parents only), but we ONLY apply when user taps Top or Refresh Top.
  const computeTopOrder = (rows: Comment[]) => {
    const byId: Record<string, Comment> = {};
    for (const c of rows) byId[c.id] = c;

    const parents = rows.filter((c) => !c.parentId || !byId[c.parentId]);
    const replies = rows.filter((c) => c.parentId && byId[c.parentId]);

    const replyCountByParent: Record<string, number> = {};
    for (const r of replies) {
      const root = r.parentId!;
      replyCountByParent[root] = (replyCountByParent[root] ?? 0) + 1;
    }

    const scored = parents.map((p) => {
      const likeCount = p.likeCount ?? 0;
      const replyCount = replyCountByParent[p.id] ?? 0;
      const score = likeCount * 2 + replyCount; // simple MVP score
      const createdSec = (p.createdAt?.seconds ?? 0) as number;
      return { id: p.id, score, createdSec };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.createdSec - a.createdSec; // tie-break: newer wins
    });

    return scored.map((s) => s.id);
  };

  const refreshTop = () => {
    setTopParentOrder(computeTopOrder(comments));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Comments auto-update via onSnapshot, just provide visual feedback
    setTimeout(() => setRefreshing(false), 800);
  };

  // When user switches to Top the first time, freeze order immediately.
  useEffect(() => {
    if (sortMode === "top" && topParentOrder.length === 0) {
      setTopParentOrder(computeTopOrder(comments));
    }
  }, [sortMode]);

  // Build render list (parents + optional toggles + replies)
  const renderItems: RenderItem[] = useMemo(() => {
    // Merge optimistic comments with real comments
    const allComments = [...comments, ...optimisticComments];

    const byId: Record<string, Comment> = {};
    for (const c of allComments) byId[c.id] = c;

    // Parents = top-level comments OR replies whose parent is missing
    const parentsRaw = allComments.filter((c) => !c.parentId || !byId[c.parentId]);
    const replies = allComments.filter((c) => c.parentId && byId[c.parentId]);

    const byParent: Record<string, Comment[]> = {};
    for (const r of replies) {
      const root = r.parentId!;
      if (!byParent[root]) byParent[root] = [];
      byParent[root].push(r);
    }

    for (const root of Object.keys(byParent)) {
      byParent[root].sort((a: any, b: any) => (a?.createdAt?.seconds ?? 0) - (b?.createdAt?.seconds ?? 0));
    }

    // Parent ordering:
    let parents: Comment[] = parentsRaw;
    if (sortMode === "top") {
      // Use frozen order; append any new parents not in the list to the end.
      const map: Record<string, Comment> = {};
      parentsRaw.forEach((p) => (map[p.id] = p));

      const ordered: Comment[] = [];
      topParentOrder.forEach((id) => {
        if (map[id]) ordered.push(map[id]);
      });

      const leftovers = parentsRaw.filter((p) => !topParentOrder.includes(p.id));
      parents = ordered.concat(leftovers);
    }

    const flat: RenderItem[] = [];
    for (const p of parents) {
      flat.push({ kind: "comment", comment: p, isReply: false });

      const rs = byParent[p.id] || [];
      if (rs.length > 0) {
        const expanded = expandedParents.includes(p.id);
        flat.push({ kind: "toggle", parentId: p.id, count: rs.length, expanded });
        if (expanded) {
          for (const r of rs) flat.push({ kind: "comment", comment: r, isReply: true });
        }
      }
    }

    return flat;
  }, [comments, optimisticComments, expandedParents.join("|"), sortMode, topParentOrder.join("|")]);

  // Scroll to newly created reply/comment once visible
  useEffect(() => {
    if (!scrollToId) return;
    const idx = renderItems.findIndex((it) => it.kind === "comment" && it.comment.id === scrollToId);
    if (idx < 0) return;
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.6 });
      setScrollToId(null);
    }, 120);
  }, [scrollToId, renderItems.length]);

  const canSend = useMemo(() => draft.trim().length > 0 && draft.length <= 500, [draft]);
  const charCount = draft.length;
  const charLimit = 500;
  const isNearLimit = charCount > 450;

  const send = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");
    if (!pid) return;

    const trimmed = draft.trim();
    if (!trimmed) return;

    const payload: any = {
      uid: user.uid,
      text: trimmed,
      createdAt: serverTimestamp(),

      parentId: null,
      replyToUid: null,
      replyToUsername: null,
      replyToCommentId: null,

      likeCount: 0,
    };

    if (replyTarget) {
      payload.parentId = replyTarget.threadId; // thread root
      payload.replyToUid = replyTarget.uid;
      payload.replyToUsername = replyTarget.username;
      payload.replyToCommentId = replyTarget.replyToCommentId;

      setExpandedParents((prev) => (prev.includes(replyTarget.threadId) ? prev : [...prev, replyTarget.threadId]));
    }

    // Create optimistic comment to show immediately
    const optimisticComment: Comment = {
      id: `optimistic-${Date.now()}`,
      uid: user.uid,
      text: trimmed,
      createdAt: new Date(),
      parentId: payload.parentId,
      replyToUid: payload.replyToUid,
      replyToUsername: payload.replyToUsername,
      replyToCommentId: payload.replyToCommentId,
      likeCount: 0,
    };

    setOptimisticComments((prev) => [...prev, optimisticComment]);

    setDraft("");
    setReplyTarget(null);

    // Smart keyboard persistence: keep keyboard open if user is actively commenting
    const now = Date.now();
    const timeSinceLastSend = now - lastSendTime.current;
    const isActivelyCommenting = timeSinceLastSend < 20000; // Within 20 seconds

    if (!isActivelyCommenting) {
      Keyboard.dismiss();
    } else {
      // Keep keyboard open and refocus input for continued conversation
      setTimeout(() => inputRef.current?.focus(), 100);
    }

    lastSendTime.current = now;

    const ref = await addDoc(collection(db, "posts", pid, "comments"), payload);
    await updateDoc(doc(db, "posts", pid), { commentCount: increment(1), engagementCount: increment(1) });

    // Success haptic
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Create notification for post author
    if (postData.uid && postData.uid !== user.uid) {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const username = userDoc.exists() ? userDoc.data()?.username : "user";

      await createNotification({
        recipientUid: postData.uid,
        type: "post_comment",
        fromUid: user.uid,
        fromUsername: username,
        postId: pid,
        commentId: ref.id,
        text: trimmed.substring(0, 100), // Preview of comment
      });
    }

    // Always scroll to the new comment after a delay to ensure it's rendered
    if (payload.parentId) {
      setScrollToId(ref.id);
    } else {
      setTimeout(() => scrollToBottom(true), 300);
    }
  };

  const startReply = async (c: Comment) => {
    const uname = await getUsername(c.uid);
    const threadId = c.parentId ? c.parentId : c.id;

    // Fetch user profile picture
    const userDoc = await getDoc(doc(db, "users", c.uid));
    const profilePictureUrl = userDoc.exists() ? userDoc.data()?.profilePictureUrl : null;

    setReplyTarget({ threadId, replyToCommentId: c.id, uid: c.uid, username: uname, text: c.text, profilePictureUrl });
    setExpandedParents((prev) => (prev.includes(threadId) ? prev : [...prev, threadId]));

    // Scroll to show the comment being replied to
    setTimeout(() => {
      const idx = renderItems.findIndex((it) => it.kind === "comment" && it.comment.id === c.id);
      if (idx >= 0) {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
      }
      inputRef.current?.focus();
    }, 100);
  };

  const deleteComment = async (c: Comment) => {
    if (!pid) return;
    await deleteDoc(doc(db, "posts", pid, "comments", c.id));
    await updateDoc(doc(db, "posts", pid), { commentCount: increment(-1), engagementCount: increment(-1) });
  };

  const toggleCommentLike = async (commentId: string) => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");
    if (!pid) return;

    const commentRef = doc(db, "posts", pid, "comments", commentId);
    const likeRef = doc(db, "posts", pid, "comments", commentId, "likes", user.uid);

    let wasLiked = false;
    let commentAuthorUid: string | null = null;

    await runTransaction(db, async (tx) => {
      const likeSnap = await tx.get(likeRef);
      const commentSnap = await tx.get(commentRef);
      const data = commentSnap.data() as any;

      commentAuthorUid = data?.uid || null;
      const current = data?.likeCount ?? 0;

      if (likeSnap.exists()) {
        tx.delete(likeRef);
        tx.update(commentRef, { likeCount: current > 0 ? increment(-1) : 0 });
        wasLiked = true;
      } else {
        tx.set(likeRef, { uid: user.uid, createdAt: serverTimestamp() });
        tx.update(commentRef, { likeCount: increment(1) });
        wasLiked = false;
      }
    });

    // Create notification for new comment likes
    if (!wasLiked && commentAuthorUid && commentAuthorUid !== user.uid) {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const username = userDoc.exists() ? userDoc.data()?.username : "user";

      await createNotification({
        recipientUid: commentAuthorUid,
        type: "comment_like",
        fromUid: user.uid,
        fromUsername: username,
        postId: pid,
        commentId: commentId,
      });
    }
  };

  const reportComment = async (commentId: string, commentUid: string) => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");
    if (!pid) return;

    Alert.alert(
      "Report comment",
      "Why are you reporting this comment?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Spam",
          onPress: async () => {
            try {
              await import("firebase/firestore").then((m) =>
                m.addDoc(m.collection(db, "reports"), {
                  type: "comment",
                  postId: pid,
                  commentId: commentId,
                  commentUid: commentUid,
                  reportedBy: user.uid,
                  reason: "spam",
                  createdAt: m.serverTimestamp(),
                  status: "pending",
                })
              );
              Alert.alert("Reported", "Thank you for your report. We'll review this content.");
            } catch (error) {
              console.error("Error reporting comment:", error);
              Alert.alert("Error", "Failed to submit report");
            }
          },
        },
        {
          text: "Harassment",
          onPress: async () => {
            try {
              await import("firebase/firestore").then((m) =>
                m.addDoc(m.collection(db, "reports"), {
                  type: "comment",
                  postId: pid,
                  commentId: commentId,
                  commentUid: commentUid,
                  reportedBy: user.uid,
                  reason: "harassment",
                  createdAt: m.serverTimestamp(),
                  status: "pending",
                })
              );
              Alert.alert("Reported", "Thank you for your report. We'll review this content.");
            } catch (error) {
              console.error("Error reporting comment:", error);
              Alert.alert("Error", "Failed to submit report");
            }
          },
        },
        {
          text: "Inappropriate",
          onPress: async () => {
            try {
              await import("firebase/firestore").then((m) =>
                m.addDoc(m.collection(db, "reports"), {
                  type: "comment",
                  postId: pid,
                  commentId: commentId,
                  commentUid: commentUid,
                  reportedBy: user.uid,
                  reason: "inappropriate",
                  createdAt: m.serverTimestamp(),
                  status: "pending",
                })
              );
              Alert.alert("Reported", "Thank you for your report. We'll review this content.");
            } catch (error) {
              console.error("Error reporting comment:", error);
              Alert.alert("Error", "Failed to submit report");
            }
          },
        },
      ]
    );
  };

  const reportPost = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("Not logged in");
    if (!pid) return;

    Alert.alert(
      "Report post",
      "Why are you reporting this post?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Spam",
          onPress: async () => {
            try {
              await addDoc(collection(db, "reports"), {
                type: "post",
                postId: pid,
                postUid: postData.uid,
                reportedBy: user.uid,
                reason: "spam",
                createdAt: serverTimestamp(),
                status: "pending",
              });
              Alert.alert("Reported", "Thank you for your report. We'll review this content.");
            } catch (error) {
              console.error("Error reporting post:", error);
              Alert.alert("Error", "Failed to submit report");
            }
          },
        },
        {
          text: "Harassment",
          onPress: async () => {
            try {
              await addDoc(collection(db, "reports"), {
                type: "post",
                postId: pid,
                postUid: postData.uid,
                reportedBy: user.uid,
                reason: "harassment",
                createdAt: serverTimestamp(),
                status: "pending",
              });
              Alert.alert("Reported", "Thank you for your report. We'll review this content.");
            } catch (error) {
              console.error("Error reporting post:", error);
              Alert.alert("Error", "Failed to submit report");
            }
          },
        },
        {
          text: "Inappropriate",
          onPress: async () => {
            try {
              await addDoc(collection(db, "reports"), {
                type: "post",
                postId: pid,
                postUid: postData.uid,
                reportedBy: user.uid,
                reason: "inappropriate",
                createdAt: serverTimestamp(),
                status: "pending",
              });
              Alert.alert("Reported", "Thank you for your report. We'll review this content.");
            } catch (error) {
              console.error("Error reporting post:", error);
              Alert.alert("Error", "Failed to submit report");
            }
          },
        },
      ]
    );
  };

  const deletePost = async () => {
    if (!pid) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Delete post?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          try {
            await deleteDoc(doc(db, "posts", pid));
            Alert.alert("Deleted", "Post has been removed");
            router.back();
          } catch (e: any) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("Delete failed", e?.message ?? String(e));
          }
        },
      },
    ]);
  };

  const openPostMenu = async () => {
    const me = auth.currentUser?.uid;
    const isMine = !!me && postData.uid === me;

    const options = isMine ? ["Delete", "Cancel"] : ["Report", "Cancel"];
    const cancelButtonIndex = options.length - 1;
    const destructiveButtonIndex = isMine ? 0 : undefined;

    const onSelect = (i: number) => {
      const choice = options[i];
      if (choice === "Report") return reportPost();
      if (choice === "Delete") return deletePost();
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: `@${author.username}`, options, cancelButtonIndex, destructiveButtonIndex },
        (buttonIndex) => onSelect(buttonIndex)
      );
    } else {
      const buttons = options.filter((o) => o !== "Cancel");
      Alert.alert(`@${author.username}`, "Choose an action", buttons.map((b) => ({ text: b, onPress: () => onSelect(options.indexOf(b)) })));
    }
  };

  const openCommentMenu = async (c: Comment) => {
    const me = auth.currentUser?.uid;
    const isMine = !!me && c.uid === me;

    const uname = await getUsername(c.uid);
    const options = isMine ? ["Reply", "Delete", "Cancel"] : ["Reply", "Report", "Cancel"];
    const cancelButtonIndex = options.length - 1;
    const destructiveButtonIndex = isMine ? 1 : undefined;

    const onSelect = (i: number) => {
      const choice = options[i];
      if (choice === "Reply") return startReply(c);
      if (choice === "Report") return reportComment(c.id, c.uid);
      if (choice === "Delete") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert("Delete comment?", "This can't be undone.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              try {
                await deleteComment(c);
              } catch (e: any) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert("Delete failed", e?.message ?? String(e));
              }
            },
          },
        ]);
      }
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: `@${uname}`, options, cancelButtonIndex, destructiveButtonIndex },
        (buttonIndex) => onSelect(buttonIndex)
      );
    } else {
      const buttons = options.filter((o) => o !== "Cancel");
      Alert.alert(`@${uname}`, "Choose an action", buttons.map((b) => ({ text: b, onPress: () => onSelect(options.indexOf(b)) })));
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.backgroundColor }]} edges={["top"]}>
      {/* Fixed background image */}
      {userTheme && theme.stanPhoto && (
        <>
          <Image
            source={theme.stanPhoto}
            style={styles.fixedBackground}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
          />
          <View style={styles.fixedBackgroundOverlay} />
        </>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 120 : 0}
      >
        <View style={[styles.safe, userTheme && theme.stanPhoto && { backgroundColor: "transparent" }]}>
          <View style={[styles.wrap, userTheme && theme.stanPhoto ? { backgroundColor: "transparent" } : { backgroundColor: "#fff" }]}>
            <View style={styles.navRow}>
            <Pressable style={[styles.backBtn, userTheme && theme.stanPhoto && styles.backBtnWithBanner]} onPress={goBack}>
              <Text style={[styles.backText, userTheme && theme.stanPhoto && styles.backTextWithBanner]}>‹ Back</Text>
            </Pressable>

            <View style={[styles.sortWrap, userTheme && theme.stanPhoto && styles.sortWrapWithBanner]}>
              <Pressable
                style={[styles.sortBtn, sortMode === "newest" && styles.sortOn, userTheme && theme.stanPhoto && sortMode === "newest" && styles.sortOnWithBanner]}
                onPress={() => setSortMode("newest")}
              >
                <Text style={[styles.sortText, sortMode === "newest" && styles.sortTextOn, userTheme && theme.stanPhoto && styles.sortTextWithBanner, userTheme && theme.stanPhoto && sortMode === "newest" && styles.sortTextOnWithBanner]}>Newest</Text>
              </Pressable>

              <Pressable
                style={[styles.sortBtn, sortMode === "top" && styles.sortOn, userTheme && theme.stanPhoto && sortMode === "top" && styles.sortOnWithBanner]}
                onPress={() => {
                  setSortMode("top");
                  if (topParentOrder.length === 0) setTopParentOrder(computeTopOrder(comments));
                }}
              >
                <Text style={[styles.sortText, sortMode === "top" && styles.sortTextOn, userTheme && theme.stanPhoto && styles.sortTextWithBanner, userTheme && theme.stanPhoto && sortMode === "top" && styles.sortTextOnWithBanner]}>Top</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.refreshBtn, sortMode !== "top" && { opacity: 0.25 }, userTheme && theme.stanPhoto && styles.refreshBtnWithBanner]}
              disabled={sortMode !== "top"}
              onPress={refreshTop}
            >
              <Text style={[styles.refreshText, userTheme && theme.stanPhoto && styles.refreshTextWithBanner]}>Refresh</Text>
            </Pressable>
          </View>

          {!replyTarget && (
            userTheme && theme.stanPhoto ? (
              <BlurView
                intensity={100}
                tint="light"
                style={styles.postBoxBlur}
              >
                <View style={styles.postBox}>
                  {postData.uid && (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <Pressable
                        style={[styles.authorInfo, { marginBottom: 0, flex: 1 }]}
                        onPress={() => router.push(`/u/${postData.uid}`)}
                      >
                        <Avatar
                          imageUrl={author.profilePictureUrl}
                          username={author.username}
                          size={40}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.authorName}>@{author.username}</Text>
                          {postData.createdAt && (
                            <Text style={styles.postTimestamp}>{formatRelativeTime(postData.createdAt)}</Text>
                          )}
                        </View>
                      </Pressable>
                      <Pressable onPress={openPostMenu} style={{ padding: 8 }}>
                        <Text style={{ fontSize: 20, fontWeight: "900", color: "#111" }}>⋯</Text>
                      </Pressable>
                    </View>
                  )}

                  <Text style={styles.postText}>{postData.text}</Text>
            {postData.imageUrl && !keyboardOpen && (
              <>
                <Pressable onPress={() => setImageModalVisible(true)} style={{ marginTop: 8 }}>
                  <Image
                    source={{ uri: postData.imageUrl }}
                    style={styles.postImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </Pressable>

                <Modal
                  visible={imageModalVisible}
                  transparent={true}
                  animationType="fade"
                  onRequestClose={() => setImageModalVisible(false)}
                >
                  <Pressable style={styles.modalOverlay} onPress={() => setImageModalVisible(false)}>
                    <Image
                      source={{ uri: postData.imageUrl }}
                      style={styles.fullscreenImage}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                    <Pressable style={styles.closeBtn} onPress={() => setImageModalVisible(false)}>
                      <Text style={styles.closeBtnText}>✕</Text>
                    </Pressable>
                  </Pressable>
                </Modal>
              </>
            )}
                </View>
              </BlurView>
            ) : (
              <View style={styles.postBox}>
                {postData.uid && (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <Pressable
                      style={[styles.authorInfo, { marginBottom: 0, flex: 1 }]}
                      onPress={() => router.push(`/u/${postData.uid}`)}
                    >
                      <Avatar
                        imageUrl={author.profilePictureUrl}
                        username={author.username}
                        size={40}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.authorName}>@{author.username}</Text>
                        {postData.createdAt && (
                          <Text style={styles.postTimestamp}>{formatRelativeTime(postData.createdAt)}</Text>
                        )}
                      </View>
                    </Pressable>
                    <Pressable onPress={openPostMenu} style={{ padding: 8 }}>
                      <Text style={{ fontSize: 20, fontWeight: "900", color: "#111" }}>⋯</Text>
                    </Pressable>
                  </View>
                )}

                <Text style={styles.postText}>{postData.text}</Text>
                {postData.imageUrl && !keyboardOpen && (
                  <>
                    <Pressable onPress={() => setImageModalVisible(true)} style={{ marginTop: 8 }}>
                      <Image
                        source={{ uri: postData.imageUrl }}
                        style={styles.postImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    </Pressable>

                    <Modal
                      visible={imageModalVisible}
                      transparent={true}
                      animationType="fade"
                      onRequestClose={() => setImageModalVisible(false)}
                    >
                      <Pressable style={styles.modalOverlay} onPress={() => setImageModalVisible(false)}>
                        <Image
                          source={{ uri: postData.imageUrl }}
                          style={styles.fullscreenImage}
                          contentFit="contain"
                          cachePolicy="memory-disk"
                        />
                        <Pressable style={styles.closeBtn} onPress={() => setImageModalVisible(false)}>
                          <Text style={styles.closeBtnText}>✕</Text>
                        </Pressable>
                      </Pressable>
                    </Modal>
                  </>
                )}
              </View>
            )
          )}

          <Text style={[styles.h2, userTheme && theme.stanPhoto && styles.h2WithBanner]}>
            {replyTarget ? "Reply" : "Thread"}
          </Text>

          <KeyboardAwareFlatList
            ref={listRef}
            style={{ flex: 1 }}
            data={renderItems}
            keyExtractor={(it) => (it.kind === "toggle" ? `t:${it.parentId}` : `c:${it.comment.id}`)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: 100 }}
            enableOnAndroid={true}
            enableAutomaticScroll={true}
            extraScrollHeight={150}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, userTheme && theme.stanPhoto && styles.emptyStateTextWithBanner]}>
                  No comments yet. Be the first! 💬
                </Text>
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={userTheme && theme.stanPhoto ? "#fff" : "#111"}
                colors={["#111"]}
              />
            }
            onScroll={onScroll}
            scrollEventThrottle={16}
            onScrollToIndexFailed={() => {
              setTimeout(() => {
                if (scrollToId) {
                  const idx = renderItems.findIndex((it) => it.kind === "comment" && it.comment.id === scrollToId);
                  if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.6 });
                }
              }, 250);
            }}
            renderItem={({ item }) => {
              if (item.kind === "toggle") {
                return userTheme && theme.stanPhoto ? (
                  <BlurView
                    intensity={100}
                    tint="light"
                    style={styles.commentBlur}
                  >
                    <ToggleRow parentId={item.parentId} count={item.count} expanded={item.expanded} onToggle={toggleExpanded} />
                  </BlurView>
                ) : (
                  <ToggleRow parentId={item.parentId} count={item.count} expanded={item.expanded} onToggle={toggleExpanded} />
                );
              }
              return userTheme && theme.stanPhoto ? (
                <BlurView
                  intensity={100}
                  tint="light"
                  style={styles.commentBlur}
                >
                  <CommentRow
                    postId={pid}
                    item={item.comment}
                    isReply={item.isReply}
                    onLongPress={openCommentMenu}
                    onReplyPress={startReply}
                    onToggleLike={toggleCommentLike}
                    getUsername={getUsername}
                    hasTheme={false}
                  />
                </BlurView>
              ) : (
                <View style={styles.commentWithMargin}>
                  <CommentRow
                    postId={pid}
                    item={item.comment}
                    isReply={item.isReply}
                    onLongPress={openCommentMenu}
                    onReplyPress={startReply}
                    onToggleLike={toggleCommentLike}
                    getUsername={getUsername}
                    hasTheme={false}
                  />
                </View>
              );
            }}
          />

          {replyTarget ? (
            userTheme && theme.stanPhoto ? (
              <BlurView
                intensity={100}
                tint="light"
                style={styles.replyBannerBlur}
              >
                <View style={[styles.replyBanner, { borderWidth: 0, marginTop: 0 }]}>
                  <Avatar imageUrl={replyTarget.profilePictureUrl} username={replyTarget.username} size={36} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.replyBannerText}>Replying to @{replyTarget.username}</Text>
                    <Text style={styles.replyBannerComment} numberOfLines={2}>
                      {replyTarget.text}
                    </Text>
                  </View>
                  <Pressable onPress={() => setReplyTarget(null)} style={styles.replyCancelBtn}>
                    <Text style={styles.replyCancel}>✕</Text>
                  </Pressable>
                </View>
              </BlurView>
            ) : (
              <View style={styles.replyBanner}>
                <Avatar imageUrl={replyTarget.profilePictureUrl} username={replyTarget.username} size={36} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.replyBannerText}>Replying to @{replyTarget.username}</Text>
                  <Text style={styles.replyBannerComment} numberOfLines={2}>
                    {replyTarget.text}
                  </Text>
                </View>
                <Pressable onPress={() => setReplyTarget(null)} style={styles.replyCancelBtn}>
                  <Text style={styles.replyCancel}>✕</Text>
                </Pressable>
              </View>
            )
          ) : null}

          {keyboardOpen ? (
            <View style={styles.doneRow}>
              <Pressable onPress={Keyboard.dismiss}>
                <Text style={[styles.doneText, userTheme && theme.stanPhoto && styles.doneTextWithBanner]}>Done</Text>
              </Pressable>
            </View>
          ) : null}

          {userTheme && theme.stanPhoto ? (
            <BlurView
              intensity={100}
              tint="light"
              style={styles.composerBlur}
            >
              <Text style={[styles.charCounter, isNearLimit && styles.charCounterNearLimit, charCount > charLimit && styles.charCounterOverLimit, charCount === 0 && { opacity: 0 }]}>
                {charCount}/{charLimit}
              </Text>
              <View style={styles.composer}>
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.input,
                    styles.inputWithBanner,
                    { color: "#111" }
                  ]}
                  placeholder={replyTarget ? `Reply to @${replyTarget.username}…` : "Add a comment…"}
                  placeholderTextColor="#666"
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={charLimit}
                />
                <Pressable style={[styles.btn, !canSend && { opacity: 0.4 }]} onPress={send} disabled={!canSend}>
                  <Text style={styles.btnText}>Send</Text>
                </Pressable>
              </View>
            </BlurView>
          ) : (
            <View>
              <Text style={[styles.charCounter, isNearLimit && styles.charCounterNearLimit, charCount > charLimit && styles.charCounterOverLimit, charCount === 0 && { opacity: 0 }]}>
                {charCount}/{charLimit}
              </Text>
              <View style={styles.composer}>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  placeholder={replyTarget ? `Reply to @${replyTarget.username}…` : "Add a comment…"}
                  placeholderTextColor="#666"
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={charLimit}
                />
                <Pressable style={[styles.btn, !canSend && { opacity: 0.4 }]} onPress={send} disabled={!canSend}>
                  <Text style={styles.btnText}>Send</Text>
                </Pressable>
              </View>
            </View>
          )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { flex: 1, padding: 16, backgroundColor: "#fff" },

  fixedBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  fixedBackgroundOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },

  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: "#111" },
  backBtnWithBanner: {
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  backText: { fontWeight: "900", color: "#111" },
  backTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  sortWrap: { flexDirection: "row", borderWidth: 1, borderColor: "#111", borderRadius: 999, overflow: "hidden" },
  sortWrapWithBanner: {
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  sortBtn: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "#fff" },
  sortOn: { backgroundColor: "#111" },
  sortOnWithBanner: { backgroundColor: "rgba(255, 255, 255, 0.2)" },
  sortText: { fontWeight: "900", color: "#111" },
  sortTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sortTextOn: { color: "#fff" },
  sortTextOnWithBanner: { color: "#fff" },

  refreshBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: "#111" },
  refreshBtnWithBanner: {
    borderColor: "rgba(255, 255, 255, 0.3)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  refreshText: { fontWeight: "900", color: "#111", opacity: 0.8 },
  refreshTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    opacity: 1,
  },

  h2: { marginTop: 14, marginBottom: 8, fontSize: 16, fontWeight: "800", color: "#111" },
  h2WithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },

  postBoxBlur: {
    marginTop: 6,
    borderRadius: 12,
    overflow: "hidden",
  },
  postBox: { marginTop: 6, borderWidth: 1, borderColor: "#111", borderRadius: 12, padding: 12 },
  authorInfo: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  authorName: { fontSize: 14, fontWeight: "900", color: "#111" },
  postTimestamp: { fontSize: 12, color: "#111", fontWeight: "600", marginTop: 2 },
  authorNameWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  postText: { color: "#111", fontSize: 16 },
  postTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  postImage: { width: "100%", height: 250, borderRadius: 8, marginTop: 8 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: { width: "100%", height: "100%" },
  closeBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: "#fff",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: { fontSize: 20, fontWeight: "900", color: "#111" },

  commentBlur: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
  },
  comment: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 10 },
  commentWithMargin: { marginBottom: 8 },
  replyComment: { marginLeft: 18, borderColor: "#eee", backgroundColor: "#fafafa" },

  // subtle "liked by you" signal
  likedComment: { borderColor: "#111" },

  commentTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  handle: { fontWeight: "900", color: "#111" },
  handleWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  time: { fontSize: 12, color: "#111", fontWeight: "700" },
  timeWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    fontWeight: "700",
  },

  replyTo: { marginTop: 6, fontSize: 12, color: "#666" },
  replyToWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  commentText: { color: "#111", marginTop: 6 },
  commentTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },

  actionsRow: { flexDirection: "row", gap: 16, marginTop: 10, alignItems: "center" },
  commentActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  commentActionIcon: { fontSize: 22, color: "#111" },
  commentActionIconLiked: { color: "#ff0000" },
  commentActionText: { fontSize: 14, fontWeight: "700", color: "#111" },
  commentLikeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  commentLikeCount: { fontSize: 14, fontWeight: "700", color: "#111" },

  emptyState: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  emptyStateTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },

  toggleRow: { paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8, marginLeft: 2 },
  toggleText: { fontWeight: "900", color: "#111", opacity: 0.8 },

  replyBannerBlur: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
  },
  replyBanner: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
  },
  replyBannerText: { fontWeight: "800", color: "#111", marginBottom: 4, fontSize: 14 },
  replyBannerComment: { fontSize: 13, color: "#666", lineHeight: 18, fontWeight: "500" },
  replyCancelBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  replyCancel: { fontWeight: "900", color: "#111", fontSize: 16 },

  doneRow: { marginTop: 8, alignItems: "flex-end" },
  doneText: { fontWeight: "900", color: "#111", opacity: 0.75 },
  doneTextWithBanner: {
    color: "#fff",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
    opacity: 1,
  },

  composerBlur: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    paddingTop: 8,
  },
  charCounter: {
    fontSize: 11,
    color: "#999",
    textAlign: "right",
    paddingHorizontal: 12,
    paddingBottom: 4,
    fontWeight: "600",
  },
  charCounterNearLimit: {
    color: "#ff9500",
  },
  charCounterOverLimit: {
    color: "#ff3b30",
    fontWeight: "900",
  },
  composer: { marginTop: 8, flexDirection: "row", gap: 6, alignItems: "center" },
  input: { flex: 1, minHeight: 32, maxHeight: 100, borderWidth: 1, borderColor: "#ddd", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff", fontSize: 14 },
  inputWithBanner: {
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  btn: { backgroundColor: "#111", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  btnDisabled: {
    opacity: 0.4,
    backgroundColor: "#999",
  },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
});
