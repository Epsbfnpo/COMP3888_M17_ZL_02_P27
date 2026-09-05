"use client";

import { apiFetch, api, API_URL } from "../api";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";


type StoredUser = {
  id: number;
  username: string;
  email: string;
};

type World = {
  id: number;
  name: string;
  description: string | null;
  updated_at: string;
  owner_id: number;
  owner_username: string;
  entity_count: number;
  visibility: "public" | "private";
  access_role: string | null;
};

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [worldName, setWorldName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadWorlds() {
      try {
        const sessionResponse = await apiFetch(`${API_URL}/auth/me`);
        if (sessionResponse.ok) {
          const session = await sessionResponse.json() as { user: StoredUser };
          setUser(session.user);
        } else if (sessionResponse.status !== 401) {
          throw new Error('Could not check your session');
        }
        const response = await apiFetch(`${API_URL}/api/worlds`);
        const data = (await response.json()) as {
          worlds?: World[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Could not load worlds");
        }

        setWorlds(data.worlds || []);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load worlds"
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadWorlds();
  }, [router]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    router.push(
      trimmedQuery ? `/search?q=${encodeURIComponent(trimmedQuery)}` : "/search"
    );
  }

  async function signOut() {
    try {
      await api('/logout', 'POST');
      window.localStorage.removeItem('worldbuilding-user');
      router.push('/');
    } catch { setError('Could not sign out. Please try again.'); }
  }

  return (
    <main className="home-page">
      <header className="home-header">
        <Link className="user-link" href={user ? "/profile" : "/"}>
          <span className="user-label">{user ? "Signed in as" : "Public atlas"}</span>
          <strong>{user?.username || "Sign in"}</strong>
        </Link>

        <form className="header-search" onSubmit={handleSearch} role="search">
          <label className="sr-only" htmlFor="world-search">
            Search world entities
          </label>
          <input
            id="world-search"
            type="search"
            placeholder="Search worlds, characters, places…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit">Search</button>
        </form>
      </header>

      <section className="home-hero">
        <p className="eyebrow">Your collaborative atlas</p>
        <h1>Explore worlds shaped together.</h1>
        <p>
          Discover settings, characters and histories created by the community.
        </p>
      </section>

      <section className="world-section" aria-labelledby="worlds-title">
        {user && <form onSubmit={event => {
          event.preventDefault(); setCreating(true); setError('');
          void api<{ world: { id: number } }>('/api/worlds', 'POST', { name: worldName })
            .then(result => router.push(`/worlds/${result.world.id}`))
            .catch(e => setError(e instanceof Error ? e.message : 'Could not create world'))
            .finally(() => setCreating(false));
        }}>
          <label htmlFor="new-world">Create a private world</label>
          <input id="new-world" maxLength={150} required value={worldName} onChange={e => setWorldName(e.target.value)} placeholder="World name" />
          <button disabled={creating}>Create world</button>
        </form>}
        <div className="section-heading-row">
          <div>
            <p className="step-label">Community library</p>
            <h2 id="worlds-title">Existing worlds</h2>
          </div>
          <Link href="/search">Browse all entities</Link>
        </div>

        {isLoading && <p className="status-panel">Loading worlds…</p>}
        {error && (
          <p className="status-panel error" role="alert">
            {error}. Make sure the backend is running and the worldbuilding
            schema has been imported.
          </p>
        )}
        {!isLoading && !error && worlds.length === 0 && (
          <p className="status-panel">
            No worlds are available to you yet.
          </p>
        )}

        <div className="world-grid">
          {worlds.map((world) => (
            <article className="world-card" key={world.id}>
              <div className="world-card-topline">
                <span>{Number(world.entity_count)} entities</span>
                <span>
                  {new Date(world.updated_at).toLocaleDateString("en-AU")}
                </span>
              </div>
              <h3>{world.name}</h3>
              <span>{world.visibility} · {world.access_role || "visitor"}</span>
              <Link href={`/worlds/${world.id}`}>Open world workspace</Link>
              <p>{world.description || "This world is waiting for its story."}</p>
              <footer>
                <span>Created by {world.owner_username}</span>
                <Link href={`/search?q=${encodeURIComponent(world.name)}`}>
                  Explore →
                </Link>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <footer className="home-footer">
        <span>AI-assisted collaborative worldbuilding</span>
        {user && <button type="button" onClick={signOut}>
          Sign out
        </button>}
      </footer>
    </main>
  );
}
