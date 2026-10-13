export function getApiBaseUrl() {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  const onLocalhost =
    typeof window !== 'undefined' &&
    /localhost|127\.0\.0\.1/.test(window.location.hostname);

  if (fromEnv) {
    if (/localhost|127\.0\.0\.1/.test(fromEnv) && !onLocalhost) {
      return '/api';
    }
    return fromEnv;
  }

  return onLocalhost ? 'http://localhost:5000/api' : '/api';
}

export const API_BASE_URL = getApiBaseUrl();
