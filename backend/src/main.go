package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"maestro/src/manager"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/containers/podman/v6/pkg/bindings"
	"github.com/containers/podman/v6/pkg/bindings/containers"
	"github.com/containers/podman/v6/pkg/specgen"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"

	_ "embed"
)

// Config holds embedded configuration used at runtime.
type Config struct {
	InternalDir string                        `yaml:"internalDir"`
	Servers     map[string]manager.ServerInfo `yaml:"servers"`
}

// embed configuration file at build time
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
		uri, err := url.ParseRequestURI(fmt.Sprintf("ssh://%s@%s%s", serverInfo.Username, serverInfo.Host, serverInfo.PodmanSocket))
		if err != nil {
			log.Fatal(err)
		}

		conn, err := bindings.NewConnection(context.Background(), uri.String())
		if err != nil {
			log.Fatal(err)
		}

		// assign friendly name and prepare connection manager
		serverInfo.Name = serverName

		connectionManager := manager.ConnectionManager{
			Conn:       conn,
			Server:     serverInfo,
			ImageQueue: make(chan *manager.ImageManager),
		}

		serviceManager.Connections.Store(serverName, &connectionManager)

		// Worker: consume image jobs and create/start containers on this server.
		go func() {
			for imageManager := range connectionManager.ImageQueue {
				func() {
					imageManager.Mu.Lock()
					defer imageManager.Mu.Unlock()

					dateTime := time.Now().Format("02-01-2006_15-04-05")
					containerName := fmt.Sprintf("container-%s", dateTime)

					// Create container using the built image reference.
					newContainer, err := containers.CreateWithSpec(conn, &specgen.SpecGenerator{
						ContainerBasicConfig: specgen.ContainerBasicConfig{
							Name: containerName,
						},
						ContainerStorageConfig: specgen.ContainerStorageConfig{
							Image: *imageManager.ID,
						},
						ContainerHealthCheckConfig: specgen.ContainerHealthCheckConfig{
							HealthLogDestination: "/tmp",
						},
					}, nil)
					if err != nil {
						// Creation failed
						log.Printf("Error creating container %s for image %s: %v", containerName, imageManager.Name, err)
						imageManager.Container.Status = manager.Error
						return
					}

					// Prepare stdout/stderr files in the image's directory.
					stdoutFileName := fmt.Sprintf("stdout-%s.log", dateTime)
					stderrFileName := fmt.Sprintf("stderr-%s.log", dateTime)
					stdoutPath := filepath.Join(imageManager.FilesDir, stdoutFileName)
					stderrPath := filepath.Join(imageManager.FilesDir, stderrFileName)

					stdoutFD, err := os.OpenFile(stdoutPath, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0600)
					if err != nil {
						log.Printf("Error opening stdout file: %v", err)
					}

					stderrFD, err := os.OpenFile(stderrPath, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0600)
					if err != nil {
						log.Printf("Error opening stderr file: %v", err)
					}

					// Track container metadata on the image manager.
					imageManager.Container = &manager.ContainerManager{
						ID:        newContainer.ID,
						Name:      containerName,
						Status:    manager.Running,
						CreatedAt: time.Now(),

						Stdout: stdoutFD,
						Stderr: stderrFD,
					}

					// Start the container and update status on failure.
					err = containers.Start(connectionManager.Conn, imageManager.Container.ID, nil)
					if err != nil {
						imageManager.Container.Status = manager.Error
						return
					}

					// Attach to container streams to capture logs.
					err = containers.Attach(connectionManager.Conn, imageManager.Container.ID, nil, stdoutFD, stderrFD, nil, &containers.AttachOptions{
						Logs:   func(a bool) *bool { return &a }(true),
						Stream: func(a bool) *bool { return &a }(true),
					})
					if err != nil {
						log.Printf("Error attaching to container %s: %v", imageManager.Container.ID, err)
						imageManager.Container.Status = manager.Error
						return
					}
				}()
			}
		}()
	}

	// Poll containers periodically to refresh status (e.g., finished).
	go func() {
		for {
			serviceManager.Images.Range(func(imageName string, imageManager *manager.ImageManager) bool {
				imageManager.Mu.Lock()
				if imageManager.Container != nil && imageManager.Connection != nil {
					// Inspect the container to get current state.
					containerReport, err := containers.Inspect(imageManager.Connection.Conn, imageManager.Container.ID, &containers.InspectOptions{
						Size: func(a bool) *bool { return &a }(false),
					})
					if err != nil {
						log.Printf("Error inspecting container %s: %v", imageManager.Container.ID, err)
					} else {
						// Update local state if container has exited.
						switch containerReport.State.Status {
						case "exited":
							imageManager.Container.FinishedAt = &containerReport.State.FinishedAt
							imageManager.Container.Status = manager.Finished
							imageManager.Container.Stdout.Close()
							imageManager.Container.Stderr.Close()
						}
					}
				}
				imageManager.Mu.Unlock()
				return true
			})

			time.Sleep(time.Second * 2)
		}
	}()

	log.Println("Starting server...")

	// Run Gin in release mode.
	gin.SetMode(gin.ReleaseMode)

	// Initialize Gin engine and register middleware.
	r := gin.New(func(e *gin.Engine) {
		e.Use(cors.New(cors.Config{
			AllowOrigins:     []string{"*"},
			AllowMethods:     []string{"GET", "POST", "PUT", "HEAD", "OPTIONS"},
			AllowHeaders:     []string{"Origin", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With"},
			AllowCredentials: true,
			MaxAge:           12 * time.Hour,
		}))

		e.Use(gin.Logger(), gin.Recovery())
	})

	// API endpoints for images/containers and file operations.
	r.GET("containers", handleGetContainers)

	r.POST("container/:name", handleNewContainer)
	r.GET("container/:name", handleGetContainer)
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

// handleGetContainers returns all registered images.
func handleGetContainers(c *gin.Context) {
	images := serviceManager.Images.Pairs()

	c.JSON(200, images)
}

// handleGetContainer returns a single image record by name.
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

// handleNewContainer creates a new image directory and registers it.
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

	// create directory for image files
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

	// register the new image
	serviceManager.Images.Store(imageName, &manager.ImageManager{
		ID:        nil,
		Name:      imageName,
		FilesDir:  imageFilesDir,
		Container: nil,
	})

	c.JSON(201, gin.H{"message": fmt.Sprintf("New container %s created", imageName)})
}

