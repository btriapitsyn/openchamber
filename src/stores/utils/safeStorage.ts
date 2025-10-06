let safeStorageInstance: Storage | null = null;

const createInMemoryStorage = (): Storage => {
    const store = new Map<string, string>();
    return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        clear: () => {
            store.clear();
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
            return store.size;
        },
    } as Storage;
};

const createSafeStorage = (): Storage => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return createInMemoryStorage();
    }

    const baseStorage = window.localStorage;
    const fallback = createInMemoryStorage();
    let storageAvailable = true;

    const disableStorage = () => {
        storageAvailable = false;
    };

    const safeGet = (key: string): string | null => {
        if (storageAvailable) {
            try {
                const value = baseStorage.getItem(key);
                if (value !== null) {
                    return value;
                }
            } catch {
                disableStorage();
            }
        }
        return fallback.getItem(key);
    };

    const safeSet = (key: string, value: string) => {
        if (storageAvailable) {
            try {
                baseStorage.setItem(key, value);
                fallback.removeItem(key);
                return;
            } catch {
                disableStorage();
            }
        }
        fallback.setItem(key, value);
    };

    const safeRemove = (key: string) => {
        if (storageAvailable) {
            try {
                baseStorage.removeItem(key);
            } catch {
                disableStorage();
            }
        }
        fallback.removeItem(key);
    };

    const safeClear = () => {
        if (storageAvailable) {
            try {
                baseStorage.clear();
            } catch {
                disableStorage();
            }
        }
        fallback.clear();
    };

    const safeKey = (index: number): string | null => {
        if (storageAvailable) {
            try {
                return baseStorage.key(index);
            } catch {
                disableStorage();
            }
        }
        return fallback.key(index);
    };

    return {
        getItem: safeGet,
        setItem: safeSet,
        removeItem: safeRemove,
        clear: safeClear,
        key: safeKey,
        get length() {
            if (storageAvailable) {
                try {
                    return baseStorage.length + fallback.length;
                } catch {
                    disableStorage();
                }
            }
            return fallback.length;
        },
    } as Storage;
};

export const getSafeStorage = (): Storage => {
    if (!safeStorageInstance) {
        safeStorageInstance = createSafeStorage();
    }
    return safeStorageInstance;
};

