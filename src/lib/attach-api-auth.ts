import { createMiddleware } from "@tanstack/react-start";

import { getToken } from "@/lib/auth-session";

/** Attaches Hostinger API bearer token from the shared persistent session to server function requests. */
export const attachApiAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = getToken();
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});
