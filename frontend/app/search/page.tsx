"use client";

import { apiFetch, API_URL } from "../api";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";


type Entity = {
  id: number;
  name: string;
  type: string;
  description: string;
  tags: string[];
  world: { id: number; name: string };
};

export default function SearchPage() {
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (query: string, tag = "") => {
    setIsLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (tag) params.set("tag", tag);

    try {
      const response = await apiFetch(
        `${API_URL}/api/entities/search?${params.toString()}`
      );
      const data = (await response.json()) as {
        results?: Entity[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Could not search entities");
      }
      setEntities(data.results || []);
    } catch (searchError) {
      setEntities([]);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Could not search entities"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
    queueMicrotask(() => {
      setSearch(initialQuery);
      void runSearch(initialQuery);
    });

    async function loadTags() {
      try {
        const response = await apiFetch(`${API_URL}/api/tags`);
        const data = (await response.json()) as {
          tags?: string[];
        };
        if (response.ok) setAllTags(data.tags || []);
      } catch {
        setAllTags([]);
      }
    }

    void loadTags();

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [runSearch]);

  function updateSearchUrl(query: string) {
    window.history.replaceState(
      null,
      "",
      query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search"
    );
  }

  function scheduleSearch(query: string, tag: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      updateSearchUrl(query);
      void runSearch(query, tag);
    }, 300);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    scheduleSearch(value, selectedTag);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    updateSearchUrl(search);
    void runSearch(search, selectedTag);
  }

  function chooseTag(tag: string) {
    const nextTag = selectedTag === tag ? "" : tag;
    setSelectedTag(nextTag);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    void runSearch(search, nextTag);
  }

  return (
    <main className="search-page">
      <header className="search-header">
        <Link href="/home" className="brand-link">
          <strong>Worldbuilding</strong>
          <span>Collaborative world atlas</span>
        </Link>
        <Link href="/home">Home</Link>
      </header>

      <section className="search-content">
        <p className="eyebrow">Explore the world</p>
        <h1>Search world entities</h1>
        <p className="search-intro">
          Discover characters, locations, nations and stories across every
          shared world.
        </p>

        <form className="search-form" onSubmit={handleSubmit} role="search">
          <label className="sr-only" htmlFor="entity-search">Search entities</label>
          <input
            id="entity-search"
            type="search"
            placeholder="Search characters, locations, lore or tags…"
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
          />
          <button type="submit">Search</button>
        </form>

        {allTags.length > 0 && (
          <div className="tag-filter" aria-label="Filter by tag">
            <button
              type="button"
              className={selectedTag === "" ? "active" : ""}
              onClick={() => chooseTag("")}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                type="button"
                className={selectedTag === tag ? "active" : ""}
                key={tag}
                onClick={() => chooseTag(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        <div className="results-heading">
          <h2>Search results</h2>
          {!isLoading && <span>{entities.length} results</span>}
        </div>

        {isLoading && <p className="status-panel">Searching entities…</p>}
        {error && (
          <p className="status-panel error" role="alert">
            {error}. Make sure the backend is running and the worldbuilding
            schema has been imported.
          </p>
        )}
        {!isLoading && !error && entities.length === 0 && (
          <p className="status-panel">No matching entities were found.</p>
        )}

        <div className="entity-list">
          {entities.map((entity) => (
            <Link
              href={`/entities/${entity.id}`}
              className="entity-card-link"
              key={entity.id}
            >
              <article className="entity-card">
                <div className="entity-meta">
                  <span>{entity.type.replaceAll("_", " ")}</span>
                  <span>{entity.world.name}</span>
                </div>

                <h3>{entity.name}</h3>

                <p>
                  {entity.description || "No description has been added yet."}
                </p>
              </article>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
