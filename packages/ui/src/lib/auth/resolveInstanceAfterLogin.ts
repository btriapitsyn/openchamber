export const resolveInstanceApiBaseUrlAfterLogin = (
  params: { enteredUrl: string },
): { apiBaseUrl: string; origin: string } => {
  const input = typeof params.enteredUrl === 'string' ? params.enteredUrl.trim() : '';
  if (!input) {
    throw new Error('Instance URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    parsed = new URL(`https://${input}`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Instance URL must use http or https');
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  const apiBaseUrl = normalizedPath.endsWith('/api')
    ? `${parsed.origin}${normalizedPath}`
    : `${parsed.origin}/api`;

  return {
    apiBaseUrl,
    origin: new URL(apiBaseUrl).origin,
  };
};
