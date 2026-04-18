# Parent Evening App

A lightweight React/Vite app for school parent-teacher meetings.

## What it does
- Manage teachers, classes, and students
- Assign teachers to classes
- Generate one entrance QR code for the whole event
- Let parents search for their child from that QR landing page
- Generate a dedicated QR per student when needed
- Let parents tick completed meetings and write notes
- Save parent progress on their own phone with localStorage
- Email the notes at the end of the evening
- Copy and import the full event setup JSON between staff devices

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

## Deploy to Vercel
1. Push this folder to a GitHub repository.
2. In Vercel, create a New Project and import that repo.
3. Framework preset: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy

Vercel will auto-detect Vite in most cases.

## Recommended flow at the school entrance
1. Set up teachers, classes, and students in the admin view.
2. Open `Students & QR`.
3. Use `Open entrance QR` and show that QR at the entrance.
4. Parents scan it, search their child, and open their own meeting checklist.
5. After meetings, parents email the notes from their phone.

## Important current limitation
This version still stores data in the browser. It is now easier to move setup data between staff devices using the setup JSON copy/import flow, but it is not a real shared backend yet. If you want live multi-device admin access, add a backend later (Firebase, Supabase, etc.).
