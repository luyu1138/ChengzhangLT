import { defineConfig } from "vite";
export default defineConfig({
  build: { target: "es2020", sourcemap: false },
  server: { port: 5173, strictPort: true },
});
