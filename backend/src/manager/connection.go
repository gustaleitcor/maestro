package manager

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/containers/podman/v6/pkg/bindings"
	"github.com/containers/podman/v6/pkg/bindings/containers"
	"github.com/containers/podman/v6/pkg/bindings/system"
	"golang.org/x/crypto/ssh"
)

// NewServerConnection creates the Podman and SSH clients used to manage a server.
func NewServerConnection(serverName string, serverInfo ServerInfo) (*ConnectionManager, error) {
	serverURI := fmt.Sprintf("%s@%s:%d", serverInfo.Username, serverInfo.Host, serverInfo.Port)
	log.Printf("Connecting to server %s: user=%s host=%s port=%d socket=%s uri=%s", serverName, serverInfo.Username, serverInfo.Host, serverInfo.Port, serverInfo.PodmanSocket, serverURI)
	uri, err := url.ParseRequestURI(fmt.Sprintf("ssh://%s%s", serverURI, serverInfo.PodmanSocket))
	if err != nil {
		return nil, err
	}

	podmanConn, err := bindings.NewConnectionWithIdentity(context.Background(), uri.String(), serverInfo.IdentityFile, true)
	if err != nil {
		return nil, err
	}

	key, _ := os.ReadFile(serverInfo.IdentityFile)
	signer, _ := ssh.ParsePrivateKey(key)

	sshConfig := &ssh.ClientConfig{
		User: serverInfo.Username,
		Auth: []ssh.AuthMethod{
			ssh.PublicKeys(signer),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	// Open a separate SSH session for lightweight host-level commands such as /proc/meminfo.
	portStr := strconv.Itoa(serverInfo.Port)
	addr := serverInfo.Host + ":" + portStr
	sshClient, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return nil, err
	}

	info, _ := system.Info(podmanConn, nil)

	serverInfo.Name = serverName
	// Cache total memory once at startup; available memory is refreshed by PollServersStatus.
	serverInfo.MemTotal = fmt.Sprintf("%.2fGiB", float32(info.Host.MemTotal)/1024/1024/1024)

	connectionManager := &ConnectionManager{
		Conn:       podmanConn,
		SshConn:    sshClient,
		Server:     serverInfo,
		ImageQueue: make(chan *ImageManager),
	}

	return connectionManager, nil
}

// PollServersStatus refreshes lightweight host metrics for every configured server.
func PollServersStatus(sm *ServiceManager) {
	for {
		sm.Connections.Range(func(serverName string, connectionManager *ConnectionManager) bool {
			// Read MemAvailable directly from /proc/meminfo to keep the dashboard lightweight.
			session, err := connectionManager.SshConn.NewSession()
			if err != nil {
				log.Printf("Error ssh session server %s: %v", serverName, err)
				return true
			}
			defer session.Close()

			var out bytes.Buffer
			session.Stdout = &out

			err = session.Run("awk '/MemAvailable/ {print $2}' /proc/meminfo")
			if err != nil {
				log.Printf("Error running free command on server %s: %v", serverName, err)
				return true
			}

			raw := strings.TrimSpace(out.String())
			mem, _ := strconv.ParseFloat(raw, 64)

			connectionManager.Mu.Lock()
			connectionManager.Server.MemAvailable = fmt.Sprintf("%.2fGiB", mem/1024/1024)
			connectionManager.Mu.Unlock()

			return true
		})

		time.Sleep(time.Second * 3)
	}
}

// PollContainersStatus refreshes container state and marks finished containers accordingly.
func PollContainersStatus(sm *ServiceManager) {
	for {
		sm.Images.Range(func(imageName string, imageManager *ImageManager) bool {
			imageManager.Mu.Lock()
			defer imageManager.Mu.Unlock()
			if imageManager.Container != nil && imageManager.Connection != nil {
				// Inspect the container to reconcile the in-memory state with Podman.
				containerReport, err := containers.Inspect(imageManager.Connection.Conn, imageManager.Container.ID, &containers.InspectOptions{
					Size: new(false),
				})
				if err != nil {
					log.Printf("Error inspecting container %s: %v", imageManager.Container.ID, err)
				} else {
					// Mark the run as finished once Podman reports it has exited.
					switch containerReport.State.Status {
					case "exited":
						imageManager.Container.FinishedAt = &containerReport.State.FinishedAt
						imageManager.Container.Status = Finished
						imageManager.Container.Stdout.Close()
						imageManager.Container.Stderr.Close()
					}
				}
			}
			return true
		})

		time.Sleep(time.Second * 5)
	}
}

// MarshalJSON serializes a consistent snapshot of the connection state.
func (cm *ConnectionManager) MarshalJSON() ([]byte, error) {
	cm.Mu.RLock()
	defer cm.Mu.RUnlock()

	type alias ConnectionManager
	return json.Marshal((*alias)(cm))
}
