"use client"

import { Box } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HeaderProps {
  onLogin?: () => void
  onRegister?: () => void
}

export function Header({ onLogin, onRegister }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Box className="h-6 w-6 text-foreground" />
          <span className="text-lg font-semibold text-foreground">Maestro</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onLogin}>
            Login
          </Button>
          <Button size="sm" onClick={onRegister}>
            Register
          </Button>
        </div>
      </div>
    </header>
  )
}
