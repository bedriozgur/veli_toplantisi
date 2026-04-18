# Parent Evening App

A lightweight React/Vite app for school parent-teacher meetings.

## What it does
- Manage teachers, classes, and students
- Assign teachers to classes
- Publish an event to Firebase by short event code
- Generate one entrance QR code for the whole event
- Let parents search for their child from that QR landing page
- Generate a dedicated QR per student when needed
- Let parents tick completed meetings and write notes
- Save parent progress on their own phone and sync it in cloud mode
- Email the notes to the configured school recipient
- Download and import the event setup as a JSON file between staff devices

## Local run
```bash
npm install
npm run dev
```

## Firebase cloud mode
Add these env vars in a local `.env` file before starting the app if you want privacy-safe entrance QR publishing:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

There is a committed [.env.example](./.env.example) file for the expected variable names.

Without Firebase, the app still runs locally, but the shared entrance QR falls back to local hash data instead of a short cloud event code.

## Build
```bash
npm install
npm run build
```

## Deploy to Firebase Hosting + Firestore
1. Create a Firebase project.
2. Add a Firebase Web App inside that project.
3. Enable Firestore Database.
4. Create a local `.env` from `.env.example` and fill in:
   `VITE_FIREBASE_API_KEY`
   `VITE_FIREBASE_AUTH_DOMAIN`
   `VITE_FIREBASE_PROJECT_ID`
   `VITE_FIREBASE_APP_ID`
5. Install the Firebase CLI:
   `npm install -g firebase-tools`
6. Log in:
   `firebase login`
7. Copy `.firebaserc.example` to `.firebaserc` and replace `your-firebase-project-id` with the real Firebase project id.
8. Build the app:
   `npm run build`
9. Deploy Hosting and Firestore rules:
   `firebase deploy`

This repo already includes:
- `firebase.json`
- `firestore.rules`
- `.firebaserc.example`

The Hosting config is set up for a Vite single-page app and rewrites all routes to `index.html`.

## Recommended flow at the school entrance
1. Set up teachers, classes, students, the notes recipient email, and the event code in the admin view.
2. Publish the event to Firebase.
3. Open `Students & QR`.
4. Use `Open entrance QR` and show that QR at the entrance.
5. Parents scan it, type at least 2 letters of the student name, and open their own checklist.
6. After meetings, parents email the notes to the configured school address.

## Important current limitation
Admin editing is still browser-local unless you move to a fuller backend workflow. Firebase cloud mode in this version is focused on publishing the event, resolving the shared QR privacy problem, and syncing parent progress, not on collaborative admin editing.

## Security note
The included `firestore.rules` are intentionally permissive so the current browser-only admin publish flow works without authentication. That is acceptable for a prototype or limited internal event, but it is not strong enough for a hardened production school system. For stronger protection, move publishing behind Firebase Auth or a server-side function later.
