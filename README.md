# Parent Evening App

A React/Vite app for school parent-teacher meetings with Firebase Auth and Firestore.

## What it does
- Staff sign in with Firebase Auth
- Admins create meetings and load class/student CSVs from the meeting detail screen
- Front desk searches students and marks arrivals
- Parents enter a code and view only their class meeting plan
- Parent notes are exported through the user’s own mail client with `mailto:`

## Local run
```bash
npm install
npm run dev
```

## Build
```bash
npm install
npm run build
```

## Firebase
Set these environment variables for cloud mode:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
```

## CSV imports
The admin meeting detail screen supports:
- Class roster CSV import
- Student CSV import with parent name and parent phone columns

Templates are included in the UI.
