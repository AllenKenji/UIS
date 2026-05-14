import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage, ref } from "firebase/storage";

const STORAGE_BUCKET =
  process.env.REACT_APP_FIREBASE_STORAGE_BUCKET ||
  "barangay-1721d.firebasestorage.app";

// 🔐 Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDX41U2aTmvhI7Fs4QbDRzCRHuExcKFF8g",
  authDomain: "barangay-1721d.firebaseapp.com",
  projectId: "barangay-1721d",
  storageBucket: STORAGE_BUCKET,
  messagingSenderId: "397499309217",
  appId: "1:397499309217:web:38d393fea54dca6d6964e0",
  measurementId: "G-3G0PT7F4N5"
};

// 🚀 Safe app initialization
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// 🔧 Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app, `gs://${STORAGE_BUCKET}`);

// 🧪 Runtime validation
try {
  ref(storage, "healthcheck.txt");
} catch (err) {
  console.error("❌ Firebase Storage failed to initialize:", err);
  throw new Error("❌ Firebase Storage bucket is undefined. Check firebaseConfig.storageBucket and SDK version.");
}
