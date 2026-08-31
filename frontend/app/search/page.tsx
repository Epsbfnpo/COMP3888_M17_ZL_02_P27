"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Entity = {
  id: number;
  name: string;
  type: string;
  description: string;
  tags: string[];
};

const sampleEntities: Entity[] = [
  {
    id: 1,
    name: "Dragon King",
    type: "Character",
    description: "The ruler of the northern dragon kingdom.",
    tags: ["Dragon", "King", "Fire"],
  },
  {
    id: 2,
    name: "Dragon Mountain",
    type: "Location",
    description: "A dangerous mountain inhabited by dragons.",
    tags: ["Dragon", "Mountain", "Dangerous"],
  },
  {
    id: 3,
    name: "Silver Kingdom",
    type: "Nation",
    description: "A powerful kingdom in the western continent.",
    tags: ["Kingdom", "Human", "Magic"],
  },
  {
    id: 4,
    name: "The Dragon War",
    type: "Lore",
    description: "A historical war between humans and dragons.",
    tags: ["Dragon", "War", "History"],
  },
];

export default function SearchPage() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");

  const allTags = Array.from(
    new Set(sampleEntities.flatMap((entity) => entity.tags))
  );

  const filteredEntities = sampleEntities.filter((entity) => {
    const keyword = search.toLowerCase().trim();

    const matchesSearch =
      entity.name.toLowerCase().includes(keyword) ||
      entity.description.toLowerCase().includes(keyword) ||
      entity.type.toLowerCase().includes(keyword) ||
      entity.tags.some((tag) =>
        tag.toLowerCase().includes(keyword)
      );

    const matchesTag =
      selectedTag === "" || entity.tags.includes(selectedTag);

    return matchesSearch && matchesTag;
  });

  function openEntity(entity: Entity) {
    router.push(`/entity/${entity.id}`);
  }

  function selectTag(tag: string) {
    setSelectedTag(selectedTag === tag ? "" : tag);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f1e8",
        color: "#1f2d24",
      }}
    >
      {/* Header */}
      <header
        style={{
          backgroundColor: "#294f39",
          color: "#f5f1e8",
          padding: "22px 8%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontFamily: "Georgia, serif",
              fontSize: "26px",
            }}
          >
            Worldbuilding
          </h2>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: "12px",
              letterSpacing: "2px",
              color: "#d8c28f",
            }}
          >
            AI-ASSISTED COLLABORATIVE WORLDBUILDING
          </p>
        </div>

        <button
          onClick={() => router.push("/")}
          style={{
            border: "1px solid #d8c28f",
            background: "transparent",
            color: "#f5f1e8",
            padding: "9px 18px",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Home
        </button>
      </header>

      <section
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          padding: "55px 24px",
        }}
      >
        {/* Title */}
        <p
          style={{
            color: "#9c772d",
            fontSize: "13px",
            letterSpacing: "3px",
            fontWeight: "bold",
            marginBottom: "8px",
          }}
        >
          EXPLORE THE WORLD
        </p>

        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "44px",
            margin: "0 0 12px",
          }}
        >
          Search World Entities
        </h1>

        <p
          style={{
            color: "#66736a",
            fontSize: "17px",
            marginBottom: "32px",
          }}
        >
          Discover characters, locations, nations and stories across the world.
        </p>

        {/* Search Bar */}
        <div
          style={{
            position: "relative",
            marginBottom: "35px",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: "18px",
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: "20px",
            }}
          >
            🔍
          </span>

          <input
            type="text"
            placeholder="Search characters, locations, lore or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "17px 20px 17px 52px",
              fontSize: "16px",
              border: "1px solid #cfc8b9",
              borderRadius: "7px",
              backgroundColor: "#fffdf7",
              outline: "none",
            }}
          />
        </div>

        {/* Tags */}
        <div style={{ marginBottom: "40px" }}>
          <h3
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "22px",
              marginBottom: "16px",
            }}
          >
            Browse by Tag
          </h3>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setSelectedTag("")}
              style={{
                padding: "9px 17px",
                borderRadius: "20px",
                cursor: "pointer",
                border: "1px solid #345a43",
                backgroundColor:
                  selectedTag === "" ? "#345a43" : "transparent",
                color:
                  selectedTag === "" ? "#ffffff" : "#345a43",
                fontWeight: "600",
              }}
            >
              All
            </button>

            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => selectTag(tag)}
                style={{
                  padding: "9px 17px",
                  borderRadius: "20px",
                  cursor: "pointer",
                  border: "1px solid #345a43",
                  backgroundColor:
                    selectedTag === tag
                      ? "#345a43"
                      : "transparent",
                  color:
                    selectedTag === tag
                      ? "#ffffff"
                      : "#345a43",
                  fontWeight: "600",
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "18px",
          }}
        >
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "28px",
              margin: 0,
            }}
          >
            Search Results
          </h2>

          <span style={{ color: "#737c75" }}>
            {filteredEntities.length} results
          </span>
        </div>

        {/* No Result */}
        {filteredEntities.length === 0 && (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              border: "1px solid #d8d2c6",
              borderRadius: "8px",
              backgroundColor: "#fffdf7",
            }}
          >
            <h3>No results found</h3>

            <p style={{ color: "#737c75" }}>
              Try another keyword or select a different tag.
            </p>
          </div>
        )}

        {/* Entity Cards */}
        {filteredEntities.map((entity) => (
          <div
            key={entity.id}
            onClick={() => openEntity(entity)}
            style={{
              backgroundColor: "#fffdf7",
              border: "1px solid #d8d2c6",
              padding: "24px",
              marginBottom: "16px",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "20px",
              }}
            >
              <div>
                <span
                  style={{
                    color: "#9c772d",
                    fontSize: "12px",
                    fontWeight: "bold",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                  }}
                >
                  {entity.type}
                </span>

                <h3
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "25px",
                    margin: "6px 0 9px",
                  }}
                >
                  {entity.name}
                </h3>

                <p
                  style={{
                    color: "#66736a",
                    margin: "0 0 17px",
                    lineHeight: "1.6",
                  }}
                >
                  {entity.description}
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  {entity.tags.map((tag) => (
                    <span
                      key={tag}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectTag(tag);
                      }}
                      style={{
                        padding: "5px 10px",
                        backgroundColor: "#edf0e9",
                        color: "#345a43",
                        borderRadius: "15px",
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <span
                style={{
                  color: "#345a43",
                  fontSize: "24px",
                }}
              >
                →
              </span>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}