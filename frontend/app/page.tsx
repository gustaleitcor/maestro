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
  fetchContainerDetails,
  fetchDashboard,
  runContainer,
  saveContainerFileContent,
  saveDockerfile,
  stopContainer,
  uploadFolderEntries,
} from "@/lib/api";
import { listContainerDirectories } from "@/lib/filesystem";
import { Container, FolderUploadEntry, ServerSummary } from "@/lib/types";

const STATUS_POLL_INTERVAL_MS = 5000;
const DETAILS_POLL_INTERVAL_MS = 12000;

function mergeContainerDetails(
  previousContainers: Container[],
  nextContainers: Container[],
) {
  const previousById = new Map(
    previousContainers.map((container) => [container.id, container]),
  );

  return nextContainers.map((container) => {
    const previousContainer = previousById.get(container.id);
    if (!previousContainer?.detailsLoaded) {
      return container;
    }

    return {
      ...container,
      dockerfile: previousContainer.dockerfile,
      detailsLoaded: true,
      files: previousContainer.files,
      filesystem: previousContainer.filesystem,
    };
  });
}

export default function Home() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [showAddContainer, setShowAddContainer] = useState(false);
  const [showAddFile, setShowAddFile] = useState(false);
  const [fileContainerId, setFileContainerId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [loadingDetailsForId, setLoadingDetailsForId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedContainer =
    containers.find((container) => container.id === selectedContainerId) ?? null;
  const isLoadingDetails = selectedContainerId !== null && loadingDetailsForId === selectedContainerId;

  const refreshOverview = async (options?: {
    preserveSelection?: boolean;
    preferredSelectionId?: string | null;
    silent?: boolean;
  }) => {
    const preserveSelection = options?.preserveSelection ?? true;

    if (!options?.silent) {
      setError(null);
    }

    try {
      const { containers: nextContainers, servers: nextServers } = await fetchDashboard();

      setContainers((currentContainers) =>
        mergeContainerDetails(currentContainers, nextContainers),
      );
      setServers(nextServers);

      setSelectedContainerId((currentId) => {
        const preferredSelectionId =
          options?.preferredSelectionId ?? (preserveSelection ? currentId : null);

        if (!preferredSelectionId) {
          return nextContainers[0]?.id ?? null;
        }

        return nextContainers.some((container) => container.id === preferredSelectionId)
          ? preferredSelectionId
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

  const refreshSelectedContainerDetails = async (
    containerId: string,
    options?: { silent?: boolean },
  ) => {
    if (!options?.silent) {
      setError(null);
    }

    setLoadingDetailsForId(containerId);

    try {
      const details = await fetchContainerDetails(containerId);

      setContainers((currentContainers) =>
        currentContainers.map((container) =>
          container.id === containerId
            ? {
                ...container,
                ...details,
                detailsLoaded: true,
              }
            : container,
        ),
      );
    } catch (loadError) {
      if (!options?.silent) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load container details");
      }
    } finally {
      setLoadingDetailsForId((currentId) => (currentId === containerId ? null : currentId));
    }
  };

  useEffect(() => {
    void refreshOverview({ preserveSelection: false });
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (isMutating) {
        return;
      }

      void refreshOverview({ preserveSelection: true, silent: true });
    }, STATUS_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isMutating]);

  useEffect(() => {
    if (!selectedContainerId) {
      return;
    }

    if (loadingDetailsForId === selectedContainerId) {
      return;
    }

    const currentContainer = containers.find((container) => container.id === selectedContainerId);
    if (currentContainer?.detailsLoaded) {
      return;
    }

    void refreshSelectedContainerDetails(selectedContainerId);
  }, [containers, loadingDetailsForId, selectedContainerId]);

  useEffect(() => {
    if (!selectedContainerId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (isMutating || loadingDetailsForId === selectedContainerId) {
        return;
      }

      void refreshSelectedContainerDetails(selectedContainerId, { silent: true });
    }, DETAILS_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isMutating, loadingDetailsForId, selectedContainerId]);

  const withMutation = async (
    action: () => Promise<void>,
    options?: {
      preserveSelection?: boolean;
      preferredSelectionId?: string | null;
      refreshDetailsForId?: string | null;
    },
  ) => {
    setIsMutating(true);
    setError(null);

    try {
      await action();
      await refreshOverview({
        preserveSelection: options?.preserveSelection ?? true,
        preferredSelectionId: options?.preferredSelectionId,
      });

      if (options?.refreshDetailsForId) {
        await refreshSelectedContainerDetails(options.refreshDetailsForId, {
          silent: true,
        });
      }
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
    }, {
      preferredSelectionId: name,
      refreshDetailsForId: name,
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
      { preserveSelection: false },
    );
  };

  const handleAddFile = (containerId: string) => {
    setFileContainerId(containerId);
    setShowAddFile(true);
  };

  const handleAddFileSubmit = async (entries: FolderUploadEntry[]) => {
    if (!fileContainerId) return;

    await withMutation(async () => {
      await uploadFolderEntries(fileContainerId, entries);
    }, {
      refreshDetailsForId: fileContainerId,
    });
  };

  const handleTreeDropUpload = async (
    containerId: string,
    entries: FolderUploadEntry[],
  ) => {
    await withMutation(async () => {
      await uploadFolderEntries(containerId, entries);
    }, {
      refreshDetailsForId: containerId,
    });
  };

  const handleRemoveFile = (containerId: string, fileName: string) => {
    void withMutation(async () => {
      await deleteFile(containerId, fileName);
    }, {
      refreshDetailsForId: containerId,
    });
  };

  const handleUpdateDockerfile = async (containerId: string, dockerfile: string) => {
    await withMutation(async () => {
      await saveDockerfile(containerId, dockerfile);
    }, {
      refreshDetailsForId: containerId,
    });
  };

  const handleSaveFile = async (
    containerId: string,
    filePath: string,
    content: string,
  ) => {
    await withMutation(async () => {
      await saveContainerFileContent(containerId, filePath, content);
    }, {
      refreshDetailsForId: containerId,
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
            isLoadingDetails={isLoadingDetails}
            onAddFile={handleAddFile}
            onRemoveFile={handleRemoveFile}
            onSaveFile={handleSaveFile}
            onUploadEntries={handleTreeDropUpload}
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
        directories={selectedContainer ? listContainerDirectories(selectedContainer.filesystem) : [""]}
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
