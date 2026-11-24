// @ts-check
import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  // We manage sessions ourselves via the shared cookie + D1, so skip Astro's
  // KV-backed session store and the Images binding.
  session: false,
  adapter: cloudflare({ imageService: "passthrough" }),
  server: { port: 4321 },
});
