-- +goose Up
-- +goose StatementBegin
SELECT 'up SQL query';
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS file (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    content BLOB NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (container_id)
        REFERENCES container(id)
        ON DELETE CASCADE,

    UNIQUE (container_id, name),
    CHECK (size >= 0)
);

-- Essential indexes
CREATE INDEX IF NOT EXISTS idx_file_container ON file(container_id);
CREATE INDEX IF NOT EXISTS idx_file_created ON file(created_at DESC);

-- +goose Down
-- +goose StatementBegin
SELECT 'down SQL query';
DELETE FROM file;
-- +goose StatementEnd
