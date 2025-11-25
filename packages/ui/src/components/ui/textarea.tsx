import * as React from "react"

import { cn } from "@/lib/utils"
import { ScrollableOverlay } from "./ScrollableOverlay"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <ScrollableOverlay
        as="textarea"
        ref={ref as React.Ref<HTMLTextAreaElement>}
        disableHorizontal
        fillContainer={false}
        outerClassName="w-full"
        className={cn(
          "text-foreground border-input placeholder:text-muted-foreground appearance-none hover:border-input focus:border-ring focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-lg border bg-transparent px-3 py-2 typography-markdown shadow-none transition-[color,box-shadow,border-color] outline-none focus-visible:outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:typography-ui-label",
          className
        )}
        {...props}
      />
    )
  }
)

Textarea.displayName = "Textarea"

export { Textarea }
