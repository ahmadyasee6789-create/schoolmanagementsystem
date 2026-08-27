// app/superadmin/helpers.ts

export function fmtDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PK", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

/**
 * Pulls a real, useful message out of an axios error instead of always
 * showing the same generic string. Falls back gracefully if the shape
 * is unexpected (network error, non-axios throw, etc).
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return (
    anyErr?.response?.data?.detail ||
    anyErr?.response?.data?.message ||
    anyErr?.message ||
    fallback
  );
}

export function isUnauthorized(err: unknown): boolean {
  const status = (err as any)?.response?.status;
  return status === 401;
}