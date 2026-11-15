"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { PageHeader } from "@/components/glass/PageHeader";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { IconTile, providerTone } from "@/components/glass/ArtTile";
import { useWorkspace } from "@/components/shell/Workspace";
import { api } from "@/lib/client-api";
import { Link2, Music2, Tv } from "lucide-react";

const FIELDS: { key: FieldKey; label: string; secret?: boolean; multiline?: boolean; hint?: string }[] = [
  { key: "APP_URL", label: "APP_URL", hint: "Public origin, no trailing slash. Redirects are built from this." },
  { key: "TOKEN_ENCRYPTION_KEY", label: "TOKEN_ENCRYPTION_KEY", secret: true, hint: "Random string, 16+ characters. Used to encrypt tokens at rest." },
  { key: "SPOTIFY_CLIENT_ID", label: "SPOTIFY_CLIENT_ID" },
  { key: "SPOTIFY_CLIENT_SECRET", label: "SPOTIFY_CLIENT_SECRET", secret: true },
  { key: "GOOGLE_CLIENT_ID", label: "GOOGLE_CLIENT_ID" },
  { key: "GOOGLE_CLIENT_SECRET", label: "GOOGLE_CLIENT_SECRET", secret: true },
  { key: "APPLE_TEAM_ID", label: "APPLE_TEAM_ID" },
  { key: "APPLE_KEY_ID", label: "APPLE_KEY_ID" },
  { key: "APPLE_PRIVATE_KEY", label: "APPLE_PRIVATE_KEY", secret: true, multiline: true, hint: "MusicKit .p8 contents. Stored in .env, never shown again." },
  { key: "APPLE_PRIVATE_KEY_PATH", label: "APPLE_PRIVATE_KEY_PATH", hint: "Optional path to the .p8 file instead of pasting it." },
];

type FieldKey =
  | "APP_URL"
  | "TOKEN_ENCRYPTION_KEY"
  | "SPOTIFY_CLIENT_ID"
  | "SPOTIFY_CLIENT_SECRET"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "APPLE_TEAM_ID"
  | "APPLE_KEY_ID"
  | "APPLE_PRIVATE_KEY"
  | "APPLE_PRIVATE_KEY_PATH";

