-- Run once after schema.sql and worldbuilding_schema.sql. Back up first.
ALTER TABLE worlds ADD COLUMN visibility ENUM('private','public') NOT NULL DEFAULT 'private';
ALTER TABLE world_members MODIFY role ENUM('owner','contributor','manager','author','reader') NOT NULL DEFAULT 'author';
UPDATE world_members SET role = 'author' WHERE role = 'contributor';
UPDATE world_members SET role = 'manager' WHERE role = 'owner';
ALTER TABLE world_members MODIFY role ENUM('manager','author','reader') NOT NULL DEFAULT 'author';
ALTER TABLE entities ADD COLUMN version INT NOT NULL DEFAULT 1,
 ADD COLUMN body JSON NULL, ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE contributions MODIFY status ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft',
 ADD COLUMN base_version INT NULL, ADD COLUMN revision INT NOT NULL DEFAULT 1,
 ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
CREATE TABLE sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id INT NOT NULL,
 expires_at DATETIME NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX (expires_at)
);
CREATE TABLE entity_versions (
 id INT AUTO_INCREMENT PRIMARY KEY, entity_id INT NOT NULL, version INT NOT NULL,
 snapshot JSON NOT NULL, actor_id INT NOT NULL, proposal_id INT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY (entity_id, version),
 FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
 FOREIGN KEY (actor_id) REFERENCES users(id),
 FOREIGN KEY (proposal_id) REFERENCES contributions(id) ON DELETE SET NULL
);
