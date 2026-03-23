import type { RuntimeAPIs } from '@/lib/api/types';

let registeredRuntimeAPIs: RuntimeAPIs | null = null;

export const registerRuntimeAPIs = (apis: RuntimeAPIs | null): void => {
  registeredRuntimeAPIs = apis;
};

export const getRegisteredRuntimeAPIs = (): RuntimeAPIs | null => registeredRuntimeAPIs;
