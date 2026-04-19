package main

import (
	"archive/zip"
	"errors"
	"fmt"
	"log"
	"maestro/src/filesystem"
	"maestro/src/manager"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/containers/podman/v6/pkg/bindings/containers"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"

	_ "embed"
)

// Config holds the embedded runtime configuration.
type Config struct {
	InternalDir string                        `yaml:"internalDir"`
	Servers     map[string]manager.ServerInfo `yaml:"servers"`
}

// rawConfigFile embeds the YAML configuration shipped with the binary.
//
//go:embed config.yaml
var rawConfigFile []byte

var (
	config         Config                 // parsed configuration
	serviceManager manager.ServiceManager // global service manager (images + connections)
)

func main() {
	// Parse embedded YAML config.
	err := yaml.Unmarshal(rawConfigFile, &config)
	if err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}

	// Load image directories from internal storage and register them.
	imagesDir, err := os.ReadDir(config.InternalDir)
	if err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}

	for _, image := range imagesDir {
		if !image.IsDir() {
			continue
		}
		imagePath := filepath.Join(config.InternalDir, image.Name())

		imageManager := &manager.ImageManager{
			ID:        nil,
			Name:      image.Name(),
			FilesDir:  imagePath,
			Container: nil,
		}

		serviceManager.Images.Store(image.Name(), imageManager)
	}

	// For each server in config: create a Podman connection and a worker
	// goroutine that runs containers queued for that server.
	for serverName, serverInfo := range config.Servers {
		// Build SSH URI to Podman socket: ssh://user@host/path/to/socket
		connectionManager, err := manager.NewServerConnection(serverName, serverInfo)
		if err != nil {
			log.Fatal(err)
		}

		serviceManager.Connections.Store(serverName, connectionManager)

		// Worker: consume image jobs and create/start containers on this server.
		go manager.SpinUpWorker(connectionManager)
	}

	// Poll remote server metrics for the dashboard.
	go manager.PollServersStatus(&serviceManager)

	// Poll container states periodically to reflect exits and completion times.
	go manager.PollContainersStatus(&serviceManager)

	log.Println("Starting server...")

	// Run Gin in release mode.
	gin.SetMode(gin.ReleaseMode)

	// Initialize Gin engine and register middleware.
	r := gin.New(func(e *gin.Engine) {
		e.Use(cors.New(cors.Config{
			AllowOrigins:     []string{"*"},
			AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"},
			AllowHeaders:     []string{"Origin", "Content-Type", "Content-Length", "Accept-Encoding", "X-CSRF-Token", "Authorization", "Accept", "Cache-Control", "X-Requested-With"},
			AllowCredentials: true,
			MaxAge:           12 * time.Hour,
		}))

		e.Use(gin.Logger(), gin.Recovery())
	})

	// API endpoints for images/containers and file operations.
	r.GET("dashboard", handleGetDashboard)
	r.GET("containers", handleGetContainers)
	r.GET("servers", handleGetServers)

	r.POST("container/:name", handleNewContainer)
	r.GET("container/:name", handleGetContainer)
	r.GET("container/:name/details", handleGetContainerDetails)
	r.DELETE("container/:name", handleDeleteContainer)

	r.POST("container/:name/files", handlePostFile)
	r.GET("container/:name/files", handleGetFiles)
	r.GET("container/:name/file", handleGetFile)
	r.DELETE("container/:name/file", handleDeleteFile)

	r.POST("container/:name/run", handleRunContainer)
	r.POST("container/:name/build", handleBuildContainer)
	r.POST("container/:name/stop", handleStopContainer)

	const addr string = "localhost:3003"
	log.Printf("Server started at %s", addr)

	// Start HTTP server (blocks).
	r.Run(addr)

	os.Exit(0)
}

// handleGetDashboard returns the current image and server state in one payload.
func handleGetDashboard(c *gin.Context) {
	c.JSON(200, struct {
		Containers map[string]*manager.ImageManager      `json:"containers"`
		Servers    map[string]*manager.ConnectionManager `json:"servers"`
	}{
		Containers: serviceManager.Images.Pairs(),
		Servers:    serviceManager.Connections.Pairs(),
	})
}

// handleGetServers returns all configured servers with their latest observed state.
func handleGetServers(c *gin.Context) {
	servers := serviceManager.Connections.Pairs()

	c.JSON(200, servers)
}

