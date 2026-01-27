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

// Config holds embedded config values used by the service.
type Config struct {
	InternalDir string                        `yaml:"internalDir"`
	Servers     map[string]manager.ServerInfo `yaml:"servers"`
}

// embed the config file at build time
//
//go:embed config.yaml
var rawConfigFile []byte

var (
	config         Config                 // parsed config
	serviceManager manager.ServiceManager // global manager with image/connection stores
)

func main() {
	// Load config from embedded YAML.
	err := yaml.Unmarshal(rawConfigFile, &config)
	if err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}

	// Read images directory and initialize ImageManager entries for each folder.
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

	// Connect to each server defined in config and start a worker goroutine
	// that listens for images to run on that server.
	for serverName, serverInfo := range config.Servers {
		// ssh://HOST@localhost/run/user/1000/podman/podman.sock
		uri, err := url.ParseRequestURI(fmt.Sprintf("ssh://%s@%s%s", serverInfo.Username, serverInfo.Host, serverInfo.PodmanSocket))
		if err != nil {
			log.Fatal(err)
		}

		conn, err := bindings.NewConnection(context.Background(), uri.String())
		if err != nil {
			log.Fatal(err)
		}

		// set the friendly name and prepare a connection manager
		serverInfo.Name = serverName

		connectionManager := manager.ConnectionManager{
			Conn:       conn,
			Server:     serverInfo,
			ImageQueue: make(chan *manager.ImageManager),
		}

		serviceManager.Connections.Store(serverName, &connectionManager)

		// Worker: create and start containers for queued images.
		go func() {
			for imageManager := range connectionManager.ImageQueue {
				imageManager.Mu.Lock()

				// generate a unique container name
				containerName := fmt.Sprintf("container-%s", time.Now().Format("20060102-150405"))

				// create container with spec (image must be set)
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
					// fatal-ish: creation failed
					fmt.Println(err)
					os.Exit(1)
				}

				// track container metadata on the image manager
				imageManager.Container = &manager.ContainerManager{
					ID:        newContainer.ID,
					Name:      containerName,
					Status:    manager.Running,
					CreatedAt: time.Now(),
				}

				// attempt to start the container; mark error state if start fails
				err = containers.Start(connectionManager.Conn, imageManager.Container.ID, nil)
				if err != nil {
					imageManager.Container.Status = manager.Error
				}

				imageManager.Mu.Unlock()
			}
		}()
	}

	// Poll container states periodically to update status (finished, stopped).
	go func() {
		for {
			serviceManager.Images.Range(func(imageName string, imageManager *manager.ImageManager) bool {
				imageManager.Mu.Lock()
				if imageManager.Container != nil {
					// inspect container state on its connection
					containerReport, err := containers.Inspect(imageManager.Connection.Conn, imageManager.Container.ID, &containers.InspectOptions{
						Size: func(a bool) *bool { return &a }(false),
					})
					if err != nil {
						log.Printf("Error inspecting container %s: %v", imageManager.Container.ID, err)
					}

					// update local status on terminal state
					switch containerReport.State.Status {
					case "exited":
						imageManager.Container.FinishedAt = &containerReport.State.FinishedAt
						imageManager.Container.Status = manager.Stopped
					}
				}
				imageManager.Mu.Unlock()
				return true
			})

			time.Sleep(time.Second * 2)
		}
	}()

	log.Println("Starting server...")

	// Run Gin in release mode (production).
	gin.SetMode(gin.ReleaseMode)

	// Initialize Gin engine with CORS and logging middleware.
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

	// Register API endpoints for container and file management.
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

	// Start the HTTP server.
	r.Run(addr)

	os.Exit(0)
}

// handleGetContainers returns all tracked images.
func handleGetContainers(c *gin.Context) {
	images := serviceManager.Images.Pairs()

	c.JSON(200, images)
}

// handleGetContainer returns a single image record by name.
func handleGetContainer(c *gin.Context) {
	imageName := c.Param("name")
	if len(imageName) == 0 {
		c.JSON(400, gin.H{
			"error": "Container name is required",
		})
		return
	}

	imageManager, exists := serviceManager.Images.Load(imageName)
	if !exists {
		c.JSON(404, gin.H{
			"error": fmt.Sprintf("Container %s not found", imageName),
		})
		return
	}

	c.JSON(200, imageManager)
}

