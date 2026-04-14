"use client"

import { DragEvent, useEffect, useRef, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  fetchContainerFileContent,
  getContainerFileDownloadUrl,
} from "@/lib/api"
import { highlightCode } from "@/lib/code-highlighting"
import { collectDroppedEntries, hasFilePayload } from "@/lib/drop-upload"
import {
  ContainerDirectory,
  ContainerFile,
  ContainerFileSystemEntry,
  FolderUploadEntry,
} from "@/lib/types"

const OPEN_FILE_REFRESH_INTERVAL_MS = 5000
const TREE_INDENT_GUIDE_COUNT = 1
const NON_PREVIEWABLE_SUFFIXES = [
  ".7z",
  ".a",
  ".avi",
  ".bin",
  ".bmp",
  ".bz2",
  ".class",
  ".db",
  ".dll",
  ".dmg",
  ".ear",
  ".eot",
  ".exe",
  ".flac",
  ".gif",
  ".gz",
  ".ico",
  ".img",
  ".iso",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".o",
  ".obj",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".pyc",
  ".pyo",
  ".rar",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tar.bz2",
  ".tar.gz",
  ".tar.xz",
  ".tar.zst",
  ".tbz2",
  ".tgz",
  ".ttf",
  ".txz",
  ".war",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xz",
  ".zip",
  ".zst",
] as const

interface ContainerFilesystemProps {
  containerName: string
  entries: ContainerFileSystemEntry[]
  isLoadingDetails?: boolean
  isMutating?: boolean
  onRemovePath: (path: string) => void
  onSaveFile?: (path: string, content: string) => Promise<void> | void
  onUploadEntries?: (entries: FolderUploadEntry[]) => Promise<void> | void
}

