import * as React from "react"
import { Button, type buttonVariants } from "./button"
import { cn } from "@/lib/utils"
import { type VariantProps } from "class-variance-authority"

function ButtonSmall({
  className,
  variant,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <Button
      variant={variant}
      size="sm"
      className={cn("h-8 px-2.5", className)}
      {...props}
    />
  )
}

export { ButtonSmall }
