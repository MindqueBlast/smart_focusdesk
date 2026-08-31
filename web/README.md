# Smart Focus Desk Web App

Browser-native focus tracking. All CV runs locally via MediaPipe.

## Environment (Firebase cloud sync)

Set these in Vercel → Project → Settings → Environment Variables:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=smart-focusdesk-cloud.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=smart-focusdesk-cloud
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=smart-focusdesk-cloud.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Get values from Firebase Console → Project settings → Your apps → Web app config.

### Authorized domains (required for Google sign-in)

Each deployed hostname must be allowlisted in Firebase before OAuth works.

1. Open [Firebase Console](https://console.firebase.google.com/) → your project
2. Go to **Authentication** → **Settings** → **Authorized domains**
3. Click **Add domain** and enter your Vercel hostname (e.g. `web-beta-six-93.vercel.app`)
4. Save, then retry Google sign-in in **Settings**

`localhost` is included by default for local development.

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
