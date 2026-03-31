import { Container, ContainerFile, ContainerStatus, ServerSummary } from "@/lib/types"

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

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init)

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

async function fetchContainerFiles(name: string): Promise<ContainerFile[]> {
  const fileNames = await request<string[] | null>(
    `/container/${encodeURIComponent(name)}/files`,
  )

  return asArray(fileNames).map((fileName) => ({
    name: fileName,
    path: `/${name}/${fileName}`,
    size: 0,
  }))
}

export async function fetchContainerFileContent(name: string, fileName: string) {
  const response = await fetch(
    `${API_BASE_URL}/container/${encodeURIComponent(name)}/file?f_name=${encodeURIComponent(fileName)}`,
  )

  if (!response.ok) {
    throw new Error(`Failed to load file ${fileName} for ${name}`)
  }

  return response.text()
}

export async function fetchContainers(): Promise<Container[]> {
  const [rawImages, rawConnections] = await Promise.all([
    request<ApiResponseMap<ApiImage> | null>("/containers"),
    request<ApiResponseMap<{ server: ApiServer }> | null>("/servers"),
  ])
  const images = asRecord(rawImages)
  const connections = asRecord(rawConnections)

  const containers = await Promise.all(
    Object.values(images).map(async (image) => {
      const files = await fetchContainerFiles(image.name)
      const dockerfile = files.some((file) => file.name === "Dockerfile")
        ? await fetchContainerFileContent(image.name, "Dockerfile")
        : ""
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
        dockerfile,
        status: mapStatus(image.container),
        files,
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
      } satisfies Container
    }),
  )

  return containers.sort((left, right) => left.name.localeCompare(right.name))
}

function mapServer(server: ApiServer): ServerSummary {
  return {
    name: server.name,
    memTotal: server.memTotal,
    memAvailable: server.memAvailable,
  }
}

export async function fetchServers(): Promise<ServerSummary[]> {
  const rawConnections = await request<ApiResponseMap<{ server: ApiServer }> | null>(
    "/servers",
  )
  const connections = asRecord(rawConnections)

  return Object.values(connections)
    .map((connection) => mapServer(connection.server))
    .sort((left, right) => left.name.localeCompare(right.name))
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
  entries: Array<{ file: File; path?: string }>,
) {
  const formData = new FormData()
  entries.forEach(({ file, path }) => {
    formData.append("files", file, file.name)
    formData.append("paths", path ?? file.name)
  })

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
        "Failed to upload file",
      ),
    )
  }
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
