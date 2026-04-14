export interface ContainerFile {
  kind: "file"
  name: string
  path: string
  size: number
  content?: string
}

export interface ContainerDirectory {
  kind: "directory"
  name: string
  path: string
  children: ContainerFileSystemEntry[]
}

export type ContainerFileSystemEntry = ContainerFile | ContainerDirectory

export type ContainerStatus =
  | "running"
  | "stopped"
  | "error"
  | "pending"
  | "finished"

export interface ServerSummary {
  name: string
  memTotal: string
  memAvailable: string
}

export interface ContainerRuntime {
  id: string
  name: string
  createdAt: string
  finishedAt?: string | null
}

export interface FolderUploadEntry {
  file: File
  path: string
}

export interface Container {
  id: string
  name: string
  dockerfile: string
  detailsLoaded: boolean
  status: ContainerStatus
  files: ContainerFile[]
  filesystem: ContainerFileSystemEntry[]
  imageId?: string | null
  server?: ServerSummary | null
  runtime?: ContainerRuntime | null
}
