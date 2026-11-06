type Account = { is_superadmin?: boolean } | null;

export function authenticatedHome(user: Account) {
  return user?.is_superadmin ? "/superadmin" : "/dashboard";
}

export function loginDestination(destination: unknown, user: Account) {
  if (user?.is_superadmin) return authenticatedHome(user);
  // Older API versions return '/' for the school dashboard.
  if (typeof destination !== "string" || destination === "/" || destination === "/signin"
      || !destination.startsWith("/") || destination.startsWith("//") || /[\\\r\n]/.test(destination)) {
    return authenticatedHome(user);
  }
  return destination;
}
