import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "cn"
import type { ReactNode } from "react"

export const Menu = MenuPrimitive.Root
export const MenuTrigger = MenuPrimitive.Trigger

export function MenuContent({
  children,
  align = "start",
  side = "bottom",
  className,
}: {
  children: ReactNode
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  className?: string
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={6}
        className="z-50 outline-none"
      >
        <MenuPrimitive.Popup
          className={cn(
            "min-w-48 origin-(--transform-origin) rounded-lg border border-rule bg-sheet p-1 text-sm text-ink shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

export function MenuItem({
  children,
  onClick,
  disabled,
  destructive,
  hint,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  destructive?: boolean
  hint?: string
}) {
  return (
    <MenuPrimitive.Item
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 outline-none select-none data-highlighted:bg-desk data-disabled:opacity-40 [&_svg]:size-4 [&_svg]:text-ink-soft",
        destructive && "text-destructive [&_svg]:text-destructive"
      )}
    >
      <span className="flex flex-1 items-center gap-2">{children}</span>
      {hint ? (
        <span className="tabular text-xs text-ink-soft">{hint}</span>
      ) : null}
    </MenuPrimitive.Item>
  )
}

export function MenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px bg-rule" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-ink-soft uppercase">
      {children}
    </div>
  )
}

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

export function PopoverContent({
  children,
  align = "start",
  className,
}: {
  children: ReactNode
  align?: "start" | "center" | "end"
  className?: string
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        sideOffset={6}
        className="z-50 outline-none"
      >
        <PopoverPrimitive.Popup
          className={cn(
            "origin-(--transform-origin) rounded-lg border border-rule bg-sheet p-3 text-sm text-ink shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}
