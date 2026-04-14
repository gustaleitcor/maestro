package filesystem

import (
	"io/fs"
	"path/filepath"
)

func GetFolderStructure(src string) (map[string][]string, error) {
	nodes := map[string][]string{
		".": make([]string, 0, 4),
	}

	err := filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}

		if relPath == "." {
			return nil
		}

		parentPath := filepath.Dir(relPath)
		if _, ok := nodes[parentPath]; !ok {
			nodes[parentPath] = make([]string, 0, 4)
		}

		if d.IsDir() {
			if _, ok := nodes[relPath]; !ok {
				nodes[relPath] = make([]string, 0, 4)
			}
			return nil
		}

		nodes[parentPath] = append(nodes[parentPath], filepath.Base(relPath))

		return nil
	})
	if err != nil {
		return nil, err
	}

	return nodes, nil
}
