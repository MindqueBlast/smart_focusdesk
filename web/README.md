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
