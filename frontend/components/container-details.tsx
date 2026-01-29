"use client"

import { useState } from "react"
import { Cpu, HardDrive, MemoryStick, Clock, FileText, Plus, Trash2, X, Pencil, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Container, ContainerFile } from "@/lib/types"

interface ContainerDetailsProps {
  container: Container | null
  onAddFile: (containerId: string) => void
  onRemoveFile: (containerId: string, fileId: string) => void
  onClose: () => void
  onUpdateDockerfile?: (containerId: string, dockerfile: string) => void
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold text-foreground">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FileItem({ file, onRemove }: { file: ContainerFile; onRemove: () => void }) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-accent/50 hover:bg-accent transition-colors">
      <div className="flex items-center gap-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">{file.name}</p>
          <p className="text-xs text-muted-foreground">{file.path}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>
    </div>
  )
}

export function ContainerDetails({ container, onAddFile, onRemoveFile, onClose, onUpdateDockerfile }: ContainerDetailsProps) {
  const [isEditingDockerfile, setIsEditingDockerfile] = useState(false)
  const [dockerfileContent, setDockerfileContent] = useState("")

  const handleEditDockerfile = () => {
    if (container) {
      setDockerfileContent(container.dockerfile)
      setIsEditingDockerfile(true)
    }
  }

  const handleSaveDockerfile = () => {
    if (container && onUpdateDockerfile) {
      onUpdateDockerfile(container.id, dockerfileContent)
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{container.name}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="md:hidden">
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex-1 overflow-auto p-4 space-y-6">
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
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Statistics</h3>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Cpu} label="CPU Usage" value={`${container.stats.cpu}%`} />
            <StatCard icon={MemoryStick} label="Memory" value={`${container.stats.memory} MB`} />
            <StatCard icon={HardDrive} label="Disk" value={`${container.stats.disk} GB`} />
            <StatCard icon={Clock} label="Uptime" value={container.stats.uptime} />
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
                  key={file.id}
                  file={file}
                  onRemove={() => onRemoveFile(container.id, file.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