// handleGetContainers returns all tracked images.
func handleGetContainers(c *gin.Context) {
	images := serviceManager.Images.Pairs()

	c.JSON(200, images)
}

// handleGetContainer returns a single tracked image by name.
func handleGetContainer(c *gin.Context) {
	imageName := c.Param("name")
	if len(imageName) == 0 {
		c.JSON(400, gin.H{"error": "Container name is required"})
		return
	}

	imageManager, exists := serviceManager.Images.Load(imageName)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Container %s not found", imageName)})
		return
	}

	c.JSON(200, imageManager)
}

// handleGetContainerDetails returns the image file tree plus Dockerfile content.
func handleGetContainerDetails(c *gin.Context) {
	imageName := c.Param("name")
	if len(imageName) == 0 {
		c.JSON(400, gin.H{"error": "Container name is required"})
		return
	}

	imageManager, exists := serviceManager.Images.Load(imageName)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Container %s not found", imageName)})
		return
	}

	filesystemMap, err := filesystem.GetFolderStructure(imageManager.FilesDir)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Error getting folder structure %v", err)})
		return
	}

	c.JSON(200, struct {
		Filesystem map[string][]string `json:"filesystem"`
		Dockerfile string              `json:"dockerfile"`
	}{
		Filesystem: filesystemMap,
		Dockerfile: string(imageManager.GetDockerfile()),
	})
}

// handleNewContainer creates an image directory and registers it in memory.
func handleNewContainer(c *gin.Context) {
	imageName := c.Param("name")
	if len(imageName) == 0 {
		c.JSON(400, gin.H{"error": "Container name is required"})
		return
	}

	imageFilesDir := filepath.Join(config.InternalDir, imageName)
	if filepath.Dir(imageFilesDir) != config.InternalDir {
		c.JSON(400, gin.H{"error": fmt.Sprintf("Invalid container name: %s", filepath.Base(imageFilesDir))})
		return
	}

	// Create the directory that will store the image build context.
	err := os.Mkdir(imageFilesDir, 0755)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			c.JSON(409, gin.H{"error": fmt.Sprintf("Container %s already exists", imageName)})
			return
		} else {
			c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to create container: %v", err)})
			return
		}
	}

	// Register the image immediately so the API can expose it.
	serviceManager.Images.Store(imageName, &manager.ImageManager{
		ID:        nil,
		Name:      imageName,
		FilesDir:  imageFilesDir,
		Container: nil,
	})

	c.JSON(201, gin.H{"message": fmt.Sprintf("New container %s created", imageName)})
}

// handleDeleteContainer removes an image directory and unregisters it.
func handleDeleteContainer(c *gin.Context) {
	imageName := c.Param("name")
	if len(imageName) == 0 {
		c.JSON(400, gin.H{"error": "Container name is required"})
		return
	}

	image, exists := serviceManager.Images.Load(imageName)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Container %s not found", imageName)})
		return
	}

	serviceManager.Images.Delete(image.Name)

	// Remove the image build context from disk.
	err := os.RemoveAll(image.FilesDir)
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to delete container: %v", err)})
		return
	}

	c.JSON(200, gin.H{"message": fmt.Sprintf("Container %s deleted successfully", imageName)})
}

// handlePostFile accepts a zip upload and expands it into an image directory.
func handlePostFile(c *gin.Context) {
	imageName := c.Param("name")

	imageManager, exists := serviceManager.Images.Load(imageName)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Container %s not found", imageName)})
		return
	}

	formFile, err := c.FormFile("file")
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to parse multipart form: %v", err)})
		return
	}

	file, err := formFile.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Failed to open file: %v", err)})
		return
	}

	zipReader, err := zip.NewReader(file, formFile.Size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to unzip file: %v", err)})
		return
	}

	imageManager.Mu.Lock()
	defer imageManager.Mu.Unlock()

	// Expand the uploaded archive into the image's build context.
	if err = filesystem.SaveZipFile(zipReader, imageManager.FilesDir); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Failed to save files: %v", err)})
	}

	c.JSON(200, gin.H{"message": fmt.Sprintf("Files uploaded for image %s", imageName)})
}

