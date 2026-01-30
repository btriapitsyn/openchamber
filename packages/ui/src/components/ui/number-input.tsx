import * as React from "react"
import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react"

import { cn } from "@/lib/utils"

export interface NumberInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  containerClassName?: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onValueChange,
      min = -Infinity,
      max = Infinity,
      step = 1,
      className,
      containerClassName,
      onBlur,
      onKeyDown,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null)

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

    const [draft, setDraft] = React.useState(() => String(value))

    React.useEffect(() => {
      if (document.activeElement !== inputRef.current) {
        setDraft(String(value))
      }
    }, [value])

    const focusInput = React.useCallback(() => {
      inputRef.current?.focus()
    }, [])

    const applyValue = React.useCallback(
      (nextValue: number) => {
        const clamped = clamp(nextValue, min, max)
        onValueChange(clamped)
        setDraft(String(clamped))
      },
      [max, min, onValueChange]
    )

    const currentNumericValue = React.useCallback(() => {
      const parsed = Number(draft)
      if (Number.isFinite(parsed)) {
        return parsed
      }
      return value
    }, [draft, value])

    const handleIncrement = React.useCallback(() => {
      applyValue(currentNumericValue() + step)
      focusInput()
    }, [applyValue, currentNumericValue, focusInput, step])

    const handleDecrement = React.useCallback(() => {
      applyValue(currentNumericValue() - step)
      focusInput()
    }, [applyValue, currentNumericValue, focusInput, step])

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextDraft = event.target.value
      setDraft(nextDraft)

      const parsed = Number(nextDraft)
      if (!Number.isFinite(parsed)) {
        return
      }

      onValueChange(clamp(parsed, min, max))
    }

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      const parsed = Number(draft)
      if (!Number.isFinite(parsed)) {
        setDraft(String(value))
      } else {
        const clamped = clamp(parsed, min, max)
        if (clamped !== parsed) {
          onValueChange(clamped)
        }
        setDraft(String(clamped))
      }

      onBlur?.(event)
    }

    const handleKeyDownInternal = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowUp") {
        event.preventDefault()
        handleIncrement()
        return
      }
      if (event.key === "ArrowDown") {
        event.preventDefault()
        handleDecrement()
        return
      }
      onKeyDown?.(event)
    }

    const numericValue = currentNumericValue()
    const decrementDisabled = disabled || numericValue <= min
    const incrementDisabled = disabled || numericValue >= max

    return (
      <div
        className={cn(
          "flex h-8 items-stretch overflow-hidden rounded-lg border border-border bg-background",
          "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
          disabled && "opacity-50",
          containerClassName
        )}
      >
        <input
          {...props}
          ref={inputRef}
          type="number"
          inputMode="numeric"
          min={Number.isFinite(min) ? min : undefined}
          max={Number.isFinite(max) ? max : undefined}
          step={step}
          value={draft}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDownInternal}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className={cn(
            "h-full w-14 bg-transparent px-1.5 text-center typography-ui-label text-foreground",
            "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
            "border-0 outline-none",
            "disabled:pointer-events-none disabled:cursor-not-allowed",
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            className
          )}
        />

        <div className="flex w-6 flex-col border-l border-border">
          <button
            type="button"
            aria-label="Increase value"
            disabled={incrementDisabled}
            onClick={handleIncrement}
            className={cn(
              "flex flex-1 items-center justify-center",
              "text-muted-foreground hover:bg-interactive-hover hover:text-foreground",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
          >
            <RiArrowUpSLine className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Decrease value"
            disabled={decrementDisabled}
            onClick={handleDecrement}
            className={cn(
              "flex flex-1 items-center justify-center border-t border-border",
              "text-muted-foreground hover:bg-interactive-hover hover:text-foreground",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
          >
            <RiArrowDownSLine className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }
)
NumberInput.displayName = "NumberInput"

export { NumberInput }
