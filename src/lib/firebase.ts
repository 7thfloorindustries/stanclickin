import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCVNaz0Ji6YS5XVzzI0s4OH_Q5KX9bqLB8",
  authDomain: "stanclickin-e168b.firebaseapp.com",
  projectId: "stanclickin-e168b",
  storageBucket: "stanclickin-e168b.firebasestorage.app",
  messagingSenderId: "184168148228",
  appId: "1:184168148228:web:addcf6d3e649951c2bf451",
  measurementId: "G-D4WPSJQX0E",
};

const app = initializeApp(firebaseConfig);

// ✅ Persist auth sessions in React Native
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
export const storage = getStorage(app);
