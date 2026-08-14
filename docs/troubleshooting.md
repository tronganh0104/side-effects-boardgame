# Troubleshooting Guide

## Common issues

### The client cannot connect to the server

- Check `VITE_MULTIPLAYER_SERVER_URL`.
- Confirm the server is running.
- Verify CORS origin settings in the server config.
- Run both local processes with `npm run dev`; the server loads `.env` for
  Supabase token verification while Vite loads its public `VITE_*` values.
- A signed-in browser requires local `SUPABASE_URL` and
  `SUPABASE_SECRET_KEY` as well as `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`. Do not put the secret in a `VITE_*` variable.

### A room does not restore

- Confirm the session token is still present in the browser session storage.
- Check whether the persisted snapshot format is supported.
- Review server logs for deserialization errors.

### A command appears to do nothing

- Confirm the turn belongs to the active player.
- Check whether a pending decision must be resolved first.
- Inspect the visible error popup or the log drawer.

### Build or tests fail after a rule change

- Update the engine and the tests together.
- Re-run `npm run test`.
- Re-run `npm run build`.
