"use client"

import React from "react"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FolderArchive, FileUp, FolderTree, Sparkles, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FolderUploadEntry } from "@/lib/types"

type DirectoryPickerFileHandle = {
  kind: "file"
  name: string
  getFile: () => Promise<File>
}

type DirectoryPickerDirectoryHandle = {
  kind: "directory"
  name: string
  values: () => AsyncIterable<DirectoryPickerHandle>
}

type DirectoryPickerHandle =
  | DirectoryPickerFileHandle
  | DirectoryPickerDirectoryHandle

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<DirectoryPickerDirectoryHandle>
}

async function collectDirectoryFiles(
  directoryHandle: DirectoryPickerDirectoryHandle,
  parentPath = directoryHandle.name,
): Promise<FolderUploadEntry[]> {
  const entries: FolderUploadEntry[] = []

  for await (const handle of directoryHandle.values()) {
    const currentPath = `${parentPath}/${handle.name}`

    if (handle.kind === "file") {
      entries.push({
        file: await handle.getFile(),
        path: currentPath,
      })
      continue
    }

    entries.push(...(await collectDirectoryFiles(handle, currentPath)))
  }

  return entries.sort((left, right) => left.path.localeCompare(right.path))
}

function normalizeDestinationFolder(path: string) {
  const normalized = path
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/")

  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new Error('Destination folder cannot contain ".."')
  }

  return normalized
}

interface AddFileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  directories: string[]
  onAdd: (entries: FolderUploadEntry[]) => Promise<void> | void
}

