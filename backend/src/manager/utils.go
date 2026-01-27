package manager

import "sync"

// SafeMap is a type-safe concurrent map using generics.
type SafeMap[K comparable, V any] struct {
	m sync.Map
}

// Store sets the value for a key.
func (m *SafeMap[K, V]) Store(key K, value V) {
	m.m.Store(key, value)
}

// Load returns the value stored in the map for a key, or nil if no value is present.
func (m *SafeMap[K, V]) Load(key K) (value V, ok bool) {
	v, ok := m.m.Load(key)
	if !ok {
		var zero V // Return zero value for V if not found
		return zero, false
	}
	return v.(V), ok
}

func (m *SafeMap[K, V]) Delete(key K) {
	m.m.Delete(key)
}

func (m *SafeMap[K, V]) Range(f func(key K, value V) bool) {
	m.m.Range(func(key, value any) bool {
		return f(key.(K), value.(V))
	})
}

func (m *SafeMap[K, V]) Exists(key K) bool {
	_, ok := m.m.Load(key)
	return ok
}

func (m *SafeMap[K, V]) Keys() []K {
	var keys []K
	m.Range(func(key K, _ V) bool {
		keys = append(keys, key)
		return true
	})
	return keys
}

func (m *SafeMap[K, V]) Values() []V {
	var values []V
	m.Range(func(_ K, value V) bool {
		values = append(values, value)
		return true
	})
	return values
}

func (m *SafeMap[K, V]) Len() int {
	var count int
	m.Range(func(_ K, _ V) bool {
		count++
		return true
	})
	return count
}

func (m *SafeMap[K, V]) Pairs() map[K]V {
	pairs := make(map[K]V, m.Len())
	m.Range(func(key K, value V) bool {
		pairs[key] = value
		return true
	})
	return pairs
}
