import { createMiddleware } from "@tanstack/react-start";

const TOKEN_KEY = "qs_token";

/** Attaches Hostinger API bearer token from sessionStorage to server function requests. */
export const attachApiAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = typeof window !== "undefined" ? sessionStorage.getItem(TOKEN_KEY) : null;
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});