function useDropZone({
  targetDirectory,
  isMutating,
  onUploadEntries,
}: {
  targetDirectory: string
  isMutating?: boolean
  onUploadEntries?: (entries: FolderUploadEntry[]) => Promise<void> | void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragDepthRef = useRef(0)

  const canHandleDrop = !isMutating && Boolean(onUploadEntries)

  const resetDragState = () => {
    dragDepthRef.current = 0
    setIsDragOver(false)
  }

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!canHandleDrop || !hasFilePayload(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current += 1
    setIsDragOver(true)
  }

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!canHandleDrop || !hasFilePayload(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "copy"
    if (!isDragOver) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!canHandleDrop || !hasFilePayload(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)

    if (dragDepthRef.current === 0) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!canHandleDrop || !onUploadEntries) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    resetDragState()

    void collectDroppedEntries(event.dataTransfer, targetDirectory)
      .then((entries) => {
        if (entries.length === 0) {
          return
        }

        return onUploadEntries(entries)
      })
      .catch(() => undefined)
  }

  return {
    isDragOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}

function DropHint({ label }: { label: string }) {
  return (
    <div className="pointer-events-none rounded-lg border border-dashed border-foreground/25 bg-foreground/5 px-3 py-2">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <Upload className="h-3.5 w-3.5" />
        Drop Target
      </p>
      <p className="mt-1 text-sm text-foreground">{label}</p>
    </div>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isPreviewableFile(path: string) {
  const normalizedPath = path.toLowerCase()
  return !NON_PREVIEWABLE_SUFFIXES.some((suffix) => normalizedPath.endsWith(suffix))
}

function TreeIndent({ depth }: { depth: number }) {
  if (depth < 1) {
    return null
  }

  return (
    <div aria-hidden className="flex shrink-0 items-stretch gap-2 self-stretch">
      {Array.from({ length: depth - TREE_INDENT_GUIDE_COUNT }).map((_, index) => (
        <div key={index} className="flex w-3 justify-center">
          <span className="h-full w-px rounded-full bg-border/55" />
        </div>
      ))}
      <div className="flex w-5 items-center">
        <span className="h-px w-full rounded-full bg-border/75" />
      </div>
    </div>
  )
}

function formatItemCount(count: number) {
  return `${count} ${count === 1 ? "item" : "items"}`
}

function FileNode({
  containerName,
  file,
  depth,
  isMutating,
  onRemovePath,
  onSaveFile,
}: {
  containerName: string
  file: ContainerFile
  depth: number
  isMutating?: boolean
  onRemovePath: (path: string) => void
  onSaveFile?: (path: string, content: string) => Promise<void> | void
}) {
  const canPreview = isPreviewableFile(file.path)
  const canEdit = canPreview && Boolean(onSaveFile)
  const downloadUrl = getContainerFileDownloadUrl(containerName, file.path)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [content, setContent] = useState(file.content)
  const [draftContent, setDraftContent] = useState("")
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [contentError, setContentError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
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
    if (!isExpanded || !canPreview || isEditing) {
      return
    }

    let isCancelled = false

    const loadContent = async (showLoading: boolean) => {
      if (showLoading) {
        setIsLoadingContent(true)
      }

      try {
        const nextContent = await fetchContainerFileContent(containerName, file.path)
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
  }, [canPreview, containerName, file.path, isEditing, isExpanded])

  const hasLoadedContent = content !== undefined
  const fullContent = content || "// Empty file"
  const highlightedContent = highlightCode(fullContent, file.path)

  const handleStartEditing = () => {
    if (!hasLoadedContent) {
      return
    }

    setDraftContent(contentRef.current ?? "")
    setSaveError(null)
    setIsEditing(true)
  }

  const handleCancelEditing = () => {
    setDraftContent(contentRef.current ?? "")
    setSaveError(null)
    setIsEditing(false)
  }

  const handleSaveFile = async () => {
    if (!onSaveFile) {
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      await onSaveFile(file.path, draftContent)
      setContent(draftContent)
      setIsEditing(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save file")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-gradient-to-r from-card via-card to-accent/30 shadow-sm transition-colors hover:border-border">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <button
          type="button"
          className={`flex min-w-0 flex-1 items-center gap-3 text-left ${
            canPreview && !isEditing ? "cursor-pointer" : "cursor-default"
          }`}
          disabled={!canPreview || isEditing}
          onClick={() => setIsExpanded((current) => !current)}
        >
          <TreeIndent depth={depth} />
          {canPreview ? isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/80">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="truncate text-xs text-muted-foreground">{file.path}</p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          {!canPreview ? (
            <span className="rounded-full border border-border/70 bg-background/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              No preview
            </span>
          ) : null}
          <span className="rounded-full border border-border/70 bg-background/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {formatSize(file.size)}
          </span>
          <Button
            asChild
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7 rounded-md"
          >
            <a
              href={downloadUrl}
              download={file.name}
              aria-label={`Download ${file.path}`}
              title={`Download ${file.path}`}
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7 rounded-md"
            disabled={isMutating || isSaving}
            onClick={() => onRemovePath(file.path)}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </div>
      {isExpanded ? (
        <div className="space-y-3 border-t border-border/70 bg-background/80 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <p className="truncate text-xs text-muted-foreground">{file.path}</p>
              <span className="rounded-full border border-border/70 bg-background/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {highlightedContent.languageLabel}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                isEditing ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isSaving}
                      onClick={handleCancelEditing}
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => void handleSaveFile()}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isMutating || isLoadingContent || !hasLoadedContent}
                    onClick={handleStartEditing}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                )
              ) : null}
            </div>
          </div>
          {isLoadingContent ? (
            <p className="text-xs text-muted-foreground">Loading file...</p>
          ) : contentError ? (
            <p className="text-xs text-destructive">{contentError}</p>
          ) : isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                className="min-h-[240px] resize-y font-mono text-xs"
                spellCheck={false}
              />
              {saveError ? (
                <p className="text-xs text-destructive">{saveError}</p>
              ) : null}
            </div>
          ) : (
            <pre className="overflow-x-auto rounded-xl border border-slate-800/90 bg-slate-950 px-4 py-3 shadow-inner">
              <code
                className="block whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-100 [&_.token-comment]:text-emerald-300/70 [&_.token-function]:text-cyan-200 [&_.token-keyword]:text-sky-300 [&_.token-number]:text-fuchsia-300 [&_.token-property]:text-amber-200 [&_.token-string]:text-orange-300"
                dangerouslySetInnerHTML={{ __html: highlightedContent.html }}
              />
            </pre>
          )}
        </div>
      ) : null}
    </div>
  )
}

