export function normalizePath(path: string): string | null {
  // Remove leading and trailing slashes
  const normalized = path.replace(/^\/+|\/+$/g, "");

  // Ensure path doesn't contain '..' or '.'
  if (normalized.includes("..") || normalized.includes("/.")) {
    return null;
  }

  // Ensure path doesn't start with '/'
  if (normalized.startsWith("/")) {
    return null;
  }

  return normalized || null;
}
