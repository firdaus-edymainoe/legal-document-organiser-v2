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
import { answerPassword, useStore } from "@/state/store"

export function PasswordDialog() {
  const prompt = useStore((s) => s.passwordPrompt)
  const [value, setValue] = useState("")
  const submit = () => {
    answerPassword(value)
    setValue("")
  }
  return (
    <Dialog
      open={prompt !== null}
      onOpenChange={(open) => !open && answerPassword(null)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {prompt?.incorrect
              ? "That password did not work"
              : "This file is protected"}
          </DialogTitle>
          <DialogDescription>
            Enter the password for “{prompt?.fileName}”. Its pages will be
            copied as images.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          aria-label="Password"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => answerPassword(null)}>
            Skip this file
          </Button>
          <Button onClick={submit} disabled={!value}>
            Open file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