export default function ConnectionsPage() {
  const workspace = useWorkspace();
  const [notice, setNotice] = useState("");
  const [userToken, setUserToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<FieldKey, string>>>({});
  const status = workspace.status;
  const present = new Set(status?.present ?? []);

  async function saveSetup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const body: Partial<Record<FieldKey, string>> = {};
      for (const field of FIELDS) {
        const value = draft[field.key]?.trim();
        if (value) body[field.key] = value;
      }
      if (Object.keys(body).length === 0) {
        setNotice("Enter a value to save. Saved secrets stay on the server and are not shown again.");
        return;
      }
      await api("/api/setup", { method: "POST", body: JSON.stringify(body) });
      setDraft({});
      setNotice("Saved to .env. This process will use the new values. Restart npm run dev if Connect still reports a missing variable.");
      await workspace.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function connectApple() {
    if (!status?.providers.apple.ready) return;
    setBusy(true);
    setNotice("");
    try {
      const dev = await api<{ token: string }>("/api/apple/developer-token");
      await loadMusicKit();
      if (!window.MusicKit) throw new Error("MusicKit did not load.");
      await window.MusicKit.configure({
        developerToken: dev.token,
        app: { name: "Muzikku Shifter", build: "1.0.0" },
      });
      const user = await window.MusicKit.getInstance().authorize();
      if (!user) throw new Error("Apple did not return a Music User Token.");
      await api("/api/apple/user-token", { method: "POST", body: JSON.stringify({ userToken: user }) });
      setNotice("Apple Music connected.");
      await workspace.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Apple Music connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function pasteApple() {
    if (!status?.providers.apple.ready) return;
    setBusy(true);
    try {
      await api("/api/apple/user-token", { method: "POST", body: JSON.stringify({ userToken }) });
      setNotice("Apple Music user token stored.");
      setUserToken("");
      await workspace.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not store the user token.");
    } finally {
      setBusy(false);
    }
  }

  const connected = new Map((status?.connections || []).map((connection) => [connection.provider, connection]));
  const spotifyRedirect = status?.redirects.spotify || "http://localhost:3000/api/auth/spotify/callback";
  const youtubeRedirect = status?.redirects.youtube || "http://localhost:3000/api/auth/youtube/callback";

  return (
    <div>
      <PageHeader
        kicker="Accounts"
        title="Connections"
        subtitle="Sign-in uses each service’s OAuth or MusicKit flow. You need this app’s developer credentials first. Your streaming password is never collected."
      />
      {notice ? <p className="mb-4 text-[14px] text-[var(--text-dim)]">{notice}</p> : null}

      <GlassSurface className="mb-4">
        <form className="space-y-4 p-4" onSubmit={(event) => void saveSetup(event)}>
          <div>
            <h2 className="text-[18px] font-semibold">App credentials</h2>
            <p className="mt-1 text-[13px] leading-snug text-[var(--text-dim)]">
              These belong to your developer apps, not to a listener account. Values are written to the local .env file and masked after save. Nothing secret is sent back to the browser.
            </p>
            {status?.missing.length ? (
              <p className="mt-2 text-[13px] text-[var(--warn)]">Missing: {status.missing.join(", ")}</p>
            ) : (
              <p className="mt-2 text-[13px] text-[var(--good)]">Every listed variable is set.</p>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.key} className="block text-[13px] text-[var(--muted)]">
                <span className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--text)]">{field.label}</span>
                  {present.has(field.key) || (field.key === "APPLE_PRIVATE_KEY" && present.has("APPLE_PRIVATE_KEY")) ? (
                    <span>Saved</span>
                  ) : null}
                </span>
                {field.multiline ? (
                  <textarea
                    className="field min-h-28"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={present.has(field.key) ? "Saved. Paste a new key to replace it." : "Paste the .p8 PEM"}
                    value={draft[field.key] || ""}
                    onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                ) : (
                  <input
                    className="field mt-1"
                    type={field.secret ? "password" : "text"}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={present.has(field.key) ? "Saved. Enter a new value to replace it." : field.label}
                    value={draft[field.key] || ""}
                    onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                )}
                {field.hint ? <span className="mt-1 block text-[12px]">{field.hint}</span> : null}
              </label>
            ))}
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>Save to .env</button>
        </form>
      </GlassSurface>

      <div className="grid gap-3 lg:grid-cols-3">
        <ServiceCard
          title="Spotify"
          icon={<Music2 size={18} />}
          tone={providerTone("spotify")}
          ready={Boolean(status?.providers.spotify.ready)}
          account={connected.get("spotify")?.displayName}
          href="/api/auth/spotify"
          missing={status?.providers.spotify.missing ?? ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"]}
          note={`Create an app at https://developer.spotify.com/dashboard. Add redirect URI ${spotifyRedirect}. Connect starts Spotify’s PKCE login. There is no password field.`}
        />
        <GlassSurface>
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <IconTile tone={providerTone("apple")}><Music2 size={18} /></IconTile>
              <div>
                <h2 className="text-[18px] font-semibold">Apple Music</h2>
                <p className="text-[13px] text-[var(--muted)]">{connected.get("apple")?.displayName || (status?.providers.apple.ready ? "Developer key can be signed" : "Credentials missing")}</p>
              </div>
            </div>
            <p className="text-[13px] leading-snug text-[var(--text-dim)]">
              A paid Apple Developer account is required. Create a MusicKit key and save Team ID, Key ID, and the .p8 private key. Connect asks Apple for a Music User Token through MusicKit. If that browser step fails, paste a user token issued for this same key. A missing key is never treated as a successful connection.
            </p>
            {status?.providers.apple.missing.length ? (
              <p className="text-[13px] text-[var(--warn)]">Missing: {status.providers.apple.missing.join(", ")}</p>
            ) : null}
            <button className="btn btn-primary" disabled={busy || !status?.providers.apple.ready} onClick={() => void connectApple()}>
              {status?.providers.apple.ready ? "Connect with MusicKit" : "Add Apple credentials first"}
            </button>
            <input
              className="field"
              placeholder="Music User Token"
              value={userToken}
              autoComplete="off"
              disabled={!status?.providers.apple.ready}
              onChange={(event) => setUserToken(event.target.value)}
            />
            <button className="btn" disabled={busy || !userToken.trim() || !status?.providers.apple.ready} onClick={() => void pasteApple()}>Save token</button>
            {connected.get("apple") ? <button className="btn" onClick={() => void api("/api/connections/apple", { method: "DELETE" }).then(() => workspace.refresh())}>Disconnect</button> : null}
          </div>
        </GlassSurface>
        <ServiceCard
          title="YouTube Music"
          icon={<Tv size={18} />}
          tone={providerTone("youtube")}
          ready={Boolean(status?.providers.youtube.ready)}
          account={connected.get("youtube")?.displayName}
          href="/api/auth/youtube"
          missing={status?.providers.youtube.missing ?? ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"]}
          note={`In Google Cloud, create an OAuth client, enable YouTube Data API v3, and add redirect URI ${youtubeRedirect}. Connect starts Google’s OAuth flow. There is no password field.`}
        />
      </div>
      <p className="mt-4 flex items-center gap-2 text-[13px] text-[var(--muted)]"><Link2 size={14} /> Tidal, Deezer, and SoundCloud plug in through MusicProviderAdapter and registerProvider.</p>
    </div>
  );
}

function ServiceCard({
  title,
  icon,
  tone,
  ready,
  account,
  href,
  missing,
  note,
}: {
  title: string;
  icon: ReactNode;
  tone: string;
  ready: boolean;
  account?: string | null;
  href: string;
  missing: string[];
  note: string;
}) {
  const provider = title === "Spotify" ? "spotify" : "youtube";
  const workspace = useWorkspace();
  return (
    <GlassSurface>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <IconTile tone={tone}>{icon}</IconTile>
          <div>
            <h2 className="text-[18px] font-semibold">{title}</h2>
            <p className="text-[13px] text-[var(--muted)]">{account || (ready ? "Ready to connect" : "Credentials missing")}</p>
          </div>
        </div>
        <p className="text-[13px] leading-snug text-[var(--text-dim)]">{note}</p>
        {!ready ? <p className="text-[13px] text-[var(--warn)]">Missing: {missing.join(", ")}</p> : null}
        {ready ? <a className="btn btn-primary inline-flex" href={href}>Connect {title === "YouTube Music" ? "YouTube" : title}</a> : <button className="btn" disabled>Connect {title === "YouTube Music" ? "YouTube" : title}</button>}
        {account ? <button className="btn" onClick={() => void api(`/api/connections/${provider}`, { method: "DELETE" }).then(() => workspace.refresh())}>Disconnect</button> : null}
      </div>
    </GlassSurface>
  );
}

function loadMusicKit() {
  if (window.MusicKit) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load MusicKit."));
    document.body.appendChild(script);
  });
}
