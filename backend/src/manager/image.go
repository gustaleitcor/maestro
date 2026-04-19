package manager

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/containers/buildah/define"
	"github.com/containers/podman/v6/pkg/bindings/containers"
	"github.com/containers/podman/v6/pkg/bindings/images"
	"github.com/containers/podman/v6/pkg/domain/entities/types"
)

// MarshalJSON serializes a consistent snapshot of the image state.
func (im *ImageManager) MarshalJSON() ([]byte, error) {
	im.Mu.RLock()
	defer im.Mu.RUnlock()

	type alias ImageManager
	return json.Marshal((*alias)(im))
}

// ClearContainer drops the tracked container reference for the image.
func (im *ImageManager) ClearContainer() {
	im.Container = nil
}

// GetFile reads a file from the image build context after validating the path.
func (im *ImageManager) GetFile(fileName string) ([]byte, error) {
	if !filepath.IsLocal(fileName) {
		return nil, fmt.Errorf("invalid file path for file: %s", fileName)
	}

	filePath := filepath.Join(im.FilesDir, fileName)
	bytes, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	return bytes, nil
}

// GetDockerfile returns the Dockerfile contents or an empty slice when absent.
func (im *ImageManager) GetDockerfile() []byte {
	dockerfile, err := im.GetFile("Dockerfile")
	if err != nil {
		return []byte("")
	}

	return dockerfile
}

// Build removes any previously tracked artifacts on the target server and rebuilds the image.
func (im *ImageManager) Build(mc *ConnectionManager) error {
	if im.Container != nil {
		containers.Remove(mc.Conn, im.Container.ID, &containers.RemoveOptions{
			Ignore:  new(true),
			Volumes: new(true),
			Force:   new(false),
			Depend:  nil, // Use Podman's default dependency handling.
			Timeout: func(a uint) *uint { return &a }(0),
		})
	}

	if im.ID != nil {
		images.Remove(mc.Conn, []string{*im.ID}, &images.RemoveOptions{
			All:            new(false),
			Force:          new(false),
			Ignore:         new(true),
			LookupManifest: new(false),
			NoPrune:        new(false),
		})
	}

	buildReport, err := images.Build(mc.Conn, nil, types.BuildOptions{
		BuildOptions: define.BuildOptions{
			ContextDirectory: im.FilesDir,
			Compression:      define.Gzip,
		},
	})

	if err != nil {
		return fmt.Errorf("failed to build image: %v", err)
	}

	im.ID = &buildReport.ID
	im.Connection = mc

	return nil
}
