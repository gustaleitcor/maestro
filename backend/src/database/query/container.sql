-- name: GetContainerByID :one
SELECT * FROM container
WHERE id = ?;
