declare module 'electron-context-menu' {
    import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';

    type DefaultActions = {
        [key: string]: (...args: unknown[]) => void;
    };

    type ContextMenuParams = unknown;

    interface ContextMenuOptions {
        window?: BrowserWindow;
        showInspectElement?: boolean;
        showSaveImage?: boolean;
        showSaveImageAs?: boolean;
        showSaveLinkAs?: boolean;
        showCopyLink?: boolean;
        showCopyImage?: boolean;
        showCopyImageAddress?: boolean;
        prepend?: (
            defaultActions: DefaultActions,
            params: ContextMenuParams,
            browserWindow: BrowserWindow | undefined
        ) => MenuItemConstructorOptions[];
        append?: (
            defaultActions: DefaultActions,
            params: ContextMenuParams,
            browserWindow: BrowserWindow | undefined
        ) => MenuItemConstructorOptions[];
        shouldShowMenu?: (event: unknown, params: ContextMenuParams) => boolean;
        labels?: Record<string, string>;
        [key: string]: unknown;
    }

    export default function contextMenu(options?: ContextMenuOptions): () => void;
}
