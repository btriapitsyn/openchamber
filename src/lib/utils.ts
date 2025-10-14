import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const normalizePath = (value: string) => {
  if (!value) return "";
  if (value === "/") return "/";
  return value.replace(/\/+$/, "");
};

export function formatPathForDisplay(path: string | null | undefined, homeDirectory?: string | null): string {
  if (!path) {
    return "";
  }

  const normalizedPath = normalizePath(path);
  if (normalizedPath === "/") {
    return "/";
  }

  const normalizedHome = homeDirectory ? normalizePath(homeDirectory) : undefined;

  if (normalizedHome && normalizedHome !== "/") {
    if (normalizedPath === normalizedHome) {
      return "~";
    }
    if (normalizedPath.startsWith(`${normalizedHome}/`)) {
      const relative = normalizedPath.slice(normalizedHome.length + 1);
      return relative ? `~/${relative}` : "~";
    }
  }

  return normalizedPath;
}

export function formatDirectoryName(path: string | null | undefined, homeDirectory?: string | null): string {
  if (!path) {
    return "/";
  }

  const normalizedPath = normalizePath(path);
  if (!normalizedPath || normalizedPath === "/") {
    return "/";
  }

  const normalizedHome = homeDirectory ? normalizePath(homeDirectory) : undefined;
  if (normalizedHome && normalizedHome !== "/" && normalizedPath === normalizedHome) {
    return "~";
  }

  const segments = normalizedPath.split("/");
  const name = segments.pop() || normalizedPath;
  return name || "/";
}
