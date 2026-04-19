package manager

import "encoding/json"

// MarshalJSON serializes a consistent snapshot of the container state.
func (cm *ContainerManager) MarshalJSON() ([]byte, error) {
	cm.Mu.RLock()
	defer cm.Mu.RUnlock()

	type alias ContainerManager
	return json.Marshal((*alias)(cm))
}