// handleDeleteContainer removes image files and unregisters the image.
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

	// delete files on disk
	err := os.RemoveAll(image.FilesDir)
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to delete container: %v", err)})
		return
	}

	c.JSON(200, gin.H{"message": fmt.Sprintf("Container %s deleted successfully", imageName)})
}

// handlePostFile accepts multipart file uploads for an image.
func handlePostFile(c *gin.Context) {
	name := c.Param("name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Container %s not found", name)})
		return
	}

	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to parse multipart form: %v", err)})
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(400, gin.H{"error": "No file uploaded"})
		return
	}

	imageManager.Mu.Lock()
	defer imageManager.Mu.Unlock()

	// save each uploaded file into the image's directory
	for _, file := range files {
		filePath := filepath.Join(imageManager.FilesDir, file.Filename)
		if filepath.Dir(filePath) != imageManager.FilesDir {
			c.JSON(400, gin.H{"error": fmt.Sprintf("Invalid file path for uploaded file: %v", file.Filename)})
			return
		}

		c.SaveUploadedFile(file, filePath)
	}

	c.JSON(200, gin.H{"message": fmt.Sprintf("Files uploaded for image %s", name)})
}

// handleGetFiles lists non-directory files in an image's directory.
func handleGetFiles(c *gin.Context) {
	name := c.Param("name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Image %s not found", name)})
		return
	}

	entries, err := os.ReadDir(imageManager.FilesDir)
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to read files: %v", imageManager.Name)})
		return
	}

	var files []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		files = append(files, entry.Name())
	}

	c.JSON(200, files)
}

