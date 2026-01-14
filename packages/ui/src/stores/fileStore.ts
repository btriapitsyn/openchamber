import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { opencodeClient } from "@/lib/opencode/client";
import type { AttachedFile } from "./types/sessionTypes";
import { getSafeStorage } from "./utils/safeStorage";

interface FileState {
    attachedFiles: AttachedFile[];
}

interface FileActions {
    addAttachedFile: (file: File) => Promise<void>;
    addServerFile: (path: string, name: string, content?: string) => Promise<void>;
    removeAttachedFile: (id: string) => void;
    clearAttachedFiles: () => void;
}

type FileStore = FileState & FileActions;

const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;

const guessMimeTypeFromName = (filename: string): string => {
    const name = (filename || "").toLowerCase();
    const ext = name.includes(".") ? name.split(".").pop() || "" : "";
    switch (ext) {
        case "png":
            return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "gif":
            return "image/gif";
        case "webp":
            return "image/webp";
        case "svg":
            return "image/svg+xml";
        case "bmp":
            return "image/bmp";
        case "ico":
            return "image/x-icon";
        case "pdf":
            return "application/pdf";
        default:
            return "text/plain";
    }
};

const guessMimeType = (file: File): string => {
    if (file.type && file.type.trim().length > 0) {
        return file.type;
    }

    const name = (file.name || "").toLowerCase();
    const ext = name.includes(".") ? name.split(".").pop() || "" : "";
    const noExtNames = new Set([
        "license",
        "readme",
        "changelog",
        "notice",
        "authors",
        "copying",
    ]);

    if (noExtNames.has(name)) return "text/plain";

    switch (ext) {
        case "md":
        case "markdown":
            return "text/markdown";
        case "txt":
            return "text/plain";
        case "json":
            return "application/json";
        case "yaml":
        case "yml":
            return "application/x-yaml";
        case "ts":
        case "tsx":
        case "js":
        case "jsx":
        case "mjs":
        case "cjs":
        case "py":
        case "rb":
        case "sh":
        case "bash":
        case "zsh":
            return "text/plain";
        default:
            return "application/octet-stream";
    }
};

const base64ByteLength = (base64: string): number => {
    const cleaned = base64.replace(/\s+/g, "");
    if (!cleaned) {
        return 0;
    }
    const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
    return Math.floor((cleaned.length * 3) / 4) - padding;
};

const base64EncodeBytes = (bytes: Uint8Array): string => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let output = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i] ?? 0;
        const b = bytes[i + 1];
        const c = bytes[i + 2];
        const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
        output += alphabet[(triple >> 18) & 63];
        output += alphabet[(triple >> 12) & 63];
        output += typeof b === "number" ? alphabet[(triple >> 6) & 63] : "=";
        output += typeof c === "number" ? alphabet[triple & 63] : "=";
    }
    return output;
};

