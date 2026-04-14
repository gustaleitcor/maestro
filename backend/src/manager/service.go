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

func (cm *ConnectionManager) MarshalJSON() ([]byte, error) {
	cm.Mu.RLock()
	defer cm.Mu.RUnlock()

	type alias ConnectionManager
	return json.Marshal((*alias)(cm))
}

func (cm *ContainerManager) MarshalJSON() ([]byte, error) {
	cm.Mu.RLock()
	defer cm.Mu.RUnlock()

	type alias ContainerManager
	return json.Marshal((*alias)(cm))
}

func (im *ImageManager) MarshalJSON() ([]byte, error) {
	im.Mu.RLock()
	defer im.Mu.RUnlock()

	type alias ImageManager
	return json.Marshal((*alias)(im))
}

func (im *ImageManager) ClearContainer() {
	im.Container = nil
}

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

func (im *ImageManager) GetDockerfile() []byte {
	dockerfile, err := im.GetFile("Dockerfile")
	if err != nil {
		return []byte("")
	}

	return dockerfile
}

func (im *ImageManager) Build(mc *ConnectionManager) error {
	if im.Container != nil {
		containers.Remove(mc.Conn, im.Container.ID, &containers.RemoveOptions{
			Ignore:  new(true),
			Volumes: new(true),
			Force:   new(false),
			Depend:  nil, // TODO: learn what this param does
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
		},
	})

	if err != nil {
		return fmt.Errorf("failed to build image: %v", err)
	}

	im.ID = &buildReport.ID
	im.Connection = mc

	return nil
}
