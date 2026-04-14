import {
  ContainerDirectory,
  ContainerFile,
  ContainerFileSystemEntry,
} from "@/lib/types"

type BackendFilesystem = Record<string, string[] | null | undefined>

function asStringArray(value: string[] | null | undefined) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .sort((left, right) => left.localeCompare(right))
}

function normalizeDirectoryPath(path: string) {
  if (!path || path === ".") {
    return ""
  }

  return path.replace(/^\.?\//, "").replace(/\/+$/, "")
}

function joinRelativePath(parentPath: string, name: string) {
  return parentPath ? `${parentPath}/${name}` : name
}

function buildFile(parentPath: string, name: string): ContainerFile {
  return {
    kind: "file",
    name,
    path: joinRelativePath(parentPath, name),
    size: 0,
  }
}

export function buildContainerFilesystem(structure: BackendFilesystem | null | undefined): {
  files: ContainerFile[]
  filesystem: ContainerFileSystemEntry[]
} {
  const directories = new Map<string, string[]>()
  const directoryChildren = new Map<string, Set<string>>()

  for (const [rawDirectoryPath, entries] of Object.entries(structure ?? {})) {
    directories.set(normalizeDirectoryPath(rawDirectoryPath), asStringArray(entries))
  }

  if (!directories.has("")) {
    directories.set("", [])
  }

  for (const directoryPath of Array.from(directories.keys())) {
    if (!directoryPath) {
      continue
    }

    const segments = directoryPath.split("/")

    for (let index = 0; index < segments.length; index += 1) {
      const parentPath = segments.slice(0, index).join("/")
      const currentPath = segments.slice(0, index + 1).join("/")
      const segment = segments[index]

      if (!directories.has(currentPath)) {
        directories.set(currentPath, [])
      }

      if (!directoryChildren.has(parentPath)) {
        directoryChildren.set(parentPath, new Set())
      }

      directoryChildren.get(parentPath)?.add(segment)
    }
  }

  const files = Array.from(directories.entries())
    .flatMap(([directoryPath, fileNames]) =>
      fileNames.map((fileName) => buildFile(directoryPath, fileName)),
    )
    .sort((left, right) => left.path.localeCompare(right.path))

  const buildTree = (directoryPath: string): ContainerFileSystemEntry[] => {
    const childDirectories = Array.from(directoryChildren.get(directoryPath) ?? [])
      .sort((left, right) => left.localeCompare(right))
      .map((directoryName): ContainerDirectory => {
        const childPath = joinRelativePath(directoryPath, directoryName)

        return {
          kind: "directory",
          name: directoryName,
          path: childPath,
          children: buildTree(childPath),
        }
      })

    const childFiles = (directories.get(directoryPath) ?? []).map((fileName) =>
      buildFile(directoryPath, fileName),
    )

    return [...childDirectories, ...childFiles]
  }

  return {
    files,
    filesystem: buildTree(""),
  }
}

export function listContainerDirectories(entries: ContainerFileSystemEntry[]) {
  const directories = new Set<string>([""])

  const visit = (currentEntries: ContainerFileSystemEntry[]) => {
    for (const entry of currentEntries) {
      if (entry.kind !== "directory") {
        continue
      }

      directories.add(entry.path)
      visit(entry.children)
    }
  }

  visit(entries)

  return Array.from(directories).sort((left, right) => left.localeCompare(right))
}
