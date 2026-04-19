package manager

import (
	"context"
	"io"
	"os"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// Status represents the lifecycle state exposed for a managed container.
type Status string

// Container status values returned by the API.
const (
	Running  Status = "running"
	Finished Status = "Finished"
	Stopped  Status = "stopped"
	Waiting  Status = "waiting"
	Error    Status = "error"
)

// serverResources stores host metrics
type serverResources struct {
	MemTotal     string `json:"memTotal"`
	MemAvailable string `json:"memAvailable"`
}

// ServerInfo stores static connection settings plus the latest observed host metrics.
type ServerInfo struct {
	Name         string `json:"name"`
	Username     string `yaml:"username" json:"-"`
	Host         string `yaml:"host" json:"-"`
	Port         int    `yaml:"port" json:"-"`
	PodmanSocket string `yaml:"podmanSocket" json:"-"`
	SshClient    string `yaml:"sshClient" json:"-"`
	IdentityFile string `yaml:"identityFile" json:"-"`
	RemoteDir    string `yaml:"remoteDir" json:"-"`

	serverResources
}

// ContainerManager tracks a single runtime container and its log sinks.
type ContainerManager struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Status     Status     `json:"status"`
	CreatedAt  time.Time  `json:"created_at"`
	FinishedAt *time.Time `json:"finished_at"`

	Stdin  io.Reader `json:"-"`
	Stdout *os.File  `json:"-"`
	Stderr *os.File  `json:"-"`

	Mu sync.RWMutex `json:"-"`
}

// ImageManager tracks a build context, the last built image, and the active container.
type ImageManager struct {
	ID         *string            `json:"id"`
	Name       string             `json:"name"`
	FilesDir   string             `json:"-"`
	Connection *ConnectionManager `json:"connection"`
	Container  *ContainerManager  `json:"container"`

	Mu sync.RWMutex `json:"-"`
}

// ConnectionManager wraps the remote Podman and SSH clients for one server.
type ConnectionManager struct {
	Conn       context.Context    `json:"-"`
	SshConn    *ssh.Client        `json:"-"`
	Server     ServerInfo         `json:"server"`
	ImageQueue chan *ImageManager `json:"-"`

	Mu sync.RWMutex `json:"-"`
}

// ServiceManager owns the in-memory registries for servers and images.
type ServiceManager struct {
	Connections SafeMap[string, *ConnectionManager] `json:"connections"`
	Images      SafeMap[string, *ImageManager]      `json:"images"`

	Mu sync.RWMutex
}
