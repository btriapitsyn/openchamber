import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "text-foreground border-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 appearance-none hover:border-input focus:border-ring flex h-9 w-full min-w-0 rounded-lg border bg-transparent px-3 py-1 typography-markdown shadow-none transition-[color,box-shadow,border-color] outline-none focus-visible:outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:typography-ui-label file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:typography-ui-label",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
