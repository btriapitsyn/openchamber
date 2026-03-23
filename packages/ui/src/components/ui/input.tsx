import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "text-foreground border border-border/80 file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 appearance-none flex h-9 w-full min-w-0 rounded-lg bg-transparent px-3 py-1 typography-markdown outline-none focus-visible:outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:typography-ui-label file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:typography-ui-label",
        "hover:border-input",
        "focus:ring-1 focus:ring-primary/50 focus:border-primary/70",
        "aria-invalid:border-destructive aria-invalid:ring-destructive",
        className
      )}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      {...props}
    />
  )
}

export { Input }
