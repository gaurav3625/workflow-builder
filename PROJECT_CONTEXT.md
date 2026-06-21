# NextFlow Project Context

Last updated: 2026-06-21

## Assignment Summary

Build `NextFlow`, a pixel-close clone of the Galaxy.ai workflow builder focused only on:

- Clerk sign-in / sign-up.
- Authenticated dashboard listing the user's workflows with create, open, rename, and delete.
- Workflow canvas with sidebar/canvas/history panel.

Do not build a marketing page. Unauthenticated traffic should go directly to Clerk.

Required stack from assignment:

- Next.js App Router, TypeScript strict, PostgreSQL/Neon, Prisma, Clerk, React Flow, Trigger.dev, Transloadit, FFmpeg through Trigger.dev, Tailwind, Zustand, Zod, Google Gemini via `@google/generative-ai`, Lucide React.

Core workflow requirements:

- New canvas starts with `Request-Inputs` and `Response` nodes pre-placed and not deletable.
- No left sidebar full of node buttons. Other nodes are added through a bottom-center `+` picker.
- Node types: Request-Inputs, Crop Image, Gemini 3.1 Pro, Response.
- Crop Image task must include a mandatory artificial delay of at least 30 seconds.
- Executable nodes should run via Trigger.dev tasks; Request-Inputs and Response are local-only.
- React Flow canvas must have dot grid, MiniMap, pan/zoom/fit-view, undo/redo, animated purple edges, DAG validation, type-safe handles, disabled manual inputs when connected.
- Selective execution: single node, multi-select, full workflow.
- Parallel execution: independent siblings run concurrently, and completed nodes fan out immediately.
- Right sidebar workflow history with run entries and expandable node-level details.
- Persistence: workflows and run history saved to PostgreSQL via Prisma.
- Import/export workflow JSON.
- Emit exactly one console log on initial client render: `[NextFlow] Candidate LinkedIn: <full-linkedin-profile-url>`.

Sample workflow from the assignment:

- Request-Inputs with `text_field` and `image_field`.
- Crop Image #1 and Crop Image #2 fed from `image_field`.
- Gemini #1 fed from `text_field`.
- Gemini #2 fed from Gemini #1 response.
- Final Gemini fed from Gemini #2 response and both crop outputs as vision inputs.
- Response fed from final Gemini response.

## Current Repo Audit Before This Work

Project root: `workflow-builder`.

Implemented before this pass:

- Next.js app scaffold.
- Clerk dependency and sign-in/sign-up routes exist.
- Prisma model `Workflow` with `id`, `name`, `userId`, `status`, `flowData`, timestamps.
- Dashboard reads user workflows and has create button.
- Workflow detail page loads a workflow and renders a tiny React Flow canvas.
- Home route redirects to `/dashboard`.

Missing or incomplete before this pass:

- Dashboard rename/delete/open action UI and polished Galaxy-like layout.
- Workflow route did not verify workflow ownership.
- Canvas had only a single `Start` node.
- No required Request-Inputs/Response preplaced nodes.
- No node picker, custom node UI, handles, typed connection validation, DAG validation, animated edges, minimap styling, undo/redo, selective run UI, history sidebar, import/export, running pulse states, sample workflow, or persistence of canvas changes.
- No Trigger.dev, Transloadit, Gemini, Zod API routes, or run-history schema.
- No living context file existed.

## Implementation Plan

1. Create and maintain this context file.
2. Add dashboard workflow actions and secure ownership checks.
3. Replace minimal canvas with a substantial local React Flow builder prototype:
   - Required pre-placed nodes.
   - Bottom `+` node picker.
   - Crop/Gemini node cards.
   - Animated typed edges, DAG validation, MiniMap, dot grid, fit controls.
   - Run simulation with visible pulsating nodes and history entries.
   - Import/export JSON and undo/redo for node/edge changes.
4. Run lint/build checks after each slice where possible.
5. Commit the completed local implementation.

## Progress Log

### Step 1 - Context Created

Status: in progress.

- Created this file from the assignment screenshots and repo audit.
- Next step: implement dashboard workflow actions and protected workflow ownership.

### Step 2 - Dashboard CRUD and Ownership Protection

Status: complete.

Changed files:

- `lib/actions/workflow.ts`: create now redirects to the created workflow; added rename and delete actions scoped by Clerk `userId`.
- `app/dashboard/page.tsx`: replaced starter dashboard with a Galaxy-like app shell, workflow table, create/open/rename/delete actions, status badge, and empty state.
- `app/dashboard/workflow/[id]/page.tsx`: now requires auth and loads workflow by both `id` and `userId`.

Verification:

- `npm.cmd run lint` passed.

Remaining:

- Main canvas builder behavior, run history, import/export, real execution integrations, persisted run history, deployment.

### Step 3 - Canvas Prototype and Route Scope

Status: complete.

Changed files:

- `components/WorkflowCanvas.tsx`: replaced the starter single-node canvas with a substantial React Flow workflow builder prototype.
  - Includes required locked `Request-Inputs` and `Response` nodes.
  - Includes sample assignment workflow with two Crop Image nodes and three Gemini nodes.
  - Adds nodes through the bottom-center `+` picker.
  - Uses typed handles and rejects invalid text/image connections.
  - Rejects cycle-forming connections to keep the graph DAG-only.
  - Uses animated color-coded edges, dot grid, MiniMap, pan/zoom controls, selected-node delete, undo/redo controls, import/export JSON, run buttons, running pulse state, and right-sidebar run history with expandable node-level details.
  - Simulates execution locally. Crop nodes wait 31.8s to reflect the mandatory 30+ second requirement. Real Trigger.dev tasks are still pending.
  - Emits `[NextFlow] Candidate LinkedIn: <full-linkedin-profile-url>` once when the canvas first renders. Replace the placeholder with the real candidate LinkedIn URL before final submission if required.
- `app/globals.css`: added node-card, typed-handle, animated edge, and pulsing run styles.
- `app/test/page.tsx`: removed debug data route because the assignment allows only auth, dashboard, and workflow canvas surfaces.
- `prisma.config.ts`: made `DATABASE_URL` handling type-safe for production build.

Verification:

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- Build route table now contains `/`, `/dashboard`, `/dashboard/workflow/[id]`, `/sign-in/[[...sign-in]]`, and `/sign-up/[[...sign-up]]`.

Remaining:

- Real Trigger.dev task definitions and API routes.
- Real Gemini calls via `@google/generative-ai`.
- Real Transloadit upload/crop and FFmpeg pipeline.
- Persisting canvas edits and run history to PostgreSQL.
- Zod-validated API route layer.
- Lucide icons package/design polish pass.
- Vercel deployment and demo recording.

### Step 4 - Local Smoke Test

Status: complete.

Dev server:

- Started with PID `10916` at `http://localhost:3000`.

Verification:

- `GET /` returned 307 with Clerk signed-out protection headers.
- `GET /sign-in` returned 200 OK.
- `GET /dashboard` returned 307 with Clerk signed-out protection headers.

Notes:

- Authenticated dashboard/canvas interaction still needs browser/manual verification with valid Clerk session and database connectivity.

### Step 5 - Final Verification Before Commit

Status: complete.

Verification:

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.

Known caveats:

- The canvas currently simulates execution locally and does not yet persist graph edits or run history.
- The assignment's external integrations are still pending: Trigger.dev, Transloadit, Gemini, Zod API routes, and deployment.
- The Clerk/Neon-backed authenticated flow needs manual browser testing with valid credentials.
