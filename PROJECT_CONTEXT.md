# NextFlow Project Context

Last updated: 2026-06-21

## Assignment Summary

Build `NextFlow`, a focused Galaxy.ai workflow builder demo app with:

- Clerk sign-in / sign-up and auth-protected routes.
- Authenticated dashboard for workflows with create, open, rename, delete.
- Workflow canvas with node graph, run controls, and history panel.

Do not build a marketing homepage. Unauthenticated access should route users through Clerk.

Required stack:

- Next.js App Router
- TypeScript strict mode
- PostgreSQL / Neon
- Prisma ORM
- Clerk auth
- React Flow canvas
- Trigger.dev task execution
- Transloadit image handling
- FFmpeg via Trigger.dev
- Tailwind CSS
- Zustand state management
- Zod validation
- Google Gemini via `@google/generative-ai`
- Lucide React icons

Core workflow behavior:

- Canvas must start with locked `Request-Inputs` and `Response` nodes.
- Additional nodes are added via a bottom-center `+` node picker, not a full left sidebar.
- Supported nodes: Request-Inputs, Crop Image, Gemini 3.1 Pro, Response.
- Crop Image execution requires an artificial delay of 30+ seconds.
- Executable nodes should run as Trigger.dev tasks; Request-Inputs and Response remain local-only.
- Canvas must include dot grid, MiniMap, pan/zoom/fit controls, undo/redo, animated edges, DAG validation, and typed connection handles.
- Execution modes: single node, multi-select, full workflow.
- Independent siblings should execute concurrently, and completed nodes should fan out immediately.
- Right sidebar must show run history entries with expandable node details.
- Workflows and run history should persist to PostgreSQL via Prisma.
- Must support import/export of workflow JSON.
- Emit one console log on initial client render: `[NextFlow] Candidate LinkedIn: <full-linkedin-profile-url>`.

Sample assignment workflow:

- `Request-Inputs` with `text_field` and `image_field`.
- Two crop nodes consuming `image_field`.
- Gemini #1 consuming `text_field`.
- Gemini #2 consuming Gemini #1 response.
- Final Gemini consuming Gemini #2 response and crop outputs.
- `Response` node consuming the final Gemini result.

## Current Repo Status

Project root: `workflow-builder`

Completed work:

- App scaffolded in Next.js App Router.
- Clerk auth integrated with sign-in and sign-up routes.
- Dashboard built with create/open/rename/delete workflow actions.
- Protected workflow page loads only the authenticated user's workflows.
- Workflow canvas replaced with a full React Flow builder prototype.
- Runtime schema updated with Prisma models: `Workflow`, `Run`, and `NodeRun`.
- Started progress on canvas persistence and run-history API.

Current verification:

- `npm run build` passes.
- `npm run lint` passes.
- Dev server starts successfully at `http://localhost:3000`.

## What is implemented now

### Dashboard and auth

- `app/dashboard/page.tsx` renders the workflow dashboard UI.
- `app/dashboard/workflow/[id]/page.tsx` validates authenticated ownership.
- CRUD actions are scoped to the signed-in Clerk user.

### Workflow canvas prototype

- `components/WorkflowCanvas.tsx` provides:
  - Locked `Request-Inputs` and `Response` nodes.
  - Bottom-center `+` node picker for adding Crop and Gemini nodes.
  - Typed handle validation for image/text connections.
  - DAG cycle prevention.
  - Animated node edges and run pulse styling.
  - MiniMap, grid background, zoom/pan controls.
  - Undo/redo support for node/edge edits.
  - Import/export workflow JSON.
  - Local run simulation with node status updates and history entries.

### Runtime persistence and API

- `app/api/workflow/[id]/route.ts` now supports:
  - PATCH to save workflow nodes and edges.
  - POST to persist run history.
- Added normalization and validation for incoming `scope` values so Prisma receives a valid `RunScope` enum.

### Current server checks

- Build route table includes `/`, `/dashboard`, `/dashboard/workflow/[id]`, `/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]`.
- Dev server successfully launches.
- API route returns `401 Unauthorized` when called without Clerk auth, as expected.

## Recent progress log

### Latest update

- Fixed runtime 500 failure in `POST /api/workflow/[id]` caused by invalid `scope` values.
- Added normalization for user-friendly scope labels like `Full Workflow`, `Multi-select`, and `Single Node`.
- Validated with a successful `npm run build` after the fix.
- Confirmed the dev server starts cleanly on the correct project folder.

## Remaining work

- Persist canvas edits to the database end-to-end.
- Store run history from UI into Prisma and surface it reliably.
- Implement real Trigger.dev execution tasks.
- Add real Transloadit image upload/crop integration.
- Add FFmpeg pipelines via Trigger.dev where required.
- Integrate Google Gemini via `@google/generative-ai`.
- Add Zod validation for API payloads.
- Polish UI with Lucide icons and styling.
- Perform browser demo validation with a real Clerk session.
- Prepare deployment documentation / Vercel deployment.

## Demo prep notes

- Current app is build-verified and runs locally.
- Existing functionality is a local execution prototype with graph editing and history UI.
- External integration stubs remain pending; the demo should focus on canvas UX, auth flow, and persistence path.
- Replace the placeholder LinkedIn URL in `WorkflowCanvas.tsx` before any public demo if required.