// handleGetFiles returns the directory tree for an image's build context.
func handleGetFiles(c *gin.Context) {
	name := c.Param("name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Image %s not found", name)})
		return
	}

	dirStruture, err := filesystem.GetFolderStructure(imageManager.FilesDir)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Error getting folder structure %v", err)})
		return
	}

	c.JSON(200, dirStruture)
}

// handleGetFile returns a file from an image's build context as an attachment.
func handleGetFile(c *gin.Context) {
	name := c.Param("name")
	fileName := c.Query("f_name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Image %s not found", name)})
		return
	}

	if !filepath.IsLocal(fileName) {
		c.JSON(400, gin.H{"error": fmt.Sprintf("Invalid file path for file: %s", fileName)})
		return
	}

	filePath := filepath.Join(imageManager.FilesDir, fileName)
	file, err := os.Open(filePath)
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to open file: %v", fileName)})
		return
	}
	defer file.Close()

	c.FileAttachment(filePath, fileName)
}

// handleDeleteFile removes a file or subdirectory from an image's build context.
func handleDeleteFile(c *gin.Context) {
	name := c.Param("name")
	fileName := c.Query("f_name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Container %s not found", name)})
		return
	}

	if !filepath.IsLocal(fileName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid file path for file: %s", fileName)})
		return
	}

	filePath := filepath.Join(imageManager.FilesDir, fileName)
	err := os.RemoveAll(filePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			c.JSON(404, gin.H{"error": fmt.Sprintf("File %s does not exist for image %s", fileName, name)})
			return
		} else {
			c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to delete file: %v", err)})
			return
		}
	}

	c.JSON(200, gin.H{"message": fmt.Sprintf("File %s deleted from image %s", fileName, name)})
}

// handleRunContainer builds the image on the requested server if needed and queues a run.
func handleRunContainer(c *gin.Context) {
	name := c.Param("name")
	serverName := c.Query("serverName")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Image %s not found", name)})
		return
	}

	imageManager.Mu.Lock()
	defer imageManager.Mu.Unlock()

	// Avoid queuing a second run while a container is still active for this image.
	if imageManager.Container != nil && imageManager.Container.Status == manager.Running {
		c.JSON(409, gin.H{"error": fmt.Sprintf("A container for image %s is already running. Please stop the existing container before starting a new one.", name)})
		return
	}

	connectionManager, exists := serviceManager.Connections.Load(serverName)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Server %s not found", serverName)})
		return
	}

	// Rebuild when the image has never been built or was built on another server.
	if imageManager.ID == nil || imageManager.Connection.Server.Name != serverName {
		err := imageManager.Build(connectionManager)
		if err != nil {
			c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to build image %s on server %s: %v", name, serverName, err)})
			return
		}
	}

	connectionManager.ImageQueue <- imageManager

	c.JSON(200, gin.H{"message": fmt.Sprintf("Container for image %s started successfully on server %s", name, serverName)})
}

// handleBuildContainer rebuilds an image on the specified server.
func handleBuildContainer(c *gin.Context) {
	name := c.Param("name")
	serverName := c.Query("serverName")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Image %s not found", name)})
		return
	}

	connectionManager, exists := serviceManager.Connections.Load(serverName)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Server %s not found", serverName)})
		return
	}

	err := imageManager.Build(connectionManager)
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to build image %s on server %s: %v", name, serverName, err)})
		return
	}

	c.JSON(201, gin.H{"message": fmt.Sprintf("Image %s built successfully on server %s", name, serverName)})
}

// handleStopContainer stops the active container for an image and clears tracking.
func handleStopContainer(c *gin.Context) {
	name := c.Param("name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Image %s not found", name)})
		return
	}

	imageManager.Mu.Lock()
	defer imageManager.Mu.Unlock()

	// Keep the endpoint idempotent when nothing is currently running.
	if imageManager.Connection == nil || imageManager.Container == nil {
		c.JSON(200, gin.H{"message": fmt.Sprintf("Container for image %s stopped successfully", name)})
		return
	}

	// Drop the in-memory container reference when the handler returns.
	defer imageManager.ClearContainer()

	err := containers.Stop(imageManager.Connection.Conn, imageManager.Container.ID, &containers.StopOptions{
		Ignore:  new(false),
		Timeout: new(uint(0)),
	})

	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to stop container: %v", err)})
		return
	}

	c.JSON(200, gin.H{"message": fmt.Sprintf("Container for image %s stopped successfully", name)})
}