// handleNewContainer creates a new image directory and registers it.
func handleNewContainer(c *gin.Context) {
	imageName := c.Param("name")
	if len(imageName) == 0 {
		c.JSON(400, gin.H{
			"error": "Container name is required",
		})
		return
	}

	imageFilesDir := filepath.Join(config.InternalDir, imageName)
	if filepath.Dir(imageFilesDir) != config.InternalDir {
		c.JSON(400, gin.H{
			"error": fmt.Sprintf("Invalid container name: %s", filepath.Base(imageFilesDir)),
		})
		return
	}

	// create directory for image files
	err := os.Mkdir(imageFilesDir, 0755)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			c.JSON(409, gin.H{
				"error": fmt.Sprintf("Container %s already exists", imageName),
			})
			return
		} else {
			c.JSON(500, gin.H{
				"error": fmt.Sprintf("Failed to create container: %v", err),
			})
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

	c.JSON(201, gin.H{
		"message": fmt.Sprintf("New container %s created", imageName),
	})
}

// handleDeleteContainer removes image files and unregisters the image.
func handleDeleteContainer(c *gin.Context) {
	imageName := c.Param("name")
	if len(imageName) == 0 {
		c.JSON(400, gin.H{
			"error": "Container name is required",
		})
		return
	}

	image, exists := serviceManager.Images.Load(imageName)
	if !exists {
		c.JSON(404, gin.H{
			"error": fmt.Sprintf("Container %s not found", imageName),
		})
		return
	}

	serviceManager.Images.Delete(image.Name)

	// delete files on disk
	err := os.RemoveAll(image.FilesDir)
	if err != nil {
		c.JSON(500, gin.H{
			"error": fmt.Sprintf("Failed to delete container: %v", err),
		})
		return
	}

	c.JSON(200, gin.H{
		"message": fmt.Sprintf("Container %s deleted successfully", imageName),
	})
}

// handlePostFile accepts multipart file uploads for an image.
func handlePostFile(c *gin.Context) {
	name := c.Param("name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{
			"error": fmt.Sprintf("Container %s not found", name),
		})
		return
	}

	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(500, gin.H{
			"error": fmt.Sprintf("Failed to parse multipart form: %v", err),
		})
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(400, gin.H{
			"error": "No file uploaded",
		})
		return
	}

	imageManager.Mu.Lock()
	defer imageManager.Mu.Unlock()

	// save each uploaded file into the image's directory
	for _, file := range files {
		filePath := filepath.Join(imageManager.FilesDir, file.Filename)
		if filepath.Dir(filePath) != imageManager.FilesDir {
			c.JSON(400, gin.H{
				"error": fmt.Sprintf("Invalid file path for uploaded file: %v", file.Filename),
			})
			return
		}

		c.SaveUploadedFile(file, filePath)
	}

	c.JSON(200, gin.H{
		"message": fmt.Sprintf("Files uploaded for image %s", name),
	})
}

// handleGetFiles lists non-directory files in an image's directory.
func handleGetFiles(c *gin.Context) {
	name := c.Param("name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{
			"error": fmt.Sprintf("Image %s not found", name),
		})
		return
	}

	entries, err := os.ReadDir(imageManager.FilesDir)
	if err != nil {
		c.JSON(500, gin.H{
			"error": fmt.Sprintf("Failed to read files: %v", imageManager.Name),
		})
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
		c.JSON(404, gin.H{
			"error": fmt.Sprintf("Image %s not found", name),
		})
		return
	}

	filePath := filepath.Join(imageManager.FilesDir, fileName)
	if filepath.Dir(filePath) != imageManager.FilesDir {
		c.JSON(400, gin.H{
			"error": fmt.Sprintf("Invalid file path for file: %s", fileName),
		})
		return
	}

	file, err := os.Open(filePath)
	if err != nil {
		c.JSON(500, gin.H{
			"error": fmt.Sprintf("Failed to open file: %v", fileName),
		})
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
		c.JSON(404, gin.H{
			"error": fmt.Sprintf("Container %s not found", name),
		})
		return
	}

	filePath := filepath.Join(imageManager.FilesDir, fileName)
	if filepath.Dir(filePath) != imageManager.FilesDir {
		c.JSON(400, gin.H{
			"error": fmt.Sprintf("Invalid file path for file: %s", fileName),
		})
		return
	}

	err := os.Remove(filePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			c.JSON(404, gin.H{
				"error": fmt.Sprintf("File %s does not exist for image %s", fileName, name),
			})
			return
		} else {
			c.JSON(500, gin.H{
				"error": fmt.Sprintf("Failed to delete file: %v", err),
			})
			return
		}
	}

	c.JSON(200, gin.H{
		"message": fmt.Sprintf("File %s deleted for image %s", fileName, name),
	})
}

