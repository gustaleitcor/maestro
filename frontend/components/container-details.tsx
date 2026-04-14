"use client"

import { useEffect, useRef, useState } from "react"
import { Server, Box, Clock3, Plus, X, Pencil, Check, Square, Play, Hammer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ContainerFilesystem } from "@/components/container-filesystem"
import { Container, FolderUploadEntry, ServerSummary } from "@/lib/types"

interface ContainerDetailsProps {
  container: Container | null
  servers: ServerSummary[]
  isMutating?: boolean
  isLoadingDetails?: boolean
  onAddFile: (containerId: string) => void
  onRemoveFile: (containerId: string, fileId: string) => void
  onSaveFile?: (
    containerId: string,
    filePath: string,
    content: string,
  ) => Promise<void> | void
  onUploadEntries?: (
    containerId: string,
    entries: FolderUploadEntry[],
  ) => Promise<void> | void
  onClose: () => void
  onUpdateDockerfile?: (containerId: string, dockerfile: string) => Promise<void> | void
  onBuildContainer?: (containerId: string, serverName: string) => Promise<void> | void
  onRunContainer?: (containerId: string, serverName: string) => Promise<void> | void
  onStopContainer?: (containerId: string) => Promise<void> | void
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Server; label: string; value: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="break-words text-lg font-semibold text-foreground">
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function parseMemoryValue(value: string) {
  const match = value.match(/[\d.]+/)
  if (!match) {
    return null
  }

  const parsedValue = Number.parseFloat(match[0])
  return Number.isFinite(parsedValue) ? parsedValue : null
}

function formatMemoryValue(value: number) {
  return `${value.toFixed(2)} GiB`
}

function getServerMemorySnapshot(server: ServerSummary | null | undefined) {
  if (!server) {
    return null
  }

  const total = parseMemoryValue(server.memTotal)
  const available = parseMemoryValue(server.memAvailable)

  if (total === null || available === null || total <= 0) {
    return {
      used: null,
      available: server.memAvailable,
      total: server.memTotal,
      usagePercent: null,
    }
  }

  const used = Math.max(total - available, 0)
  const usagePercent = Math.min(Math.max((used / total) * 100, 0), 100)

  return {
    used: formatMemoryValue(used),
    available: formatMemoryValue(available),
    total: formatMemoryValue(total),
    usagePercent,
  }
}

function ServerResourcePanel({
  title,
  server,
}: {
  title: string
  server: ServerSummary | null | undefined
}) {
  const snapshot = getServerMemorySnapshot(server)

  if (!server || !snapshot) {
    return null
  }

  return (
    <div className="rounded-lg border border-border bg-accent/35 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{server.name}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs text-muted-foreground">Memory Used</p>
          <p className="text-sm font-semibold text-foreground">
            {snapshot.used ?? "Unavailable"}
            {snapshot.usagePercent !== null ? ` (${snapshot.usagePercent.toFixed(0)}%)` : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/80">
        <div
          className="h-full rounded-full bg-foreground/80 transition-[width]"
          style={{ width: `${snapshot.usagePercent ?? 0}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-foreground sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Used</p>
          <p className="font-medium">{snapshot.used ?? "Unavailable"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Available</p>
          <p className="font-medium">{snapshot.available}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-medium">{snapshot.total}</p>
        </div>
      </div>
    </div>
  )
}

export function ContainerDetails({
  container,
  servers,
  isMutating,
  isLoadingDetails,
  onAddFile,
  onRemoveFile,
  onSaveFile,
  onUploadEntries,
  onClose,
  onUpdateDockerfile,
  onBuildContainer,
  onRunContainer,
  onStopContainer,
}: ContainerDetailsProps) {
  const [isEditingDockerfile, setIsEditingDockerfile] = useState(false)
  const [dockerfileContent, setDockerfileContent] = useState("")
  const [serverName, setServerName] = useState("")
  const [hasServerDraft, setHasServerDraft] = useState(false)
  const containerId = container?.id ?? null
  const containerServerName = container?.server?.name ?? ""
  const previousContainerIdRef = useRef<string | null>(null)
  const selectedServerSummary =
    servers.find((server) => server.name === serverName) ??
    (container?.server?.name === serverName ? container.server : null)
  const shouldShowAssignedServerResources =
    Boolean(container?.server) &&
    container?.server?.name !== selectedServerSummary?.name

  useEffect(() => {
    if (containerId === previousContainerIdRef.current) {
      return
    }

    previousContainerIdRef.current = containerId

    if (!containerId) {
      setIsEditingDockerfile(false)
      setDockerfileContent("")
      setServerName("")
      setHasServerDraft(false)
      return
    }

    setIsEditingDockerfile(false)
    setDockerfileContent("")
    setServerName(containerServerName)
    setHasServerDraft(false)
  }, [containerId, containerServerName])

  useEffect(() => {
    if (!containerId || hasServerDraft) {
      return
    }

    setServerName(containerServerName)
  }, [containerId, containerServerName, hasServerDraft])

  const handleEditDockerfile = () => {
    if (container) {
      setDockerfileContent(container.dockerfile)
      setIsEditingDockerfile(true)
    }
  }

  const handleSaveDockerfile = () => {
    if (container && onUpdateDockerfile) {
      Promise.resolve(onUpdateDockerfile(container.id, dockerfileContent)).then(
        () => {
          setIsEditingDockerfile(false)
        },
      )
      return
    }
    setIsEditingDockerfile(false)
  }

  const handleCancelEdit = () => {
    setIsEditingDockerfile(false)
    setDockerfileContent("")
  }

  if (!container) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a container to view details</p>
      </div>
    )
  }

  const createdAt = container.runtime?.createdAt
    ? new Date(container.runtime.createdAt).toLocaleString()
    : "Not started"
  const finishedAt = container.runtime?.finishedAt
    ? new Date(container.runtime.finishedAt).toLocaleString()
    : "Still running"

  return (
    <div className="animate-panel-in flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{container.name}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="md:hidden">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="server-name" className="text-foreground">
                Target Server
              </Label>
              <Input
                id="server-name"
                list="server-options"
                value={serverName}
                onChange={(event) => {
                  setServerName(event.target.value)
                  setHasServerDraft(true)
                }}
                placeholder={servers.length > 0 ? "Select a server" : "No servers available"}
                disabled={servers.length === 0}
                className="bg-input border-border text-foreground"
              />
              <datalist id="server-options">
                {servers.map((server) => (
                  <option key={server.name} value={server.name} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => onBuildContainer?.(container.id, serverName)}
                disabled={!serverName || isMutating}
              >
                <Hammer className="h-3.5 w-3.5 mr-1" />
                Build
              </Button>
              <Button
                onClick={() => onRunContainer?.(container.id, serverName)}
                disabled={!serverName || isMutating}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                Run
              </Button>
              <Button
                variant="outline"
                onClick={() => onStopContainer?.(container.id)}
                disabled={isMutating || container.status === "stopped"}
              >
                <Square className="h-3.5 w-3.5 mr-1" />
                Stop
              </Button>
            </div>
          </div>
          <ServerResourcePanel
            title="Selected Server Resources"
            server={selectedServerSummary}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Dockerfile</h3>
            {isEditingDockerfile ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" variant="outline" onClick={handleSaveDockerfile}>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Save
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={handleEditDockerfile}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            )}
          </div>
          {isEditingDockerfile ? (
            <Textarea
              value={dockerfileContent}
              onChange={(e) => setDockerfileContent(e.target.value)}
              className="font-mono text-xs bg-input border-border text-foreground min-h-[200px] resize-y"
              placeholder="FROM node:18-alpine..."
            />
          ) : isLoadingDetails && !container.detailsLoaded ? (
            <div className="rounded-lg bg-accent/50 p-4 text-sm text-muted-foreground">
              Loading Dockerfile...
            </div>
          ) : (
            <div className="rounded-lg bg-accent/50 p-4 overflow-x-auto">
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">{container.dockerfile}</pre>
            </div>
          )}
        </div>

        <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Runtime</h3>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <StatCard icon={Server} label="Server" value={container.server?.name ?? "Unassigned"} />
            <StatCard icon={Box} label="Image ID" value={container.imageId ?? "Not built"} />
            <StatCard icon={Clock3} label="Created" value={createdAt} />
            <StatCard icon={Clock3} label="Finished" value={finishedAt} />
            </div>
            {shouldShowAssignedServerResources ? (
              <div className="mt-3">
                <ServerResourcePanel
                  title="Assigned Server Resources"
                  server={container.server}
                />
              </div>
            ) : null}
          </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Files</h3>
            <Button size="sm" variant="outline" onClick={() => onAddFile(container.id)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Content
            </Button>
          </div>
          <ContainerFilesystem
            containerName={container.name}
            entries={container.filesystem}
            isLoadingDetails={isLoadingDetails && !container.detailsLoaded}
            isMutating={isMutating}
            onRemovePath={(path) => onRemoveFile(container.id, path)}
            onSaveFile={(path, content) => onSaveFile?.(container.id, path, content)}
            onUploadEntries={(entries) => onUploadEntries?.(container.id, entries)}
          />
        </div>
      </div>
    </div>
  )
}
