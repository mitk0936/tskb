/** Serialize a value for a snapshot file, tolerating circular refs / non-JSON values. */
export const serialize = (value: unknown): string => {
  try {
    // JSON.stringify returns undefined for functions/undefined — fall back to a string.
    return JSON.stringify(value, null, 2) ?? JSON.stringify(String(value));
  } catch {
    // Circular or otherwise non-serializable: keep a best-effort representation
    // rather than throwing and losing the value entirely.
    return JSON.stringify(String(value));
  }
};
