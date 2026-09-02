"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_URL = "http://localhost:3001";

type Entity = {
  id: number;
  name: string;
  type: string;
  description: string;
  created_at: string;
  updated_at: string;

  world: {
    id: number;
    name: string;
  };

  creator: {
    id: number;
    username: string;
  } | null;

  tags: string[];

  relationships: {
    id: number;
    type: string;
    description: string;
    direction: "incoming" | "outgoing";

    entity: {
        id: number;
        name: string;
        type: string;
    };
  }[];

};

function getRelationshipLabel(
  type: string,
  direction: "incoming" | "outgoing"
) {
  const labels: Record<string, { outgoing: string; incoming: string }> = {
    OWNS: {
      outgoing: "OWNS",
      incoming: "OWNED BY",
    },

    BELONGS_TO: {
      outgoing: "BELONGS TO",
      incoming: "HAS",
    },

    RULES: {
      outgoing: "RULES",
      incoming: "RULED BY",
    },

    LOCATED_IN: {
      outgoing: "LOCATED IN",
      incoming: "CONTAINS",
    },

    PARENT_OF: {
      outgoing: "PARENT OF",
      incoming: "CHILD OF",
    },
  };

  const relationship = labels[type];

  if (relationship) {
    return relationship[direction];
  }

  return type.replaceAll("_", " ");
}

export default function EntityPage() {
  const params = useParams();
  const id = params.id;

  const [entity, setEntity] = useState<Entity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEntity() {
      try {
        const response = await fetch(`${API_URL}/api/entities/${id}`);

        const data = (await response.json()) as {
          entity?: Entity;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Could not load entity");
        }

        setEntity(data.entity || null);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load entity"
        );
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      void loadEntity();
    }
  }, [id]);

  if (isLoading) {
    return (
      <main className="search-page">
        <p className="status-panel">Loading entity…</p>
      </main>
    );
  }

  if (error || !entity) {
    return (
      <main className="search-page">
        <p className="status-panel error">
          {error || "Entity not found"}
        </p>

        <Link href="/search">Back to search</Link>
      </main>
    );
  }

  return (
    <main className="search-page">
      <header className="search-header">
        <Link href="/home" className="brand-link">
          <strong>Worldbuilding</strong>
          <span>Collaborative world atlas</span>
        </Link>

        <Link href="/search">Search</Link>
      </header>

      <section className="search-content">
        <Link href="/search" className="entity-back-link">
            ← Back to search
         </Link>

        <div className="entity-title-block">
            <p className="eyebrow">
                {entity.type.replaceAll("_", " ")}
            </p>

            <h1>{entity.name}</h1>
        </div>

        <p className="search-intro">
          {entity.description || "No description has been added yet."}
        </p>

        <div className="entity-card">
            <div className="entity-meta">
                <span>World</span>
                <span>{entity.world.name}</span>
            </div>

            {entity.creator && (
                <p>
                Created by <strong>{entity.creator.username}</strong>
                {" · "}
                {new Date(entity.created_at).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                })}
                </p>
            )}

            {entity.tags.length > 0 && (
                <div className="entity-tags">
                {entity.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                ))}
                </div>
            )}

            {entity.relationships.length > 0 && (
                <section className="entity-relationships">
                <p className="eyebrow">Relationships</p>

                <div className="relationship-list">
                    {entity.relationships.map((relationship) => {
                    const relationshipLabel = getRelationshipLabel(
                        relationship.type,
                        relationship.direction
                    );

                    return (
                        <Link
                        href={`/entities/${relationship.entity.id}`}
                        className="relationship-card"
                        key={relationship.id}
                        >
                        <div>
                            <span className="relationship-type">
                            {relationshipLabel}
                            </span>

                            <h3>{relationship.entity.name}</h3>

                            <span className="relationship-entity-type">
                            {relationship.entity.type.replaceAll("_", " ")}
                            </span>
                        </div>

                        <span className="relationship-arrow">→</span>
                        </Link>
                    );
                    })}
                </div>
                </section>
            )}
            </div>
    </section>
    </main>
  );
}