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

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB limit

export const useFileStore = create<FileStore>()(

    devtools(
        persist(
            (set, get) => ({
                // Initial State
                attachedFiles: [],

                addAttachedFile: async (file: File) => {
                        // Check if we already have this file attached (by name and size)
                        const { attachedFiles } = get();
                        const isDuplicate = attachedFiles.some((f) => f.filename === file.name && f.size === file.size);
                        if (isDuplicate) {
                            console.log(`File "${file.name}" is already attached`);
                            return;
                        }

                        // Check file size (10MB limit)
                        const maxSize = MAX_ATTACHMENT_SIZE;
                        if (file.size > maxSize) {
                            throw new Error(`File "${file.name}" is too large. Maximum size is 10MB.`);
                        }

                        // Validate file type (basic check for common types)
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
                            "application/octet-stream", // For unknown types
                        ];

                        const isAllowed = allowedTypes.some((type) => file.type.startsWith(type) || file.type === type || file.type === "");

                        if (!isAllowed && file.type !== "") {
                            console.warn(`File type "${file.type}" might not be supported`);
                        }

                        // Read file as data URL
                        const reader = new FileReader();
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                        });

                        // Extract just the filename from the path (in case of full path)
                        const extractFilename = (fullPath: string) => {
                            // Handle both forward slashes and backslashes
                            const parts = fullPath.replace(/\\/g, "/").split("/");
                            return parts[parts.length - 1] || fullPath;
                        };

                        const attachedFile: AttachedFile = {
                            id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                            file,
                            dataUrl,
                            mimeType: file.type || "application/octet-stream",
                            filename: extractFilename(file.name),
                            size: file.size,
                            source: "local", // Default to local file
                        };

                        set((state) => ({
                            attachedFiles: [...state.attachedFiles, attachedFile],
                        }));
                },

                addServerFile: async (path: string, name: string, content?: string) => {
                        // Check for duplicates
                        const { attachedFiles } = get();
                        const isDuplicate = attachedFiles.some((f) => f.serverPath === path && f.source === "server");
                        if (isDuplicate) {
                            console.log(`Server file "${name}" is already attached`);
                            return;
                        }

                        // If content is not provided, we'll fetch it from the server using the API
                        let fileContent = content;
                        if (!fileContent) {
                            try {
                                // Use the OpenCode API to read the file
                                const tempClient = opencodeClient.getApiClient();

                                // Split the full path into directory and filename
                                const lastSlashIndex = path.lastIndexOf("/");
                                const directory = lastSlashIndex > 0 ? path.substring(0, lastSlashIndex) : "/";
                                const filename = lastSlashIndex > 0 ? path.substring(lastSlashIndex + 1) : path;

                                const response = await tempClient.file.read({
                                    query: {
                                        path: filename, // Just the filename
                                        directory: directory, // The directory context
                                    },
                                });

                                // The response.data is of type FileContent which has a content property
                                if (response.data && "content" in response.data) {
                                    fileContent = response.data.content;
                                } else {
                                    fileContent = "";
                                }
                            } catch (error) {
                                console.error("Failed to read server file:", error);
                                // For binary files or errors, just mark it as attached without content
                                fileContent = `[File: ${name}]`;
                            }
                        }

                        // Create a File object from the server content
                        const blob = new Blob([fileContent || ""], { type: "text/plain" });

                        if (blob.size > MAX_ATTACHMENT_SIZE) {
                            throw new Error(`File "${name}" is too large. Maximum size is 10MB.`);
                        }

                        const file = new File([blob], name, { type: "text/plain" });

                        // Create data URL for preview (handle Unicode properly)
                        const encoder = new TextEncoder();
                        const data = encoder.encode(fileContent || "");
                        const base64 = btoa(String.fromCharCode(...data));
                        const dataUrl = `data:text/plain;base64,${base64}`;

                        const attachedFile: AttachedFile = {
                            id: `server-file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                            file,
                            dataUrl,
                            mimeType: "text/plain",
                            filename: name,
                            size: blob.size,
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
