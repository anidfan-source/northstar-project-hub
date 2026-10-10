# Northstar

A focused project-management MVP built with React, TypeScript, and Vite.

## Features

- Project overview and progress metrics
- Searchable, filterable Kanban board
- Drag-and-drop task status changes
- Task creation and deletion
- Local browser persistence
- Supabase email authentication and secure cloud synchronization
- Row-level security so each user can access only their own tasks
- Real-time task updates across signed-in devices
- Responsive layout
- GitHub Pages deployment workflow

## Development

```bash
npm install
npm run dev
```

Unsigned users remain in local mode. Signing in moves the experience to the Supabase-backed task store. The tracked publishable key is designed for browser use; access is enforced by the database policies in `supabase/migrations`.

## Deploying to GitHub Pages

Create a GitHub repository, push the `main` branch, then select **GitHub Actions** as the Pages source under repository Settings → Pages.
