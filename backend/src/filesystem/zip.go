package filesystem

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
)

func SaveZipFile(zipReader *zip.Reader, dst string) error {
	for _, zipFile := range zipReader.File {
		if !filepath.IsLocal(zipFile.Name) {
			continue
		}

		filePath := filepath.Join(dst, zipFile.Name)

		if zipFile.FileInfo().IsDir() {
			if err := os.MkdirAll(filePath, 0755); err != nil {
				return err
			}
			continue
		}

		file, err := zipFile.Open()
		if err != nil {
			return err
		}

		bytes, err := io.ReadAll(file)
		file.Close()
		if err != nil {
			return err
		}

		if err := os.WriteFile(filePath, bytes, 0644); err != nil {
			return err
		}
	}

	return nil
}
