import { buildContainerFilesystem } from "@/lib/filesystem"
import { createZipArchive } from "@/lib/zip"
import {
  Container,
  ContainerStatus,
  FolderUploadEntry,
  ServerSummary,
} from "@/lib/types"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "/api/backend"

type ApiServer = {
  name: string
  memTotal: string
  memAvailable: string
}

type ApiConnection = {
  server: ApiServer
}

type ApiRuntime = {
  id: string
  name: string
  status: string
  created_at: string
  finished_at?: string | null
}

type ApiImage = {
  id: string | null
  name: string
  connection: ApiConnection | null
  container: ApiRuntime | null
}

type ApiResponseMap<T> = Record<string, T>
type ApiFilesystem = Record<string, string[] | null | undefined>
type UploadEntry = {
  file: File
  path?: string
}
type ApiDashboardResponse = {
  containers: ApiResponseMap<ApiImage> | null
  servers: ApiResponseMap<{ server: ApiServer }> | null
}
type ApiContainerDetailsResponse = {
  filesystem: ApiFilesystem | null
  dockerfile: string
}

function asRecord<T>(value: Record<string, T> | null | undefined): Record<string, T> {
  return value && typeof value === "object" ? value : {}
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error
  }

  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message
  }

  return fallback
}

function getArchiveFileName(containerName: string, entries: UploadEntry[]) {
  const firstPath = entries[0]?.path
  if (!firstPath) {
    return `${containerName}.zip`
  }

  const rootSegment = firstPath.split("/")[0]
  return `${rootSegment || containerName}.zip`
}

function getFileUrl(name: string, fileName: string) {
  return `${API_BASE_URL}/container/${encodeURIComponent(name)}/file?f_name=${encodeURIComponent(fileName)}`
}

function getPathFileName(filePath: string) {
  const normalizedPath = filePath.replace(/\/+$/, "")
  const segments = normalizedPath.split("/")
  return segments[segments.length - 1] || filePath || "file"
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`

    try {
      const payload = (await response.json()) as { error?: string; message?: string }
      message = payload.error ?? payload.message ?? message
    } catch {
      // Ignore JSON parsing errors and fall back to the HTTP status text.
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

function mapStatus(runtime: ApiRuntime | null): ContainerStatus {
  if (!runtime) {
    return "stopped"
  }

  switch (runtime.status.toLowerCase()) {
    case "running":
      return "running"
    case "error":
      return "error"
    case "waiting":
      return "pending"
    case "finished":
      return "finished"
    case "stopped":
      return "stopped"
    default:
      return "stopped"
  }
}

export async function fetchContainerFileContent(name: string, fileName: string) {
  const response = await fetch(getFileUrl(name, fileName), {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Failed to load file ${fileName} for ${name}`)
  }

  return response.text()
}

export function getContainerFileDownloadUrl(name: string, fileName: string) {
  return getFileUrl(name, fileName)
}

function mapContainerOverview(
  image: ApiImage,
  connections: Record<string, { server: ApiServer }>,
): Container {
  const serverName = image.connection?.server.name
  const server =
    serverName && connections[serverName]
      ? mapServer(connections[serverName].server)
      : image.connection?.server
        ? mapServer(image.connection.server)
        : null

  return {
    id: image.name,
    name: image.name,
    dockerfile: "",
    detailsLoaded: false,
    status: mapStatus(image.container),
    files: [],
    filesystem: [],
    imageId: image.id,
    server,
    runtime: image.container
      ? {
          id: image.container.id,
          name: image.container.name,
          createdAt: image.container.created_at,
          finishedAt: image.container.finished_at ?? null,
        }
      : null,
  }
}

export async function fetchDashboard() {
  const payload = await request<ApiDashboardResponse>("/dashboard")
  const images = asRecord(payload.containers)
  const connections = asRecord(payload.servers)

  const containers = Object.values(images)
    .map((image) => mapContainerOverview(image, connections))
    .sort((left, right) => left.name.localeCompare(right.name))

  const servers = Object.values(connections)
    .map((connection) => mapServer(connection.server))
    .sort((left, right) => left.name.localeCompare(right.name))

  return { containers, servers }
}

export async function fetchContainerDetails(name: string) {
  const payload = await request<ApiContainerDetailsResponse>(
    `/container/${encodeURIComponent(name)}/details`,
  )
  const { files, filesystem } = buildContainerFilesystem(payload.filesystem)

  return {
    dockerfile: payload.dockerfile,
    files,
    filesystem,
  }
}

function mapServer(server: ApiServer): ServerSummary {
  return {
    name: server.name,
    memTotal: server.memTotal,
    memAvailable: server.memAvailable,
  }
}

export async function createContainer(name: string, dockerfile: string) {
  await request(`/container/${encodeURIComponent(name)}`, {
    method: "POST",
  })

  await uploadFiles(name, [
    {
      file: new File([dockerfile], "Dockerfile", { type: "text/plain" }),
      path: "Dockerfile",
    },
  ])
}

export async function deleteContainer(name: string) {
  await request(`/container/${encodeURIComponent(name)}`, {
    method: "DELETE",
  })
}

export async function uploadFiles(
  name: string,
  entries: UploadEntry[],
) {
  const archiveEntries = await Promise.all(
    entries.map(async ({ file, path }) => ({
      path: path ?? file.name,
      data: new Uint8Array(await file.arrayBuffer()),
      lastModified: file.lastModified || Date.now(),
    })),
  )
  const archive = createZipArchive(archiveEntries)
  const formData = new FormData()
  formData.append(
    "file",
    new File([archive], getArchiveFileName(name, entries), {
      type: "application/zip",
    }),
  )

  const response = await fetch(
    `/api/container/${encodeURIComponent(name)}/files`,
    {
      method: "POST",
      body: formData,
    },
  )

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        await response.json().catch(() => undefined),
        "Failed to upload archive",
      ),
    )
  }
}

export async function uploadFolderEntries(name: string, entries: FolderUploadEntry[]) {
  return uploadFiles(
    name,
    entries,
  )
}

export async function uploadFile(name: string, file: File) {
  await uploadFiles(name, [{ file }])
}

export async function deleteFile(name: string, fileName: string) {
  await request(
    `/container/${encodeURIComponent(name)}/file?f_name=${encodeURIComponent(fileName)}`,
    {
      method: "DELETE",
    },
  )
}

export async function saveDockerfile(name: string, dockerfile: string) {
  const file = new File([dockerfile], "Dockerfile", { type: "text/plain" })
  await uploadFiles(name, [{ file, path: "Dockerfile" }])
}

export async function saveContainerFileContent(
  name: string,
  filePath: string,
  content: string,
) {
  const file = new File([content], getPathFileName(filePath), { type: "text/plain" })
  await uploadFiles(name, [{ file, path: filePath }])
}

export async function buildContainer(name: string, serverName: string) {
  await request(
    `/container/${encodeURIComponent(name)}/build?serverName=${encodeURIComponent(serverName)}`,
    {
      method: "POST",
    },
  )
}

export async function runContainer(name: string, serverName: string) {
  await request(
    `/container/${encodeURIComponent(name)}/run?serverName=${encodeURIComponent(serverName)}`,
    {
      method: "POST",
    },
  )
}

export async function stopContainer(name: string) {
  await request(`/container/${encodeURIComponent(name)}/stop`, {
    method: "POST",
  })
}
