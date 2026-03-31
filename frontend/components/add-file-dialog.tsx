"use client"

import React from "react"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Upload, FileText, X } from "lucide-react"

interface AddFileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (files: File[]) => Promise<void> | void
}

export function AddFileDialog({ open, onOpenChange, onAdd }: AddFileDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      setSelectedFiles(Array.from(files))
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setSelectedFiles(Array.from(files))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedFiles.length === 0) return
    Promise.resolve(onAdd(selectedFiles)).then(() => {
      setSelectedFiles([])
      onOpenChange(false)
    })
  }

  const handleClose = () => {
    setSelectedFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    onOpenChange(false)
  }

  const removeFiles = () => {
    setSelectedFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add File</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Upload a file to associate with this container.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-4">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              id="file-upload"
              multiple
            />

            {selectedFiles.length === 0 ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  flex flex-col items-center justify-center h-40 rounded-lg border-2 border-dashed cursor-pointer transition-colors
                  ${isDragging 
                    ? "border-primary bg-primary/10" 
                    : "border-border hover:border-muted-foreground hover:bg-accent/50"
                  }
                `}
              >
                <Upload className={`h-10 w-10 mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm font-medium text-foreground">
                  {isDragging ? "Drop files here" : "Drag and drop files"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or choose files below
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-accent/50 border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} selected
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedFiles.reduce((total, file) => total + file.size, 0) < 1024 * 1024
                          ? `${(selectedFiles.reduce((total, file) => total + file.size, 0) / 1024).toFixed(1)} KB`
                          : `${(selectedFiles.reduce((total, file) => total + file.size, 0) / (1024 * 1024)).toFixed(1)} MB`}
                      </p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={removeFiles}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="max-h-48 space-y-2 overflow-auto">
                  {selectedFiles.map((selectedFile) => {
                    const relativePath =
                      "webkitRelativePath" in selectedFile &&
                      typeof selectedFile.webkitRelativePath === "string" &&
                      selectedFile.webkitRelativePath.length > 0
                        ? selectedFile.webkitRelativePath
                        : selectedFile.name

                    return (
                      <div
                        key={relativePath}
                        className="rounded border border-border bg-background/60 px-3 py-2"
                      >
                        <p className="text-sm text-foreground">{relativePath}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                Choose Files
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={selectedFiles.length === 0}>
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
