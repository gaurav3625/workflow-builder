# Fast Deployment Guide

This repository is a Next.js App Router app. The fastest deployment option is Vercel, but you can also deploy to any Node-compatible host.

## 1. Prepare the app locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Verify environment variables:

   - Copy `.env.example` to `.env.local` if available.
   - Set your Clerk and database values:
     - `CLERK_PUBLISHABLE_KEY`
     - `CLERK_SECRET_KEY`
     - `NEXT_PUBLIC_CLERK_FRONTEND_API`
     - `DATABASE_URL`

3. Generate Prisma client and run migrations if needed:

   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

4. Verify the build:

   ```bash
   npm run build
   ```

5. Run locally to confirm:

   ```bash
   npm run start
   ```

## 2. Deploy quickly with Vercel

1. Sign in to Vercel: https://vercel.com/
2. Create a new project and import this repository.
3. Set the root path to the project folder if needed.
4. Configure environment variables in Vercel to match `.env.local`.
5. Use the default build command:

   ```bash
   npm run build
   ```

6. Deploy.

## 3. Deploy with the Vercel CLI

1. Install the CLI if you don't have it:

   ```bash
   npm install -g vercel
   ```

2. Log in:

   ```bash
   vercel login
   ```

3. Deploy to production from the repo root:

   ```bash
   vercel --prod
   ```

4. When prompted, use the project root and confirm the build command is `npm run build`.

## 4. Quick manual host deployment

1. Build the app:

   ```bash
   npm run build
   ```

2. Start the app in production mode:

   ```bash
   npm run start
   ```

3. Ensure your host exposes port `3000` or configures it from `process.env.PORT`.

## Notes

- This app uses Next.js 16.2.9 with Turbopack.
- Use Vercel for the fastest path from commit to production.
- If you need a database connection, make sure `DATABASE_URL` is set in production.
