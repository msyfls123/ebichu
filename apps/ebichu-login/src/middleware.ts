import { defineMiddleware } from "astro:middleware";
import { json } from "./lib/http";
import { isAllowedOrigin, UNSAFE_METHODS } from "./lib/origin";

export const onRequest = defineMiddleware((context, next) => {
  if (
    UNSAFE_METHODS.has(context.request.method) &&
    !isAllowedOrigin(context.request, context.url)
  ) {
    return json({ error: "Forbidden origin" }, 403);
  }
  return next();
});
