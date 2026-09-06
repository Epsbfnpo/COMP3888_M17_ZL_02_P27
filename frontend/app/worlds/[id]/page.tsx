"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../api";

type World = {
  id: number;
  name: string;
  description?: string | null;
  visibility: string;
  role: string | null;
};

type Entity = {
  id: number;
  name: string;
  type: string;
  description: string | null;
  world: {
    id: number;
    name: string;
  };
};

export default function WorldPage() {
  const { id } = useParams();

  const [world, setWorld] = useState<World | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setError("");

      try {
        const { world: w } = await api<{ world: World }>(
          `/api/worlds/${id}`
        );

        setWorld(w);

        const entityResult = await api<{ results: Entity[] }>(
          `/api/entities/search?q=${encodeURIComponent(w.name)}`
        );

        const worldEntities = entityResult.results.filter(
          entity => Number(entity.world.id) === Number(w.id)
        );

        setEntities(worldEntities);
      } catch (e) {
        setWorld(null);
        setEntities([]);
        setError(
          e instanceof Error ? e.message : "Could not load world"
        );
      }
    }

    void load();
  }, [id]);

  return (
    <main className="search-page">
      <section className="search-content">
        <Link href="/home">← Back to worlds</Link>

        {error && (
          <p role="alert" className="message error">
            {error}
          </p>
        )}

        {!world ? (
          !error && <p>Loading world…</p>
        ) : (
          <>
            <section className="world-overview">
              <p className="step-label">World</p>

              <h1>{world.name}</h1>

              <div className="world-badges">
                <span className="world-badge">
                  {world.visibility}
                </span>

                <span className="world-badge">
                  {world.role || "visitor"}
                </span>
              </div>

              <div className="status-panel">
                <h2>About this world</h2>

                <p>
                  {world.description ||
                    "This world is waiting for its story."}
                </p>
              </div>
            </section>

            <section className="world-entities">
              <div className="section-heading-row">
                <div>
                  <p className="step-label">World content</p>
                  <h2>Entities</h2>
                </div>

                <Link
                  href={`/search?q=${encodeURIComponent(world.name)}`}
                >
                  Browse all entities →
                </Link>
              </div>

              <p>
                {entities.length === 1
                  ? "1 entity in this world"
                  : `${entities.length} entities in this world`}
              </p>

              {entities.length === 0 ? (
                <p className="status-panel">
                  No entities have been created in this world yet.
                </p>
              ) : (
                <div className="world-grid">
                  {entities.slice(0, 6).map(entity => (
                    <article
                      key={entity.id}
                      className="world-card"
                    >
                      <div className="world-card-topline">
                        <span>{entity.type}</span>
                      </div>

                      <h3>{entity.name}</h3>

                      <p>
                        {entity.description ||
                          "No description yet."}
                      </p>

                      <footer>
                        <Link
                          href={`/entities/${entity.id}?from=world`}
                        >
                          View entity →
                        </Link>
                      </footer>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="world-workspace-link">
              <div>
                <p className="step-label">Collaboration</p>
                <h2>World Workspace</h2>
                <p>
                  Manage this world, create proposals and collaborate with other members.
                </p>
              </div>

              <Link
                href={`/worlds/${world.id}/workspace?from=world`}
                className="workspace-button"
              >
                Open World Workspace →
              </Link>
            </section>
          </>
        )}
      </section>
    </main>
  );
}