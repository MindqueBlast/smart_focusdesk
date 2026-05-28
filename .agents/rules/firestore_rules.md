# Firestore Cloud Security & Frontend Configuration

This document specifies the Firestore Security Rules configuration and the frontend bootstrapping integration to secure user telemetry documents and enable real-time reading from the upcoming web dashboard.

---

## Firestore Security Rules

Deploy these rules in your Firebase Console under **Firestore Database -> Rules**. They restrict document access so that authenticated users can only access their own documents partitioned under `/users/{user_id}`.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Secure user-scoped data namespaces
    match /users/{userId} {
      // Users can only read and write their own root user document
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Users can only read and write their own focus tracking sessions
      match /sessions/{sessionId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

### Security Implications

> [!IMPORTANT]
> - **Authentication Check**: `request.auth != null` ensures the client has logged in via Firebase Auth (e.g., using Google Sign-In).
> - **UID Matching**: `request.auth.uid == userId` guarantees that users cannot read or write data belonging to another user.
> - **Deep Nested Matches**: Sub-collections inherit security properties through explicit matching boundaries, preventing cross-tenant document leakage.

---

## Web Dashboard Frontend Bootstrap

Use this JavaScript snippet to bootstrap our upcoming React/Vite/Next.js dashboard web application. It handles Google Authentication, retrieves the secure JWT ID token to pass to APIs, and reads focus sessions directly from Firestore in real-time.

```javascript
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  query, 
  orderBy, 
  onSnapshot 
} from "firebase/firestore";

// 1. Firebase Client Configuration (Loaded from firebase_config.json)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "smart-focusdesk-cloud.firebaseapp.com",
  projectId: "smart-focusdesk-cloud",
  storageBucket: "smart-focusdesk-cloud.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase Core Services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 2. Google OAuth Sign-in Handler
export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    // User is logged in!
    const user = result.user;
    
    // Retrieve OAuth JWT (ID Token) to send to backend APIs if needed
    const idToken = await user.getIdToken();
    console.log("Verified User ID:", user.uid);
    console.log("Secure JWT ID Token:", idToken);
    
    return { user, idToken };
  } catch (error) {
    console.error("Google Auth popup failed:", error);
    throw error;
  }
};

// 3. Google Sign-out Handler
export const logOut = () => signOut(auth);

// 4. Real-time Telemetry Session Listener
export const subscribeToSessions = (userId, onUpdate) => {
  if (!userId) return () => {};
  
  // Reference the partitioned path: users/{user_id}/sessions/
  const sessionsRef = collection(db, "users", userId, "sessions");
  
  // Query sessions sorted by start time
  const q = query(sessionsRef, orderBy("start_time", "desc"));
  
  // Subscribe to real-time updates (updates UI automatically when a tracking session stops!)
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const sessions = [];
    snapshot.forEach((doc) => {
      sessions.push({ id: doc.id, ...doc.data() });
    });
    onUpdate(sessions);
  }, (error) => {
    console.error("Error subscribing to Firestore sessions:", error);
  });
  
  return unsubscribe;
};
```
