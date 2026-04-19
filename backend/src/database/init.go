package database

import (
	"database/sql"
	"embed"
	"log"
	"maestro/src/database/schema"
	"os"

	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"
)

var (
	// Query exposes the generated sqlc query helpers backed by DBConn.
	Query *schema.Queries
	// DBConn holds the shared SQLite connection for the process.
	DBConn *sql.DB
	// embedMigrations contains the SQL migration files bundled into the binary.
	//go:embed migrations/*.sql
	embedMigrations embed.FS
)

func init() {
	// Load environment variables when running outside the Docker image.
	if os.Getenv("ENV") != "docker" {
		if err := godotenv.Load(); err != nil {
			panic(err)
		}
	}

	// Open the shared SQLite database connection.
	var err error
	db_conn, err := sql.Open("sqlite", "db.sqlite")

	if err != nil {
		log.Println(os.Getenv("DATABASE_URL"), "Error connecting to sqlite database")
		panic(err)
	}

	// Apply embedded migrations before serving requests.
	goose.SetBaseFS(embedMigrations)

	if err := goose.SetDialect("sqlite"); err != nil {
		panic(err)
	}

	if err := goose.Up(db_conn, "migrations"); err != nil {
		panic(err)
	}

	log.Println("Migrations ran successfully")

	// Verify the database connection before exposing the query handle.
	if err := db_conn.Ping(); err != nil {
		panic(err)
	}

	// Create the sqlc query wrapper used by the rest of the application.
	Query = schema.New(db_conn)

	log.Println("Connected to sqlite database")
}
