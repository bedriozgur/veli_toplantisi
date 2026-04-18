# Parent Evening App

A lightweight React/Vite app for school parent-teacher meetings.

## What it does
- Manage teachers, classes, and students
- Assign teachers to classes
- Generate a QR code per student
- Parent view shows only that student's teachers
- Parent can tick completed meetings and write notes
- Parent can email their notes at the end
- Admin data persists in the browser via localStorage

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

## Important current limitation
This version stores admin-side data only in the browser that created it. If you want multi-device admin access or server-side persistence, add a backend later (Firebase, Supabase, etc.).
