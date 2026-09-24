import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages: https://n2i0g-322.github.io/OKV-Spend-Smart/
  base: "/OKV-Spend-Smart/",
});
