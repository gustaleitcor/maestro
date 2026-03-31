"use client"

import { useEffect, useRef, useState } from "react"
import { Server, Box, Clock3, FileText, Plus, Trash2, X, Pencil, Check, Square, Play, Hammer, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { fetchContainerFileContent } from "@/lib/api"
import { Container, ContainerFile } from "@/lib/types"

const OPEN_FILE_REFRESH_INTERVAL_MS = 5000

interface ContainerDetailsProps {
  container: Container | null
  servers: string[]
  isMutating?: boolean
  onAddFile: (containerId: string) => void
  onRemoveFile: (containerId: string, fileId: string) => void
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

function FileItem({
  containerName,
  file,
  onRemove,
}: {
  containerName: string
  file: ContainerFile
  onRemove: () => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [content, setContent] = useState(file.content)
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)
  const contentRef = useRef(content)

  useEffect(() => {
    if (file.content !== undefined) {
      setContent(file.content)
    }
  }, [file.content])

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    if (!isExpanded) {
      return
    }

    let isCancelled = false

    const loadContent = async (showLoading: boolean) => {
      if (showLoading) {
        setIsLoadingContent(true)
      }

      try {
        const nextContent = await fetchContainerFileContent(containerName, file.name)
        if (isCancelled) {
          return
        }
        setContent(nextContent)
        setContentError(null)
      } catch (error) {
        if (isCancelled) {
          return
        }
        setContentError(
          error instanceof Error ? error.message : "Failed to load file",
        )
      } finally {
        if (!isCancelled && showLoading) {
          setIsLoadingContent(false)
        }
      }
    }

    void loadContent(contentRef.current === undefined)
    const intervalId = window.setInterval(() => {
      void loadContent(false)
    }, OPEN_FILE_REFRESH_INTERVAL_MS)

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
    }
  }, [containerName, file.name, isExpanded])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const fullContent = content || "// Empty file"

  return (
    <div className="rounded-lg border border-border bg-accent/30">
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{file.path}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? (
              <ChevronDown className="mr-1 h-4 w-4" />
            ) : (
              <ChevronRight className="mr-1 h-4 w-4" />
            )}
            {isExpanded ? "Hide" : "Show"}
          </Button>
          <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </div>
      {isExpanded ? (
        <div className="border-t border-border bg-background/60 p-3">
          {isLoadingContent ? (
            <p className="text-xs text-muted-foreground">Loading file...</p>
          ) : contentError ? (
            <p className="text-xs text-destructive">{contentError}</p>
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-foreground">
              {fullContent}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function ContainerDetails({
  container,
  servers,
  isMutating,
  onAddFile,
  onRemoveFile,
  onClose,
  onUpdateDockerfile,
  onBuildContainer,
  onRunContainer,
  onStopContainer,
}: ContainerDetailsProps) {
  const [isEditingDockerfile, setIsEditingDockerfile] = useState(false)
  const [dockerfileContent, setDockerfileContent] = useState("")
  const [serverName, setServerName] = useState("")

  useEffect(() => {
    if (!container) {
      setServerName("")
      return
    }

    setServerName(container.server?.name ?? "")
  }, [container])

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
                onChange={(event) => setServerName(event.target.value)}
                placeholder={servers.length > 0 ? "Select a server" : "No servers available"}
                disabled={servers.length === 0}
                className="bg-input border-border text-foreground"
              />
              <datalist id="server-options">
                {servers.map((server) => (
                  <option key={server} value={server} />
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
          </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Files</h3>
            <Button size="sm" variant="outline" onClick={() => onAddFile(container.id)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add File
            </Button>
          </div>
          {container.files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 rounded-lg border border-dashed border-border text-muted-foreground">
              <FileText className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No files associated</p>
            </div>
          ) : (
            <div className="space-y-2">
              {container.files.map((file) => (
                <FileItem
                  containerName={container.name}
                  key={file.name}
                  file={file}
                  onRemove={() => onRemoveFile(container.id, file.name)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
