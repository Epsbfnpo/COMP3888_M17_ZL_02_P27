USE worldbuilding;

-- =========================================================
-- 1. WORLDS
-- Each fictional world has one owner.
-- =========================================================

CREATE TABLE IF NOT EXISTS worlds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    owner_id INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (owner_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);


-- =========================================================
-- 2. WORLD MEMBERS
-- Users can request to become contributors to a world.
-- =========================================================

CREATE TABLE IF NOT EXISTS world_members (
    id INT AUTO_INCREMENT PRIMARY KEY,

    world_id INT NOT NULL,
    user_id INT NOT NULL,

    role ENUM(
        'owner',
        'contributor'
    ) NOT NULL DEFAULT 'contributor',

    status ENUM(
        'pending',
        'approved',
        'rejected'
    ) NOT NULL DEFAULT 'pending',

    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (world_id)
        REFERENCES worlds(id)
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    UNIQUE KEY unique_world_member (world_id, user_id)
);


-- =========================================================
-- 3. ENTITIES
-- Main worldbuilding objects.
-- Examples:
-- character, nation, location, organisation, historical event
-- =========================================================

CREATE TABLE IF NOT EXISTS entities (
    id INT AUTO_INCREMENT PRIMARY KEY,

    world_id INT NOT NULL,

    entity_type ENUM(
        'character',
        'location',
        'nation',
        'organisation',
        'historical_event',
        'item',
        'other'
    ) NOT NULL,

    name VARCHAR(150) NOT NULL,
    description TEXT,

    created_by INT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (world_id)
        REFERENCES worlds(id)
        ON DELETE CASCADE,

    FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    INDEX idx_entity_world (world_id),
    INDEX idx_entity_type (entity_type),
    INDEX idx_entity_name (name)
);


-- =========================================================
-- 4. RELATIONSHIPS
-- This is the core of the structured knowledge base.
--
-- Example:
-- Character A --FRIEND_OF--> Character B
-- Character A --BELONGS_TO--> Nation A
-- Event A --INVOLVES--> Character A
-- =========================================================

CREATE TABLE IF NOT EXISTS relationships (
    id INT AUTO_INCREMENT PRIMARY KEY,

    world_id INT NOT NULL,

    source_entity_id INT NOT NULL,
    target_entity_id INT NOT NULL,

    relationship_type VARCHAR(100) NOT NULL,

    description TEXT,

    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (world_id)
        REFERENCES worlds(id)
        ON DELETE CASCADE,

    FOREIGN KEY (source_entity_id)
        REFERENCES entities(id)
        ON DELETE CASCADE,

    FOREIGN KEY (target_entity_id)
        REFERENCES entities(id)
        ON DELETE CASCADE,

    FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    INDEX idx_relationship_world (world_id),
    INDEX idx_relationship_source (source_entity_id),
    INDEX idx_relationship_target (target_entity_id),
    INDEX idx_relationship_type (relationship_type),

    UNIQUE KEY unique_relationship (
        source_entity_id,
        target_entity_id,
        relationship_type
    )
);


-- =========================================================
-- 5. TAGS
-- Frank confirmed that basic tag search is sufficient.
-- =========================================================

CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,

    name VARCHAR(50) NOT NULL UNIQUE
);


-- Many-to-many relationship:
-- one entity can have many tags
-- one tag can belong to many entities

CREATE TABLE IF NOT EXISTS entity_tags (
    entity_id INT NOT NULL,
    tag_id INT NOT NULL,

    PRIMARY KEY (entity_id, tag_id),

    FOREIGN KEY (entity_id)
        REFERENCES entities(id)
        ON DELETE CASCADE,

    FOREIGN KEY (tag_id)
        REFERENCES tags(id)
        ON DELETE CASCADE
);


-- =========================================================
-- 6. CONTRIBUTIONS
-- GitHub-style contribution workflow.
--
-- Contributor proposes:
-- create / edit / delete
--
-- Owner can:
-- approve / reject
-- =========================================================

CREATE TABLE IF NOT EXISTS contributions (
    id INT AUTO_INCREMENT PRIMARY KEY,

    world_id INT NOT NULL,

    -- NULL is allowed when proposing creation of a new entity
    entity_id INT NULL,

    contributor_id INT NOT NULL,

    action_type ENUM(
        'create',
        'edit',
        'delete'
    ) NOT NULL,

    -- Stores the proposed new data
    proposed_content JSON NOT NULL,

    status ENUM(
        'pending',
        'approved',
        'rejected'
    ) NOT NULL DEFAULT 'pending',

    reviewed_by INT NULL,

    review_comment TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,

    FOREIGN KEY (world_id)
        REFERENCES worlds(id)
        ON DELETE CASCADE,

    FOREIGN KEY (entity_id)
        REFERENCES entities(id)
        ON DELETE CASCADE,

    FOREIGN KEY (contributor_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (reviewed_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    INDEX idx_contribution_world (world_id),
    INDEX idx_contribution_status (status),
    INDEX idx_contribution_user (contributor_id)
);