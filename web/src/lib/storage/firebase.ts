import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { doc, getFirestore, setDoc } from "firebase/firestore";
import type { SessionSummary } from "@/types";

// Public web client config (same project as legacy dashboard). Override via env in Vercel if needed.
const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyDM3SaTqB3lQ0QLFN2kunjJqedNW_xdk3k",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "smartfocus-27404.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "smartfocus-27404",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "smartfocus-27404.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "839811611826",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:839811611826:web:609e920bd0871dc5ddddab",
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId);

export function getFirebaseApp() {
  if (!isFirebaseConfigured) return null;
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

export const googleProvider = new GoogleAuthProvider();

export async function syncSessionToCloud(uid: string, summary: SessionSummary): Promise<void> {
  const app = getFirebaseApp();
  if (!app) return;

  const firestore = getFirestore(app);
  const { ticks: _ticks, ...stripped } = summary;
  await setDoc(doc(firestore, "users", uid, "sessions", summary.session_id), {
    ...stripped,
    user_id: uid,
    synced_at: Date.now() / 1000,
  });
}
