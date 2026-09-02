# SmartFocus Web App

Browser-native focus tracking. All CV runs locally via MediaPipe.

## Production URL

**https://smartfocus-app.vercel.app**

(Vercel project: `smartfocus` in team `aaditya-sahus-projects`)

## Environment (Firebase cloud sync)

Set these in Vercel → Project → Settings → Environment Variables:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=smartfocus-27404.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=smartfocus-27404
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=smartfocus-27404.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Firebase authorized domain `smartfocus-app.vercel.app` is configured for Google sign-in.

Deploy Firestore rules from `firestore.rules`:

```bash
firebase deploy --only firestore:rules
```

## Development

```bash
npm install
npm run dev
```

## Production

```bash
npm run build
npm start
```

Vercel project root directory must be **`web`**.

## Privacy

Webcam frames are processed locally. Only derived session metrics sync to Firestore when signed in.
