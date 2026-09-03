"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = "http://localhost:3001";

type StoredUser = {
  id: number;
  username: string;
  email: string;
  created_at?: string;
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

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<StoredUser | null>(null);
  const [myWorlds, setMyWorlds] = useState<World[]>([]);
  const [isLoadingWorlds, setIsLoadingWorlds] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedUser = window.localStorage.getItem("worldbuilding-user");

    if (!storedUser) {
      router.replace("/");
      return;
    }

    let parsedUser: StoredUser;

    try {
      parsedUser = JSON.parse(storedUser) as StoredUser;
      setUser(parsedUser);
    } catch {
      window.localStorage.removeItem("worldbuilding-user");
      router.replace("/");
      return;
    }

    async function loadMyWorlds() {
      try {
        const response = await fetch(`${API_URL}/api/worlds`);

        const data = (await response.json()) as {
          worlds?: World[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Could not load worlds");
        }

        const ownedWorlds = (data.worlds || []).filter(
          (world) => Number(world.owner_id) === Number(parsedUser.id)
        );

        setMyWorlds(ownedWorlds);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load worlds"
        );
      } finally {
        setIsLoadingWorlds(false);
      }
    }

    void loadMyWorlds();
  }, [router]);

  function signOut() {
    window.localStorage.removeItem("worldbuilding-user");
    router.push("/");
  }

  if (!user) {
    return <main className="app-loading">Loading profile…</main>;
  }

  const initial = user.username.charAt(0).toUpperCase();

  return (
    <main className="profile-dashboard">
      <header className="profile-header">
        <Link href="/home" className="profile-brand">
          <span>AI-assisted</span>
          <strong>Worldbuilding Platform</strong>
        </Link>

        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </header>

      <div className="profile-content">
        <section className="profile-summary">
          <div className="profile-avatar" aria-hidden="true">
            {initial}
          </div>

          <div className="profile-summary-text">
            <p className="eyebrow">Worldbuilder profile</p>
            <h1>{user.username}</h1>
            <p className="profile-email">{user.email}</p>
          </div>
        </section>

        <section className="profile-info-grid">
          <article className="profile-info-card">
            <span>Member since</span>
            <strong>
              {user.created_at
                ? new Date(user.created_at).toLocaleDateString("en-AU")
                : "Not available"}
            </strong>
          </article>

          <article className="profile-info-card">
            <span>User ID</span>
            <strong>#{user.id}</strong>
          </article>

          <article className="profile-info-card">
            <span>Worlds owned</span>
            <strong>{myWorlds.length}</strong>
          </article>
        </section>

        <section className="profile-worlds">
          <div className="profile-section-heading">
            <div>
              <p className="step-label">Your creations</p>
              <h2>My Worlds</h2>
            </div>

            <Link href="/home">Browse all worlds</Link>
          </div>

          {isLoadingWorlds && (
            <p className="status-panel">Loading your worlds…</p>
          )}

          {error && (
            <p className="status-panel error" role="alert">
              {error}
            </p>
          )}

          {!isLoadingWorlds && !error && myWorlds.length === 0 && (
            <p className="status-panel">
              You do not own any worlds yet.
            </p>
          )}

          <div className="world-grid">
            {myWorlds.map((world) => (
              <article className="world-card" key={world.id}>
                <div className="world-card-topline">
                  <span>{Number(world.entity_count)} entities</span>

                  <span>
                    {new Date(world.updated_at).toLocaleDateString("en-AU")}
                  </span>
                </div>

                <h3>{world.name}</h3>

                <p>
                  {world.description ||
                    "This world is waiting for its story."}
                </p>

                <footer>
                  <span>Owned by you</span>

                  <Link
                    href={`/search?q=${encodeURIComponent(world.name)}`}
                  >
                    Explore →
                  </Link>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <div className="profile-back">
          <Link href="/home">← Back to home</Link>
        </div>
      </div>
    </main>
  );
}