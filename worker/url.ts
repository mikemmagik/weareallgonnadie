/** Contract v1 deliberately preserves path, query content, and query ordering. */
export function canonicalizeUrl(value: string | null): string | null {
  if (value === null) return null;
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}
