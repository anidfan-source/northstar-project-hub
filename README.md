# Northstar

A focused project-management MVP built with React, TypeScript, and Vite.

## Features

- Project overview and progress metrics
- Visual “Plan on a page” roadmap with milestones, phases, workload, and priority focus
- Editable 4-week, 8-week, 6-month, 1-year, and custom timeline ranges
- Editable project phase names and dates with saved browser preferences
- Multiple projects with project-specific tasks, plans, creation, and removal
- Markdown project canvas with formatting controls and live preview
- Gemini-powered AI Project Builder for generating phases, tasks, timelines, and briefs from a plain-language idea
- Slide studio with selectable progress, status, priority, timeline, and task-list visuals
- One-click export to editable PowerPoint (`.pptx`) or a high-resolution PNG snapshot
- Searchable, filterable Kanban board
- Drag-and-drop task status changes
- Task creation and deletion
- Full task editing, including status, priority, assignee, due date, and category
- One-click task duplication into the backlog
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
