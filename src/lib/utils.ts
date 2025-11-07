import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const truncatePathMiddle = (
  value: string,
  options?: { maxLength?: number }
): string => {
  const source = value ?? "";
  const maxLength = Math.max(16, options?.maxLength ?? 45);
  if (source.length <= maxLength) {
    return source;
  }

  const segments = source.split('/');
  if (segments.length <= 1) {
    return source;
  }

  const fileName = segments.pop() ?? '';
  if (!fileName) {
    return source;
  }

  const prefixBudget = Math.max(0, maxLength - (fileName.length + 2));
  if (prefixBudget <= 0) {
    return `…/${fileName}`;
  }

  let prefix = '';
  for (const segment of segments) {
    if (!segment) {
      continue;
    }
    const candidate = prefix ? `${prefix}/${segment}` : segment;
    if (candidate.length > prefixBudget) {
      break;
    }
    prefix = candidate;
  }

  if (!prefix) {
    const first = segments[0] ?? '';
    prefix = first ? first.slice(0, prefixBudget) : '';
  }

  return prefix ? `${prefix}…/${fileName}` : `…/${fileName}`;
};

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
