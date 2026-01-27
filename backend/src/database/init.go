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
	Query  *schema.Queries
	DBConn *sql.DB
	//go:embed migrations/*.sql
	embedMigrations embed.FS
)

func init() {
	// Load environment variables if not in docker
	if os.Getenv("ENV") != "docker" {
		if err := godotenv.Load(); err != nil {
			panic(err)
		}
	}

	// Connect to Sqlite
	var err error
	db_conn, err := sql.Open("sqlite", "db.sqlite")

	if err != nil {
		log.Println(os.Getenv("DATABASE_URL"), "Error connecting to sqlite database")
		panic(err)
	}

	// Run migrations
	goose.SetBaseFS(embedMigrations)

	if err := goose.SetDialect("sqlite"); err != nil {
		panic(err)
	}

	if err := goose.Up(db_conn, "migrations"); err != nil {
		panic(err)
	}

	log.Println("Migrations ran successfully")

	// Check if the connection is working
	if err := db_conn.Ping(); err != nil {
		panic(err)
	}

	// Create the queries
	Query = schema.New(db_conn)

	log.Println("Connected to sqlite database")
}
