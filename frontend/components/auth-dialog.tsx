"use client"

import React from "react"

import { useState, useEffect } from "react"
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

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "login" | "register"
}

export function AuthDialog({ open, onOpenChange, mode }: AuthDialogProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setEmail("")
      setPassword("")
      setConfirmPassword("")
      setError("")
    }
  }, [open, mode])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (mode === "register") {
      if (password !== confirmPassword) {
        setError("Passwords do not match")
        return
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters")
        return
      }
    }

    // For demo purposes, just close the dialog
    setEmail("")
    setPassword("")
    setConfirmPassword("")
    onOpenChange(false)
  }

  const isFormValid = mode === "login" 
    ? email && password 
    : email && password && confirmPassword

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {mode === "login"
              ? "Enter your credentials to access your containers."
              : "Sign up to start managing your containers."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-input border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-input border-border text-foreground"
              />
            </div>
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-foreground">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    setError("")
                  }}
                  className={`bg-input border-border text-foreground ${
                    error ? "border-destructive" : ""
                  }`}
                />
                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid}>
              {mode === "login" ? "Login" : "Register"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
