import * as React from "react"
import { Button, type buttonVariants } from "./button"
import { cn } from "@/lib/utils"
import { type VariantProps } from "class-variance-authority"

/**
 * Small button component for secondary actions and selections.
 * Fixed height (h-6) with compact padding and small text.
 * Perfect for: Mode toggles (Compact/Comfort), option selection, compact controls.
 */
function ButtonSmall({
  className,
  variant,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <Button
      variant={variant}
      size="sm"
      className={cn("h-6 px-2 text-xs", className)}
      {...props}
    />
  )
}

export { ButtonSmall }