export const useFileStore = create<FileStore>()(

    devtools(
        persist(
            (set, get) => ({

                attachedFiles: [],

                addAttachedFile: async (file: File) => {

                        const { attachedFiles } = get();
                        const isDuplicate = attachedFiles.some((f) => f.filename === file.name && f.size === file.size);
                        if (isDuplicate) {
                            console.log(`File "${file.name}" is already attached`);
                            return;
                        }

                        const maxSize = MAX_ATTACHMENT_SIZE;
                        if (file.size > maxSize) {
                            throw new Error(`File "${file.name}" is too large. Maximum size is 50MB.`);
                        }

                        const allowedTypes = [
                            "text/",
                            "application/json",
                            "application/xml",
                            "application/pdf",
                            "image/",
                            "video/",
                            "audio/",
                            "application/javascript",
                            "application/typescript",
                            "application/x-python",
                            "application/x-ruby",
                            "application/x-sh",
                            "application/yaml",
                            "application/octet-stream",
                        ];

                        const mimeType = guessMimeType(file);
                        const isAllowed = allowedTypes.some((type) => mimeType.startsWith(type) || mimeType === type || mimeType === "");

                        if (!isAllowed && mimeType !== "") {
                            console.warn(`File type "${mimeType}" might not be supported`);
                        }

                        const reader = new FileReader();
                        const rawDataUrl = await new Promise<string>((resolve, reject) => {
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                        });

                        const dataUrl = rawDataUrl.startsWith("data:")
                            ? rawDataUrl.replace(/^data:[^;]*/, `data:${mimeType}`)
                            : rawDataUrl;

                        const extractFilename = (fullPath: string) => {

                            const parts = fullPath.replace(/\\/g, "/").split("/");
                            return parts[parts.length - 1] || fullPath;
                        };

                        const attachedFile: AttachedFile = {
                            id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                            file,
                            dataUrl,
                            mimeType,
                            filename: extractFilename(file.name),
                            size: file.size,
                            source: "local",
                        };

                        set((state) => ({
                            attachedFiles: [...state.attachedFiles, attachedFile],
                        }));
                },

                addServerFile: async (path: string, name: string, content?: string) => {

                        const { attachedFiles } = get();
                        const isDuplicate = attachedFiles.some((f) => f.serverPath === path && f.source === "server");
                        if (isDuplicate) {
                            console.log(`Server file "${name}" is already attached`);
                            return;
                        }

                        let fileContent = content;
                        let encoding: "base64" | undefined;
                        let resolvedMimeType: string | undefined;
                        if (!fileContent) {
                            try {

                                const tempClient = opencodeClient.getApiClient();

                                const lastSlashIndex = path.lastIndexOf("/");
                                const directory = lastSlashIndex > 0 ? path.substring(0, lastSlashIndex) : "/";
                                const filename = lastSlashIndex > 0 ? path.substring(lastSlashIndex + 1) : path;

                                const response = await tempClient.file.read({
                                    path: filename,
                                    directory: directory,
                                });

                                if (response.data && "content" in response.data) {
                                    fileContent = response.data.content;
                                    encoding = response.data.encoding ?? undefined;
                                    resolvedMimeType = response.data.mimeType ?? undefined;
                                } else {
                                    fileContent = "";
                                }
                            } catch (error) {
                                console.error("Failed to read server file:", error);

                                fileContent = `[File: ${name}]`;
                            }
                        }

                        const inferredMime = resolvedMimeType || guessMimeTypeFromName(name);
                        const safeMimeType = inferredMime && inferredMime.trim().length > 0 ? inferredMime : "application/octet-stream";

                        const base64 = (() => {
                            if (encoding === "base64") {
                                return fileContent || "";
                            }
                            const encoder = new TextEncoder();
                            const data = encoder.encode(fileContent || "");
                            return base64EncodeBytes(data);
                        })();

                        const sizeBytes = encoding === "base64"
                            ? base64ByteLength(base64)
                            : new TextEncoder().encode(fileContent || "").length;

                        if (sizeBytes > MAX_ATTACHMENT_SIZE) {
                            throw new Error(`File "${name}" is too large. Maximum size is 50MB.`);
                        }

                        const file = new File([], name, { type: safeMimeType });
                        const dataUrl = `data:${safeMimeType};base64,${base64}`;

                        const attachedFile: AttachedFile = {
                            id: `server-file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                            file,
                            dataUrl,
                            mimeType: safeMimeType,
                            filename: name,
                            size: sizeBytes,
                            source: "server",
                            serverPath: path,
                        };

                        set((state) => ({
                            attachedFiles: [...state.attachedFiles, attachedFile],
                        }));
                },

                removeAttachedFile: (id: string) => {
                    set((state) => ({
                        attachedFiles: state.attachedFiles.filter((f) => f.id !== id),
                    }));
                },

                clearAttachedFiles: () => {
                    set({ attachedFiles: [] });
                },
            }),
            {
                name: "file-store",
                storage: createJSONStorage(() => getSafeStorage()),
                partialize: (state) => ({
                    attachedFiles: state.attachedFiles,
                }),
            }
        ),
        {
            name: "file-store",
        }
    )
);
