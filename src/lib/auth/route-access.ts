export type AppRole = "manager" | "staff";

const publicPrefixes = ["/auth/login", "/auth/register", "/auth/callback"];
const staffPrefixes = ["/receive", "/count", "/production", "/waste"];
const managerPrefixes = [
  "/today",
  "/imports",
  "/mapping",
  "/financial-health",
  "/purchasing",
  "/receiving",
  "/invoices",
  "/inventory",
  "/recipes",
  "/exceptions",
];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicRoute(pathname: string) {
  return publicPrefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isRouteAllowedForRole(pathname: string, role: AppRole) {
  if (isPublicRoute(pathname)) {
    return true;
  }

  if (role === "manager") {
    return [...managerPrefixes, ...staffPrefixes].some((prefix) =>
      matchesPrefix(pathname, prefix),
    );
  }

  return staffPrefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

export function getDefaultRouteForRole(role: AppRole) {
  return role === "manager" ? "/today" : "/receive";
}