export function AddFileDialog({
  open,
  onOpenChange,
  directories,
  onAdd,
}: AddFileDialogProps) {
  const [mode, setMode] = useState<"folder" | "file">("folder")
  const [selectedEntries, setSelectedEntries] = useState<FolderUploadEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [destinationFolder, setDestinationFolder] = useState("")
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const directoryInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    directoryInputRef.current?.setAttribute("webkitdirectory", "")
    directoryInputRef.current?.setAttribute("directory", "")
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) {
      return
    }

    const entries = Array.from(files)
      .map((file) => {
        const relativePath =
          "webkitRelativePath" in file &&
          typeof file.webkitRelativePath === "string" &&
          file.webkitRelativePath.length > 0
            ? file.webkitRelativePath
            : null

        if (!relativePath) {
          return null
        }

        return {
          file,
          path: relativePath,
        }
      })
      .filter((entry): entry is FolderUploadEntry => entry !== null)
      .sort((left, right) => left.path.localeCompare(right.path))

    if (entries.length === 0) {
      setSelectionError("Folder selection is not available in this file picker")
      setSelectedEntries([])
      return
    }

    setSelectionError(null)
    setSelectedEntries(entries)
  }

  const handleSingleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    setSelectionError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSelectionError(null)

    try {
      if (mode === "folder") {
        if (selectedEntries.length === 0) {
          return
        }

        await onAdd(selectedEntries)
      } else {
        if (!selectedFile) {
          setSelectionError("Choose a file to upload")
          return
        }

        const normalizedFolder = normalizeDestinationFolder(destinationFolder)
        const filePath = normalizedFolder
          ? `${normalizedFolder}/${selectedFile.name}`
          : selectedFile.name

        await onAdd([
          {
            file: selectedFile,
            path: filePath,
          },
        ])
      }

      setSelectedEntries([])
      setSelectedFile(null)
      setDestinationFolder("")
      onOpenChange(false)
    } catch (error) {
      setSelectionError(
        error instanceof Error ? error.message : "Upload failed",
      )
    }
  }

  const handleClose = () => {
    setMode("folder")
    setSelectedEntries([])
    setSelectedFile(null)
    setDestinationFolder("")
    setSelectionError(null)
    if (directoryInputRef.current) {
      directoryInputRef.current.value = ""
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    onOpenChange(false)
  }

  const removeFiles = () => {
    setSelectedEntries([])
    setSelectedFile(null)
    setDestinationFolder("")
    setSelectionError(null)
    if (directoryInputRef.current) {
      directoryInputRef.current.value = ""
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const folderName =
    selectedEntries[0]?.path.split("/")[0] ?? null

  const handleSelectFolder = async () => {
    setSelectionError(null)

    const pickerWindow = window as DirectoryPickerWindow
    if (typeof pickerWindow.showDirectoryPicker === "function") {
      try {
        const directoryHandle = await pickerWindow.showDirectoryPicker()
        const entries = await collectDirectoryFiles(directoryHandle)

        if (entries.length === 0) {
          setSelectionError("The selected folder is empty")
          setSelectedEntries([])
          return
        }

        setSelectedEntries(entries)
        if (directoryInputRef.current) {
          directoryInputRef.current.value = ""
        }
        return
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
      }
    }

    directoryInputRef.current?.click()
  }

  const fileDestinationPreview =
    selectedFile !== null
      ? (() => {
          try {
            const normalizedFolder = normalizeDestinationFolder(destinationFolder)
            return normalizedFolder
              ? `${normalizedFolder}/${selectedFile.name}`
              : selectedFile.name
          } catch {
            return null
          }
        })()
      : null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add Content</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Add a full folder or place a single file anywhere in this container.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-4">
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                className={`rounded-xl border p-4 text-left transition-colors ${
                  mode === "folder"
                    ? "border-foreground/20 bg-accent/70"
                    : "border-border bg-background hover:bg-accent/30"
                }`}
                onClick={() => {
                  setMode("folder")
                  setSelectionError(null)
                }}
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/70">
                    <FolderTree className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Upload Folder</p>
                    <p className="text-xs text-muted-foreground">Keep the whole folder structure</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Best when you want to add a project, dataset, or nested source tree.
                </p>
              </button>

              <button
                type="button"
                className={`rounded-xl border p-4 text-left transition-colors ${
                  mode === "file"
                    ? "border-foreground/20 bg-accent/70"
                    : "border-border bg-background hover:bg-accent/30"
                }`}
                onClick={() => {
                  setMode("file")
                  setSelectionError(null)
                }}
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/70">
                    <FileUp className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Upload Single File</p>
                    <p className="text-xs text-muted-foreground">Choose exactly where it should go</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Good for dropping one file into an existing folder or creating a new path.
                </p>
              </button>
            </div>

            <input
              ref={directoryInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              id="directory-upload"
              multiple
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleSingleFileSelect}
            />

            {mode === "folder" ? (
              selectedEntries.length === 0 ? (
                <button
                  type="button"
                  className="flex h-44 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-background transition-colors hover:border-muted-foreground hover:bg-accent/40"
                  onClick={() => void handleSelectFolder()}
                >
                  <FolderArchive className="mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">
                    Choose a folder
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    We will preserve the folder layout automatically
                  </p>
                </button>
              ) : (
                <div className="rounded-xl border border-border bg-accent/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/70">
                        <FolderArchive className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {folderName ?? "Folder selected"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedEntries.length} file{selectedEntries.length === 1 ? "" : "s"} will be added
                        </p>
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={removeFiles}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="max-h-48 space-y-2 overflow-auto rounded-lg bg-background/60 p-2">
                    {selectedEntries.map((entry) => (
                      <div
                        key={entry.path}
                        className="rounded border border-border bg-background px-3 py-2"
                      >
                        <p className="text-sm text-foreground">{entry.path}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <div className="rounded-xl border border-border bg-background p-4 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="destination-folder">Destination Folder</Label>
                    <Input
                      id="destination-folder"
                      list="container-directory-options"
                      value={destinationFolder}
                      onChange={(event) => {
                        setDestinationFolder(event.target.value)
                        setSelectionError(null)
                      }}
                      placeholder="Leave empty for the project root or type e.g. src/utils"
                    />
                    <datalist id="container-directory-options">
                      {directories
                        .filter((directory) => directory.length > 0)
                        .map((directory) => (
                          <option key={directory} value={directory} />
                        ))}
                    </datalist>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose File
                  </Button>
                </div>

                {selectedFile ? (
                  <div className="rounded-lg border border-border bg-accent/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedFile.size / 1024).toFixed(selectedFile.size < 1024 ? 0 : 1)} KB
                        </p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={removeFiles}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-3 rounded-lg bg-background/70 p-3">
                      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                        Upload Path
                      </p>
                      <p className="mt-2 break-all font-mono text-sm text-foreground">
                        {fileDestinationPreview ?? "Enter a valid destination folder"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground">
                    Select a file and choose where it should be placed.
                  </div>
                )}
              </div>
            )}
            {selectionError ? (
              <p className="mt-3 text-sm text-destructive">{selectionError}</p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (mode === "folder") {
                    void handleSelectFolder()
                    return
                  }

                  fileInputRef.current?.click()
                }}
              >
                {mode === "folder" ? "Select Folder" : "Select File"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                mode === "folder"
                  ? selectedEntries.length === 0
                  : selectedFile === null
              }
            >
              Add To Container
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
