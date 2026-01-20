// Empty module to mock native-only packages on web
// Provides stubs for common exports

const noop = () => {};
const noopPromise = () => Promise.resolve();

// expo-haptics
module.exports.impactAsync = noopPromise;
module.exports.notificationAsync = noopPromise;
module.exports.selectionAsync = noopPromise;
module.exports.ImpactFeedbackStyle = { Light: "light", Medium: "medium", Heavy: "heavy" };
module.exports.NotificationFeedbackType = { Success: "success", Warning: "warning", Error: "error" };

// expo-notifications
module.exports.setNotificationHandler = noop;
module.exports.addNotificationReceivedListener = () => ({ remove: noop });
module.exports.addNotificationResponseReceivedListener = () => ({ remove: noop });
module.exports.setBadgeCountAsync = noopPromise;
module.exports.getExpoPushTokenAsync = () => Promise.resolve({ data: "" });
module.exports.getPermissionsAsync = () => Promise.resolve({ status: "undetermined" });
module.exports.requestPermissionsAsync = () => Promise.resolve({ status: "undetermined" });

// react-native-iap
module.exports.initConnection = noopPromise;
module.exports.endConnection = noopPromise;
module.exports.getProducts = () => Promise.resolve([]);
module.exports.getSubscriptions = () => Promise.resolve([]);
module.exports.requestPurchase = noopPromise;
module.exports.requestSubscription = noopPromise;
module.exports.finishTransaction = noopPromise;
module.exports.purchaseUpdatedListener = () => ({ remove: noop });
module.exports.purchaseErrorListener = () => ({ remove: noop });
module.exports.clearTransactionIOS = noopPromise;
module.exports.clearProductsIOS = noopPromise;
module.exports.getAvailablePurchases = () => Promise.resolve([]);
