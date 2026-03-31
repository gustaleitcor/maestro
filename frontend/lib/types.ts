export interface ContainerFile {
  name: string
  path: string
  size: number
  content?: string
}

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

export interface Container {
  id: string
  name: string
  dockerfile: string
  status: ContainerStatus
  files: ContainerFile[]
  imageId?: string | null
  server?: ServerSummary | null
  runtime?: ContainerRuntime | null
}
