"use client"

import { toast as sonnerToast } from "sonner"
import type { ExternalToast } from "sonner"

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
  }
}

// Wrapper to automatically add OK button to success and info toasts, Copy button to error and warning toasts
export const toast = {
  ...sonnerToast,
  success: (message: string | React.ReactNode, data?: ExternalToast) => {
    return sonnerToast.success(message, {
      ...data,
      action: data?.action || {
        label: 'OK',
        onClick: () => {},
      },
    })
  },
  info: (message: string | React.ReactNode, data?: ExternalToast) => {
    return sonnerToast.info(message, {
      ...data,
      action: data?.action || {
        label: 'OK',
        onClick: () => {},
      },
    })
  },
  error: (message: string | React.ReactNode, data?: ExternalToast) => {
    return sonnerToast.error(message, {
      ...data,
      action: data?.action || {
        label: 'Copy',
        onClick: () => copyToClipboard(String(message)),
      },
    })
  },
  warning: (message: string | React.ReactNode, data?: ExternalToast) => {
    return sonnerToast.warning(message, {
      ...data,
      action: data?.action || {
        label: 'Copy',
        onClick: () => copyToClipboard(String(message)),
      },
    })
  },
}