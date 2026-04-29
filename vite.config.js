import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("/node_modules/firebase/") || id.includes("/node_modules/@firebase/")) {
            return "firebase-vendor";
          }
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "react-vendor";
          }
          if (id.includes("/node_modules/react-router") || id.includes("/node_modules/@remix-run/")) {
            return "router-vendor";
          }
          return "vendor";
        },
      },
    },
  },
});