// handleGetFile returns a single file as an attachment.
func handleGetFile(c *gin.Context) {
	name := c.Param("name")
	fileName := c.Query("f_name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Image %s not found", name)})
		return
	}

	filePath := filepath.Join(imageManager.FilesDir, fileName)
	if filepath.Dir(filePath) != imageManager.FilesDir {
		c.JSON(400, gin.H{"error": fmt.Sprintf("Invalid file path for file: %s", fileName)})
		return
	}

	file, err := os.Open(filePath)
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to open file: %v", fileName)})
		return
	}
	defer file.Close()

	c.FileAttachment(filePath, fileName)
}

// handleDeleteFile removes a file from an image's directory.
func handleDeleteFile(c *gin.Context) {
	name := c.Param("name")
	fileName := c.Query("f_name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Container %s not found", name)})
		return
	}

	filePath := filepath.Join(imageManager.FilesDir, fileName)
	if filepath.Dir(filePath) != imageManager.FilesDir {
		c.JSON(400, gin.H{"error": fmt.Sprintf("Invalid file path for file: %s", fileName)})
		return
	}

	err := os.Remove(filePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			c.JSON(404, gin.H{"error": fmt.Sprintf("File %s does not exist for image %s", fileName, name)})
			return
		} else {
			c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to delete file: %v", err)})
			return
		}
	}

	c.JSON(200, gin.H{"message": fmt.Sprintf("File %s deleted for image %s", fileName, name)})
}

// handleRunContainer ensures image is built on the requested server and queues it to run.
func handleRunContainer(c *gin.Context) {
	name := c.Param("name")
	serverName := c.Query("serverName")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Image %s not found", name)})
		return
	}

	imageManager.Mu.RLock()
	defer imageManager.Mu.RUnlock()

	// prevent duplicate running containers for the same image
	if imageManager.Container != nil && imageManager.Container.Status == manager.Running {
		c.JSON(409, gin.H{"error": fmt.Sprintf("A container for image %s is already running. Please stop the existing container before starting a new one.", name)})
		return
	}

	connectionManager, exists := serviceManager.Connections.Load(serverName)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Server %s not found", serverName)})
		return
	}

	// if image not built on the target server or not built at all, build it here
	if imageManager.ID == nil || imageManager.Connection.Server.Name != serverName {
		imageManager.Mu.RUnlock()
		err := imageManager.Build(connectionManager)
		if err != nil {
			c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to build image %s on server %s: %v", name, serverName, err)})
			return
		}
		imageManager.Mu.RLock()
	}

	connectionManager.ImageQueue <- imageManager

	c.JSON(200, gin.H{"message": fmt.Sprintf("Container for image %s started successfully on server %s", name, serverName)})
}

// handleBuildContainer forces rebuild of an image on the specified server.
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

// handleStopContainer stops a running container and clears tracking.
func handleStopContainer(c *gin.Context) {
	name := c.Param("name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{"error": fmt.Sprintf("Image %s not found", name)})
		return
	}

	imageManager.Mu.Lock()
	defer imageManager.Mu.Unlock()

	// nothing to do if no container/connection
	if imageManager.Connection == nil || imageManager.Container == nil {
		c.JSON(200, gin.H{"message": fmt.Sprintf("Container for image %s stopped successfully", name)})
		return
	}

	// clear container reference after stopping
	defer imageManager.ClearContainer()

	err := containers.Stop(imageManager.Connection.Conn, imageManager.Container.ID, &containers.StopOptions{
		Ignore:  func(a bool) *bool { return &a }(false),
		Timeout: func(a uint) *uint { return &a }(0),
	})

	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to stop container: %v", err)})
		return
	}

	c.JSON(200, gin.H{"message": fmt.Sprintf("Container for image %s stopped successfully", name)})
}
