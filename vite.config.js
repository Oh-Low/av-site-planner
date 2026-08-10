import { cpSync, createReadStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

/** Serve / copy repo-root fixtures/ (default.avp) without duplicating under public/. */
function fixturesPlugin() {
  return {
    name: "av-fixtures",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/fixtures/")) {
          next();
          return;
        }
        const rel = normalize(url.slice(1));
        if (rel.includes("..")) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        const filePath = resolve(root, rel);
        if (!filePath.startsWith(resolve(root, "fixtures")) || !existsSync(filePath)) {
          next();
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        createReadStream(filePath).pipe(res);
      });
    },
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir ?? join(root, "dist");
      const dest = join(outDir, "fixtures");
      mkdirSync(dest, { recursive: true });
      cpSync(join(root, "fixtures"), dest, { recursive: true });
    },
  };
}

/** @type {import('vite').UserConfig} */
export default defineConfig({
  // Relative base so GitHub Pages works under /<repo>/ or custom domains.
  base: "./",
  publicDir: false,
  plugins: [fixturesPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    assetsInlineLimit: 0,
  },
  server: {
    port: 8080,
    open: true,
  },
  preview: {
    port: 8080,
  },
});
