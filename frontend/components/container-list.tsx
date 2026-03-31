"use client";

import { Plus, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Container } from "@/lib/types";

interface ContainerListProps {
  containers: Container[];
  onSelectContainerAction: (container: Container) => void;
  onAddContainerAction: () => void;
  onRemoveContainerAction: (id: string) => void;
  selectedContainerId?: string;
}

function StatusBadge({ status }: { status: Container["status"] }) {
  const statusConfig = {
    running: { color: "bg-success", label: "Running" },
    stopped: { color: "bg-muted-foreground", label: "Stopped" },
    error: { color: "bg-destructive", label: "Error" },
    pending: { color: "bg-warning", label: "Pending" },
    finished: { color: "bg-primary", label: "Finished" },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2 w-2 rounded-full ${config.color} ${status === "running" ? "animate-status-pulse" : ""}`}
      />
      <span className="text-sm text-muted-foreground">{config.label}</span>
    </div>
  );
}

export function ContainerList({
  containers,
  onSelectContainerAction,
  onAddContainerAction,
  onRemoveContainerAction,
  selectedContainerId,
}: ContainerListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Containers</h2>
        <Button size="sm" onClick={onAddContainerAction}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {containers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <p className="text-sm">No containers yet</p>
            <Button variant="link" size="sm" onClick={onAddContainerAction}>
              Add your first container
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {containers.map((container) => (
              <div
                key={container.id}
                className={`animate-panel-in flex items-center justify-between p-4 cursor-pointer transition-all duration-200 hover:bg-accent hover:translate-x-1 ${
                  selectedContainerId === container.id ? "bg-accent" : ""
                }`}
                onClick={() => onSelectContainerAction(container)}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-foreground">
                    {container.name}
                  </span>
                  <StatusBadge status={container.status} />
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveContainerAction(container.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
