import * as React from "react"
import { Button, type buttonVariants } from "./button"
import { cn } from "@/lib/utils"
import { type VariantProps } from "class-variance-authority"

/**
 * Large button component for primary actions.
 * Fixed height (h-7) with responsive padding that grows with content.
 * Perfect for: Fetch, Pull, Push, Save, and other main action buttons.
 */
function ButtonLarge({
  className,
  variant,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <Button
      variant={variant}
      size="sm"
      className={cn("h-7 px-2 py-0", className)}
      {...props}
    />
  )
}

export { ButtonLarge }
