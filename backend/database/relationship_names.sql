-- Existing installations only. Run once before deploying the updated backend.
-- Existing relationships remain single-directional; names and history are preserved.
ALTER TABLE relationships ADD COLUMN reverse_name VARCHAR(100) NULL AFTER relationship_type;
