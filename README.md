# Muzikku Shifter

Local multi-service library manager and playlist sync for accounts you connect yourself. Spotify, Apple Music, and YouTube stay empty until that service is authorized. There is no built-in sample library.

## Run locally

```powershell
cd D:\MuzikkuShifter
Copy-Item .env.example .env
npm install
npx prisma db push
npm run dev
```

Open http://localhost:3000. On Windows or macOS the same install steps apply; use `cp .env.example .env` if you are not in PowerShell.

`npm run test:logic` checks the matcher and duplicate rules against fixtures that live only in the test file. `npm run typecheck` runs `tsc --noEmit`.

## Connect a real account

OAuth needs this app’s developer credentials before a listener can sign in. Open Connections, save the values, and restart `npm run dev` if a Connect button still lists a variable as missing. The page writes `.env` and does not send secrets back to the browser.

- **Spotify.** Create an app at https://developer.spotify.com/dashboard. Set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`. Redirect URI: `{APP_URL}/api/auth/spotify/callback` (default `http://localhost:3000/api/auth/spotify/callback`). Connect Spotify starts the PKCE login. The app never asks for a Spotify password.
- **YouTube Music.** In Google Cloud, create an OAuth client and enable YouTube Data API v3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Redirect URI: `{APP_URL}/api/auth/youtube/callback`.
- **Apple Music.** A paid Apple Developer account is required. Create a MusicKit key and set `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` (PEM with `\n` escapes) or `APPLE_PRIVATE_KEY_PATH`. Connect uses MusicKit to obtain a Music User Token. If that browser step cannot finish, paste a user token issued for the same key. Missing Apple variables do not count as a connection.
- **TOKEN_ENCRYPTION_KEY.** Long random string, at least 16 characters. Refresh and access tokens are encrypted with AES-256-GCM before insert. The placeholder in `.env.example` is rejected.
- **APP_URL.** Public origin used to build the redirect URIs above.

## What to click

1. **Connections.** Save credentials, restart if needed, then connect a service.
2. **Playlists.** Choose playlists from the connected accounts. Save that working set as a preset.
3. **Deep Search.** Search title, artist, album, or ISRC inside the working set.
4. **Artists.** Counts are unique recordings in the working set.
5. **Deduplicator.** Scan the selected playlists, review copies, then confirm delete. Restore from Sync Engine → Snapshots.
6. **Sync Engine.** Create a task between two real playlists. Dry run, then Run now.

## Architecture

```
src/app                  pages and route handlers
src/components/glass     surfaces, nav, virtualized track grid, diff modal
src/lib/providers        MusicProviderAdapter, Spotify, Apple Music, YouTube
src/lib/matching         normalize, matchTrack, computePlaylistDiff
src/lib/duplicates       exact id and fuzzy clusters
src/lib/sync             plan, runner, in-process scheduler, snapshots
src/lib/crypto           AES-256-GCM token encryption
prisma/schema.prisma     sessions, connections, presets, tasks, runs, snapshots, reviews
```

`MusicProviderAdapter` is the extension point for Tidal, Deezer, or SoundCloud: implement the interface and call `registerProvider`. The scheduler is a single `setInterval` in `instrumentation.ts`. A Redis/BullMQ queue is optional later if you outgrow one Node process; nothing here requires it to boot.

## Docker

```powershell
docker compose up --build
```

The SQLite file is stored in the `muzikku-data` volume. Pass the same environment variables as `.env.example`.
