package manager

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/containers/podman/v6/pkg/bindings/containers"
	"github.com/containers/podman/v6/pkg/specgen"
)

// SpinUpWorker consumes queued images and creates containers on the target server.
func SpinUpWorker(cm *ConnectionManager) {
	for imageManager := range cm.ImageQueue {
		func() {
			imageManager.Mu.Lock()
			defer imageManager.Mu.Unlock()

			// Use timestamped names so each run gets isolated container and log artifacts.
			dateTime := time.Now().Format("02-01-2006_15-04-05")
			containerName := fmt.Sprintf("container-%s", dateTime)

			// Create container using the built image reference.
			newContainer, err := containers.CreateWithSpec(cm.Conn, &specgen.SpecGenerator{
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
				// Surface creation failures on the tracked image so the API can report them.
				log.Printf("Error creating container %s for image %s: %v", containerName, imageManager.Name, err)
				imageManager.Container.Status = Error
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

			// Persist the container metadata before starting so other handlers can find it.
			imageManager.Container = &ContainerManager{
				ID:        newContainer.ID,
				Name:      containerName,
				Status:    Running,
				CreatedAt: time.Now(),

				Stdout: stdoutFD,
				Stderr: stderrFD,
			}

			// Start the container and update status on failure.
			err = containers.Start(cm.Conn, imageManager.Container.ID, nil)
			if err != nil {
				imageManager.Container.Status = Error
				return
			}

			// Stream logs into per-run files without blocking the worker loop.
			go func() {
				err = containers.Attach(cm.Conn, imageManager.Container.ID, nil, stdoutFD, stderrFD, nil, &containers.AttachOptions{
					Logs:   new(true),
					Stream: new(true),
				})
				if err != nil {
					imageManager.Mu.Lock()
					defer imageManager.Mu.Lock()
					log.Printf("Error attaching to container %s: %v", imageManager.Container.ID, err)
					imageManager.Container.Status = Error
					return
				}
			}()
		}()
	}
}
