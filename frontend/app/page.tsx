"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/header";
import { ContainerList } from "@/components/container-list";
import { ContainerDetails } from "@/components/container-details";
import { AddContainerDialog } from "@/components/add-container-dialog";
import { AddFileDialog } from "@/components/add-file-dialog";
import { AuthDialog } from "@/components/auth-dialog";
import {
  buildContainer,
  createContainer,
  deleteContainer,
  deleteFile,
  fetchContainers,
  fetchServers,
  runContainer,
  saveDockerfile,
  stopContainer,
  uploadFiles,
} from "@/lib/api";
import { Container } from "@/lib/types";

const STATUS_POLL_INTERVAL_MS = 5000;

export default function Home() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [servers, setServers] = useState<string[]>([]);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [showAddContainer, setShowAddContainer] = useState(false);
  const [showAddFile, setShowAddFile] = useState(false);
  const [fileContainerId, setFileContainerId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedContainer =
    containers.find((container) => container.id === selectedContainerId) ?? null;

  const refreshData = async (
    preserveSelection = true,
    options?: { silent?: boolean },
  ) => {
    if (!options?.silent) {
      setError(null);
    }

    try {
      const [nextContainers, nextServers] = await Promise.all([
        fetchContainers(),
        fetchServers(),
      ]);

      setContainers(nextContainers);
      setServers(nextServers.map((server) => server.name));

      setSelectedContainerId((currentId) => {
        if (!preserveSelection || !currentId) {
          return nextContainers[0]?.id ?? null;
        }

        return nextContainers.some((container) => container.id === currentId)
          ? currentId
          : nextContainers[0]?.id ?? null;
      });
    } catch (loadError) {
      if (!options?.silent) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load data");
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    void refreshData(false);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (isMutating) {
        return;
      }

      void refreshData(true, { silent: true });
    }, STATUS_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isMutating]);

  const withMutation = async (action: () => Promise<void>, preserveSelection = true) => {
    setIsMutating(true);
    setError(null);

    try {
      await action();
      await refreshData(preserveSelection);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Request failed",
      );
      throw mutationError;
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddContainer = async ({
    name,
    dockerfile,
  }: {
    name: string;
    dockerfile: string;
  }) => {
    await withMutation(async () => {
      await createContainer(name, dockerfile);
      setSelectedContainerId(name);
    });
  };

  const handleRemoveContainer = (id: string) => {
    void withMutation(
      async () => {
        await deleteContainer(id);
        if (selectedContainerId === id) {
          setSelectedContainerId(null);
        }
      },
      false,
    );
  };

  const handleAddFile = (containerId: string) => {
    setFileContainerId(containerId);
    setShowAddFile(true);
  };

  const handleAddFileSubmit = async (files: File[]) => {
    if (!fileContainerId) return;

    await withMutation(async () => {
      await uploadFiles(
        fileContainerId,
        files.map((file) => ({
          file,
          path:
            "webkitRelativePath" in file &&
            typeof file.webkitRelativePath === "string" &&
            file.webkitRelativePath.length > 0
              ? file.webkitRelativePath
              : file.name,
        })),
      );
    });
  };

  const handleRemoveFile = (containerId: string, fileName: string) => {
    void withMutation(async () => {
      await deleteFile(containerId, fileName);
    });
  };

  const handleUpdateDockerfile = async (containerId: string, dockerfile: string) => {
    await withMutation(async () => {
      await saveDockerfile(containerId, dockerfile);
    });
  };

  const handleBuildContainer = async (containerId: string, serverName: string) => {
    await withMutation(async () => {
      await buildContainer(containerId, serverName);
    });
  };

  const handleRunContainer = async (containerId: string, serverName: string) => {
    await withMutation(async () => {
      await runContainer(containerId, serverName);
    });
  };

  const handleStopContainer = async (containerId: string) => {
    await withMutation(async () => {
      await stopContainer(containerId);
    });
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header
        onLogin={() => setAuthMode("login")}
        onRegister={() => setAuthMode("register")}
      />

      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-6 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <main className="flex flex-1 overflow-hidden">
        <aside className="w-full shrink-0 border-r border-border md:w-80 lg:w-96">
          <ContainerList
            containers={containers}
            onSelectContainerAction={(container) => setSelectedContainerId(container.id)}
            onAddContainerAction={() => setShowAddContainer(true)}
            onRemoveContainerAction={handleRemoveContainer}
            selectedContainerId={selectedContainerId ?? undefined}
          />
          {isLoading ? (
            <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
              Loading containers...
            </div>
          ) : null}
        </aside>

        <section
          className={`flex-1 ${selectedContainer ? "block" : "hidden md:block"} ${selectedContainer ? "fixed inset-0 z-40 bg-background md:relative md:z-0" : ""}`}
        >
          <ContainerDetails
            container={selectedContainer}
            servers={servers}
            isMutating={isMutating}
            onAddFile={handleAddFile}
            onRemoveFile={handleRemoveFile}
            onClose={() => setSelectedContainerId(null)}
            onUpdateDockerfile={handleUpdateDockerfile}
            onBuildContainer={handleBuildContainer}
            onRunContainer={handleRunContainer}
            onStopContainer={handleStopContainer}
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
  );
}
