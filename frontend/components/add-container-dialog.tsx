"use client"

import React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Container } from "@/lib/types"

interface AddContainerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (container: Omit<Container, "id" | "stats" | "files">) => void
}

const defaultDockerfile = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "start"]`

export function AddContainerDialog({ open, onOpenChange, onAdd }: AddContainerDialogProps) {
  const [name, setName] = useState("")
  const [dockerfile, setDockerfile] = useState(defaultDockerfile)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !dockerfile.trim()) return
    onAdd({ name, dockerfile, status: "pending" })
    setName("")
    setDockerfile(defaultDockerfile)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add New Container</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Enter a name and provide the Dockerfile for your container.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">Container Name</Label>
              <Input
                id="name"
                placeholder="my-container"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-input border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dockerfile" className="text-foreground">Dockerfile</Label>
              <Textarea
                id="dockerfile"
                placeholder="FROM node:18-alpine..."
                value={dockerfile}
                onChange={(e) => setDockerfile(e.target.value)}
                className="bg-input border-border text-foreground font-mono text-sm min-h-[250px] resize-y"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name || !dockerfile.trim()}>
              Create Container
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
