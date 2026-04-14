import { FolderUploadEntry } from "@/lib/types"

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile
}

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory
}

function joinPath(parentPath: string, name: string) {
  return parentPath ? `${parentPath}/${name}` : name
}

function sortEntries(entries: FolderUploadEntry[]) {
  return entries.sort((left, right) => left.path.localeCompare(right.path))
}

function getFileFromEntry(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

function readEntries(reader: FileSystemDirectoryReader) {
  return new Promise<FileSystemEntry[]>((resolve, reject) => {
    reader.readEntries(resolve, reject)
  })
}

async function readAllDirectoryEntries(entry: FileSystemDirectoryEntry) {
  const reader = entry.createReader()
  const children: FileSystemEntry[] = []

  while (true) {
    const batch = await readEntries(reader)
    if (batch.length === 0) {
      return children
    }

    children.push(...batch)
  }
}

async function collectEntry(
  entry: FileSystemEntry,
  parentPath: string,
): Promise<FolderUploadEntry[]> {
  const entryPath = joinPath(parentPath, entry.name)

  if (isFileEntry(entry)) {
    return [
      {
        file: await getFileFromEntry(entry),
        path: entryPath,
      },
    ]
  }

  if (!isDirectoryEntry(entry)) {
    return []
  }

  const children = await readAllDirectoryEntries(entry)
  const nestedEntries = await Promise.all(
    children.map((child) => collectEntry(child, entryPath)),
  )

  return sortEntries(nestedEntries.flat())
}

export function hasFilePayload(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes("Files")
}

export async function collectDroppedEntries(
  dataTransfer: DataTransfer,
  targetDirectory: string,
) {
  const draggedEntries = Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null)

  if (draggedEntries.length > 0) {
    const entries = (
      await Promise.all(
        draggedEntries.map((entry) => collectEntry(entry, targetDirectory)),
      )
    ).flat()

    return sortEntries(entries)
  }

  return sortEntries(
    Array.from(dataTransfer.files).map((file) => ({
      file,
      path: joinPath(targetDirectory, file.name),
    })),
  )
}
