/** Build a same-origin relative href while preserving tenant path, other query keys and hash. */
export function patchSearchHref(
  patch: Record<string, string | number | undefined>,
  current: Pick<Location, "pathname" | "search" | "hash"> = window.location,
): string {
  const search = new URLSearchParams(current.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) search.delete(key);
    else search.set(key, String(value));
  }
  const query = search.toString();
  return `${current.pathname}${query ? `?${query}` : ""}${current.hash}`;
}
