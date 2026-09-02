"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = "http://localhost:3001";

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
};

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedUser = window.localStorage.getItem("worldbuilding-user");

    if (!storedUser) {
      router.replace("/");
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser) as StoredUser;
      queueMicrotask(() => setUser(parsedUser));
    } catch {
      window.localStorage.removeItem("worldbuilding-user");
      router.replace("/");
      return;
    }

    async function loadWorlds() {
      try {
        const response = await fetch(`${API_URL}/api/worlds`);
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

  function signOut() {
    window.localStorage.removeItem("worldbuilding-user");
    router.push("/");
  }

  if (!user) {
    return <main className="app-loading">Loading your worldbuilding space…</main>;
  }

  return (
    <main className="home-page">
      <header className="home-header">
        <Link className="user-link" href="/profile">
          <span className="user-label">Signed in as</span>
          <strong>{user.username}</strong>
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
            No worlds have been created yet. Add one to the database to see it
            here.
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
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </footer>
    </main>
  );
}
