"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { Command as CommandIcon, Control, ArrowFatUp } from "@phosphor-icons/react";
import { MagnifyingGlass as SearchIcon } from '@phosphor-icons/react';

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-xl",
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-8 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-1.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4 [&_[cmdk-item]]:typography-meta">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-8 items-center gap-2 border-b px-3"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-8 w-full rounded-lg bg-transparent py-2 typography-meta outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[min(600px,calc(100vh-10rem))] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center typography-ui-label"
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:typography-meta [&_[cmdk-group-heading]]:font-medium",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "transition-colors hover:bg-accent hover:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 typography-meta outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const renderKey = (keyLabel: string) => {
    const normalized = keyLabel.trim().toLowerCase();

    if (normalized === 'ctrl' || normalized === 'control') {
      return <Control className="size-3.5" weight="regular" />;
    }

    if (normalized === 'cmd' || normalized === '⌘' || normalized === 'command' || normalized === 'meta') {
      return <CommandIcon className="size-3.5" weight="regular" />;
    }

    if (normalized === 'shift' || normalized === '⇧') {
      return <ArrowFatUp className="size-3.5" weight="regular" />;
    }

    return (
      <span className="text-xs font-medium">
        {keyLabel}
      </span>
    );
  };

  const shortcutText = typeof props.children === 'string' ? props.children : '';

  const tokens = shortcutText
    ? shortcutText.split('+').map((token) => token.trim()).filter(Boolean)
    : [];

  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto flex items-center gap-1 typography-meta",
        className
      )}
      {...props}
    >
      {tokens.length > 0
        ? tokens.map((token, index) => (
            <React.Fragment key={`${token}-${index}`}>
              {index > 0 && <span className="opacity-60 text-xs">+</span>}
              {renderKey(token)}
            </React.Fragment>
          ))
        : props.children}
    </span>
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