// handleRunContainer ensures an image is built on the requested server and queues it to run.
func handleRunContainer(c *gin.Context) {
	name := c.Param("name")
	serverName := c.Query("serverName")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{
			"error": fmt.Sprintf("Image %s not found", name),
		})
		return
	}

	imageManager.Mu.RLock()
	defer imageManager.Mu.RUnlock()

	// prevent duplicate running containers for the same image
	if imageManager.Container != nil && imageManager.Container.Status == manager.Running {
		c.JSON(409, gin.H{
			"error": fmt.Sprintf("A container for image %s is already running. Please stop the existing container before starting a new one.", name),
		})
		return
	}

	connectionManager, exists := serviceManager.Connections.Load(serverName)
	if !exists {
		c.JSON(404, gin.H{
			"error": fmt.Sprintf("Server %s not found", serverName),
		})
		return
	}

	// if image not built on the target server or not built at all, build it here
	if imageManager.ID == nil || imageManager.Connection.Server.Name != serverName {
		imageManager.Mu.RUnlock()
		err := imageManager.Build(connectionManager)
		if err != nil {
			c.JSON(500, gin.H{
				"error": fmt.Sprintf("Failed to build image %s on server %s: %v", name, serverName, err),
			})
			return
		}
		imageManager.Mu.RLock()
	}

	connectionManager.ImageQueue <- imageManager

	c.JSON(200, gin.H{
		"message": fmt.Sprintf("Container for image %s started successfully on server %s", name, serverName),
	})
}

// handleBuildContainer forces rebuild of an image on the specified server.
func handleBuildContainer(c *gin.Context) {
	name := c.Param("name")
	serverName := c.Query("serverName")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{
			"error": fmt.Sprintf("Image %s not found", name),
		})
		return
	}

	connectionManager, exists := serviceManager.Connections.Load(serverName)
	if !exists {
		c.JSON(404, gin.H{
			"error": fmt.Sprintf("Server %s not found", serverName),
		})
		return
	}

	err := imageManager.Build(connectionManager)
	if err != nil {
		c.JSON(500, gin.H{
			"error": fmt.Sprintf("Failed to build image %s on server %s: %v", name, serverName, err),
		})
		return
	}

	c.JSON(201, gin.H{
		"message": fmt.Sprintf("Image %s built successfully on server %s", name, serverName),
	})
}

// handleStopContainer stops a running container and clears tracking.
func handleStopContainer(c *gin.Context) {
	name := c.Param("name")

	imageManager, exists := serviceManager.Images.Load(name)
	if !exists {
		c.JSON(404, gin.H{
			"error": fmt.Sprintf("Image %s not found", name),
		})
		return
	}

	imageManager.Mu.Lock()
	defer imageManager.Mu.Unlock()

	// nothing to do if no container/connection
	if imageManager.Connection == nil || imageManager.Container == nil {
		c.JSON(200, gin.H{
			"message": fmt.Sprintf("Container for image %s stopped successfully", name),
		})
		return
	}

	// clear container reference after stopping
	defer imageManager.ClearContainer()

	err := containers.Stop(imageManager.Connection.Conn, imageManager.Container.ID, &containers.StopOptions{
		Ignore:  func(a bool) *bool { return &a }(false),
		Timeout: func(a uint) *uint { return &a }(0),
	})

	if err != nil {
		c.JSON(500, gin.H{
			"error": fmt.Sprintf("Failed to stop container: %v", err),
		})
		return
	}

	c.JSON(200, gin.H{
		"message": fmt.Sprintf("Container for image %s stopped successfully", name),
	})
}