function DirectoryNode({
  containerName,
  directory,
  depth,
  isMutating,
  onRemovePath,
  onSaveFile,
  onUploadEntries,
}: {
  containerName: string
  directory: ContainerDirectory
  depth: number
  isMutating?: boolean
  onRemovePath: (path: string) => void
  onSaveFile?: (path: string, content: string) => Promise<void> | void
  onUploadEntries?: (entries: FolderUploadEntry[]) => Promise<void> | void
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 1)
  const {
    isDragOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useDropZone({
    targetDirectory: directory.path,
    isMutating,
    onUploadEntries,
  })
  const childCount = directory.children.length

  return (
    <div
      className="space-y-2"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`overflow-hidden rounded-xl border bg-gradient-to-r shadow-sm transition-colors ${
          isDragOver
            ? "border-foreground/25 from-accent/20 via-card to-accent/65"
            : "border-border/70 from-card via-card to-accent/40 hover:border-border"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            onClick={() => setIsExpanded((current) => !current)}
          >
            <TreeIndent depth={depth} />
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/80">
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Folder className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{directory.name}</p>
              <p className="truncate text-xs text-muted-foreground">{directory.path}</p>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border/70 bg-background/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {formatItemCount(childCount)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="h-7 w-7 rounded-md"
              onClick={() => onRemovePath(directory.path)}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
        {isDragOver ? (
          <div className="border-t border-border/70 px-3 pb-3 pt-2">
            <DropHint label={`Add items to ${directory.path}`} />
          </div>
        ) : null}
      </div>
      {isExpanded ? (
        <div className="ml-5 space-y-2 border-l border-dashed border-border/70 pl-4">
          {directory.children.map((entry) => (
            <FilesystemNode
              containerName={containerName}
              key={entry.path}
              entry={entry}
              depth={depth + 1}
              isMutating={isMutating}
              onRemovePath={onRemovePath}
              onSaveFile={onSaveFile}
              onUploadEntries={onUploadEntries}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function FilesystemNode({
  containerName,
  entry,
  depth,
  isMutating,
  onRemovePath,
  onSaveFile,
  onUploadEntries,
}: {
  containerName: string
  entry: ContainerFileSystemEntry
  depth: number
  isMutating?: boolean
  onRemovePath: (path: string) => void
  onSaveFile?: (path: string, content: string) => Promise<void> | void
  onUploadEntries?: (entries: FolderUploadEntry[]) => Promise<void> | void
}) {
  if (entry.kind === "directory") {
    return (
      <DirectoryNode
        containerName={containerName}
        directory={entry}
        depth={depth}
        isMutating={isMutating}
        onRemovePath={onRemovePath}
        onSaveFile={onSaveFile}
        onUploadEntries={onUploadEntries}
      />
    )
  }

  return (
    <FileNode
      containerName={containerName}
      file={entry}
      depth={depth}
      isMutating={isMutating}
      onRemovePath={onRemovePath}
      onSaveFile={onSaveFile}
    />
  )
}

export function ContainerFilesystem({
  containerName,
  entries,
  isLoadingDetails,
  isMutating,
  onRemovePath,
  onSaveFile,
  onUploadEntries,
}: ContainerFilesystemProps) {
  const {
    isDragOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useDropZone({
    targetDirectory: "",
    isMutating,
    onUploadEntries,
  })

  if (isLoadingDetails) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
        <FileText className="mb-2 h-8 w-8 opacity-50" />
        <p className="text-sm">Loading files...</p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div
        className={`flex h-40 flex-col items-center justify-center rounded-lg border border-dashed transition-colors ${
          isDragOver
            ? "border-foreground/25 bg-accent/50 text-foreground"
            : "border-border text-muted-foreground"
        }`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <FileText className="mb-2 h-8 w-8 opacity-50" />
        <p className="text-sm">No files associated</p>
        <p className="mt-1 text-xs">
          Drop files or folders here to upload them to the root
        </p>
      </div>
    )
  }

  return (
    <div
      className={`space-y-3 rounded-2xl border p-3 shadow-sm transition-colors ${
        isDragOver
          ? "border-foreground/25 bg-accent/25"
          : "border-border/70 bg-card/40"
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver ? <DropHint label="Add items to the container root" /> : null}
      {entries.map((entry) => (
        <FilesystemNode
          containerName={containerName}
          key={entry.path}
          entry={entry}
          depth={0}
          isMutating={isMutating}
          onRemovePath={onRemovePath}
          onSaveFile={onSaveFile}
          onUploadEntries={onUploadEntries}
        />
      ))}
      {!isDragOver ? (
        <p className="px-1 pt-1 text-xs text-muted-foreground">
          Tip: drag files or folders onto any folder in the tree to upload there.
        </p>
      ) : null}
    </div>
  )
}
