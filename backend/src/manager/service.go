package manager

import (
	"encoding/json"
	"fmt"

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

func (im *ImageManager) Build(mc *ConnectionManager) error {
	im.Mu.Lock()
	defer im.Mu.Unlock()

	if im.Container != nil {
		containers.Remove(mc.Conn, im.Container.ID, &containers.RemoveOptions{
			Ignore:  func(a bool) *bool { return &a }(true),
			Volumes: func(a bool) *bool { return &a }(true),
			Force:   func(a bool) *bool { return &a }(false),
			Depend:  nil, // TODO: learn what this param does
			Timeout: func(a uint) *uint { return &a }(0),
		})
	}

	if im.ID != nil {
		images.Remove(mc.Conn, []string{*im.ID}, &images.RemoveOptions{
			All:            func(a bool) *bool { return &a }(false),
			Force:          func(a bool) *bool { return &a }(false),
			Ignore:         func(a bool) *bool { return &a }(true),
			LookupManifest: func(a bool) *bool { return &a }(false),
			NoPrune:        func(a bool) *bool { return &a }(false),
		})
	}

	buildReport, err := images.BuildFromServerContext(mc.Conn, nil, types.BuildOptions{
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
