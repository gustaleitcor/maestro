package manager

import (
	"context"
	"io"
	"sync"
	"time"
)

type Status string

const (
	Running Status = "running"
	Stopped Status = "stopped"
	Waiting Status = "waiting"
	Error   Status = "error"
)

type ServerInfo = struct {
	Name         string `json:"name"`
	Username     string `yaml:"username" json:"-"`
	Host         string `yaml:"host" json:"-"`
	PodmanSocket string `yaml:"podmanSocket" json:"-"`
	IdentityFile string `yaml:"identityFile" json:"-"`
	RemoteDir    string `yaml:"remoteDir" json:"-"`
}

type ContainerManager struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Status     Status     `json:"status"`
	CreatedAt  time.Time  `json:"created_at"`
	FinishedAt *time.Time `json:"finished_at"`

	Stdin  io.Reader `json:"-"`
	Stdout io.Writer `json:"-"`
	Stderr io.Writer `json:"-"`

	Mu sync.RWMutex `json:"-"`
}

type ImageManager struct {
	ID         *string            `json:"id"`
	Name       string             `json:"name"`
	FilesDir   string             `json:"-"`
	Connection *ConnectionManager `json:"connection"`
	Container  *ContainerManager  `json:"container"`

	Mu sync.RWMutex `json:"-"`
}

type ConnectionManager struct {
	Conn       context.Context    `json:"-"`
	Server     ServerInfo         `json:"server"`
	ImageQueue chan *ImageManager `json:"-"`

	Mu sync.RWMutex `json:"-"`
}

type ServiceManager struct {
	Connections SafeMap[string, *ConnectionManager] `json:"connections"`
	Images      SafeMap[string, *ImageManager]      `json:"images"`

	Mu sync.RWMutex
}
