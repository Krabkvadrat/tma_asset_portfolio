import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // APP_HOSTNAME is the deployment's public hostname, set in the repo-root
  // .env one level up. Allowing it through the dev server's host check lets
  // `npm run dev` be tunnelled to the real domain; quick tunnels stay allowed
  // for throwaway ones.
  const { APP_HOSTNAME } = loadEnv(mode, "..", "");

  return {
    plugins: [react()],
    server: {
      port: 3000,
      allowedHosts: [".trycloudflare.com", ...(APP_HOSTNAME ? [APP_HOSTNAME] : [])],
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
  };
});
