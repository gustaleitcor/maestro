"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { ContainerList } from "@/components/container-list"
import { ContainerDetails } from "@/components/container-details"
import { AddContainerDialog } from "@/components/add-container-dialog"
import { AddFileDialog } from "@/components/add-file-dialog"
import { AuthDialog } from "@/components/auth-dialog"
import { Container, ContainerFile } from "@/lib/types"

const initialContainers: Container[] = [
  {
    id: "1",
    name: "web-server",
    dockerfile: "FROM nginx:latest\n\nCOPY ./html /usr/share/nginx/html\n\nEXPOSE 80\nCMD [\"nginx\", \"-g\", \"daemon off;\"]",
    status: "running",
    stats: { cpu: 12, memory: 256, disk: 1.2, uptime: "3d 4h" },
    files: [
      { id: "f1", name: "nginx.conf", path: "/etc/nginx/nginx.conf", size: 2048 },
      { id: "f2", name: "index.html", path: "/usr/share/nginx/html/index.html", size: 4096 },
    ],
  },
  {
    id: "2",
    name: "api-backend",
    dockerfile: "FROM node:18-alpine\n\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\n\nEXPOSE 3000\nCMD [\"npm\", \"start\"]",
    status: "running",
    stats: { cpu: 34, memory: 512, disk: 2.5, uptime: "1d 12h" },
    files: [
      { id: "f3", name: "server.js", path: "/app/server.js", size: 8192 },
    ],
  },
  {
    id: "3",
    name: "database",
    dockerfile: "FROM postgres:15\n\nENV POSTGRES_DB=mydb\nENV POSTGRES_USER=admin\nENV POSTGRES_PASSWORD=secret\n\nEXPOSE 5432",
    status: "stopped",
    stats: { cpu: 0, memory: 0, disk: 5.0, uptime: "0s" },
    files: [
      { id: "f4", name: "postgresql.conf", path: "/var/lib/postgresql/data/postgresql.conf", size: 16384 },
    ],
  },
  {
    id: "4",
    name: "redis-cache",
    dockerfile: "FROM redis:7-alpine\n\nEXPOSE 6379\nCMD [\"redis-server\"]",
    status: "error",
    stats: { cpu: 0, memory: 0, disk: 0.5, uptime: "0s" },
    files: [],
  },
  {
    id: "5",
    name: "worker-queue",
    dockerfile: "FROM python:3.11-slim\n\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . .\n\nCMD [\"python\", \"worker.py\"]",
    status: "pending",
    stats: { cpu: 0, memory: 0, disk: 0.8, uptime: "0s" },
    files: [],
  },
]

export default function Home() {
  const [containers, setContainers] = useState<Container[]>(initialContainers)
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [showAddContainer, setShowAddContainer] = useState(false)
  const [showAddFile, setShowAddFile] = useState(false)
  const [fileContainerId, setFileContainerId] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null)

  const handleAddContainer = (containerData: Omit<Container, "id" | "stats" | "files">) => {
    const newContainer: Container = {
      ...containerData,
      id: Date.now().toString(),
      stats: { cpu: 0, memory: 0, disk: 0, uptime: "0s" },
      files: [],
    }
    setContainers([...containers, newContainer])
  }

  const handleRemoveContainer = (id: string) => {
    setContainers(containers.filter((c) => c.id !== id))
    if (selectedContainer?.id === id) {
      setSelectedContainer(null)
    }
  }

  const handleAddFile = (containerId: string) => {
    setFileContainerId(containerId)
    setShowAddFile(true)
  }

  const handleAddFileSubmit = (fileData: Omit<ContainerFile, "id">) => {
    if (!fileContainerId) return
    const newFile: ContainerFile = {
      ...fileData,
      id: Date.now().toString(),
    }
    setContainers(
      containers.map((c) =>
        c.id === fileContainerId ? { ...c, files: [...c.files, newFile] } : c
      )
    )
    if (selectedContainer?.id === fileContainerId) {
      setSelectedContainer({
        ...selectedContainer,
        files: [...selectedContainer.files, newFile],
      })
    }
  }

  const handleRemoveFile = (containerId: string, fileId: string) => {
    setContainers(
      containers.map((c) =>
        c.id === containerId
          ? { ...c, files: c.files.filter((f) => f.id !== fileId) }
          : c
      )
    )
    if (selectedContainer?.id === containerId) {
      setSelectedContainer({
        ...selectedContainer,
        files: selectedContainer.files.filter((f) => f.id !== fileId),
      })
    }
  }

  const handleSelectContainer = (container: Container) => {
    setSelectedContainer(container)
  }

  const handleUpdateDockerfile = (containerId: string, dockerfile: string) => {
    setContainers(
      containers.map((c) =>
        c.id === containerId ? { ...c, dockerfile } : c
      )
    )
    if (selectedContainer?.id === containerId) {
      setSelectedContainer({
        ...selectedContainer,
        dockerfile,
      })
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header
        onLogin={() => setAuthMode("login")}
        onRegister={() => setAuthMode("register")}
      />
      
      <main className="flex flex-1 overflow-hidden">
        <aside className="w-full md:w-80 lg:w-96 border-r border-border flex-shrink-0">
          <ContainerList
            containers={containers}
            onSelectContainer={handleSelectContainer}
            onAddContainer={() => setShowAddContainer(true)}
            onRemoveContainer={handleRemoveContainer}
            selectedContainerId={selectedContainer?.id}
          />
        </aside>
        
        <section className={`flex-1 ${selectedContainer ? "block" : "hidden md:block"} ${selectedContainer ? "fixed inset-0 z-40 md:relative md:z-0 bg-background" : ""}`}>
          <ContainerDetails
            container={selectedContainer}
            onAddFile={handleAddFile}
            onRemoveFile={handleRemoveFile}
            onClose={() => setSelectedContainer(null)}
            onUpdateDockerfile={handleUpdateDockerfile}
          />
        </section>
      </main>

      <AddContainerDialog
        open={showAddContainer}
        onOpenChange={setShowAddContainer}
        onAdd={handleAddContainer}
      />

      <AddFileDialog
        open={showAddFile}
        onOpenChange={setShowAddFile}
        onAdd={handleAddFileSubmit}
      />

      <AuthDialog
        open={authMode !== null}
        onOpenChange={(open) => !open && setAuthMode(null)}
        mode={authMode || "login"}
      />
    </div>
  )
}
