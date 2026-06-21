import { createMiddleware } from "@tanstack/react-start";

const TOKEN_KEY = "qs_token";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = typeof window !== "undefined" ? sessionStorage.getItem(TOKEN_KEY) : null;
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});
