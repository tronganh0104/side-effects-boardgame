# Deployment Guide

## Build

```bash
npm run build
```

This produces the client bundle and the server bundle.

## Run the server bundle

```bash
npm run server:start
```

## Environment

The repository uses environment variables for client and server configuration.

Typical values:

- `VITE_MULTIPLAYER_SERVER_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `PORT`
- `CLIENT_ORIGIN`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

## Auth

The browser Auth client needs `VITE_SUPABASE_URL` and the project public anon
key. `SUPABASE_SECRET_KEY` remains server-only and must never be configured as
a Vite variable. Enable the Email/password provider and add the deployed site
URL (plus any local development URL) to the project's Auth URL configuration
before using login or registration. With **Confirm email** enabled, registration
creates an account without an application session until the user confirms the
email and signs in; with it disabled, Supabase can return a session immediately.

## Storage

- Without Supabase variables, the server uses in-memory storage.
- With Supabase variables, room snapshots can be persisted.

## Release checklist

1. Run the test suite.
2. Run the build.
3. Verify the production server starts.
4. Confirm the client points at the correct server URL.
