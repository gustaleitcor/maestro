export interface ContainerFile {
  id: string
  name: string
  path: string
  size: number
}

export interface ContainerStats {
  cpu: number
  memory: number
  disk: number
  uptime: string
}

export interface Container {
  id: string
  name: string
  dockerfile: string
  status: "running" | "stopped" | "error" | "pending"
  stats: ContainerStats
  files: ContainerFile[]
}
