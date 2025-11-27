import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env from file (.env) or system environment
  // The casting (process as any) avoids TypeScript errors if @types/node is missing
  const cwd = (process as any).cwd();
  const env = loadEnv(mode, cwd, '');
  
  // CRITICAL: On Vercel, API_KEY is in process.env. In local dev, it might be in .env (loaded via loadEnv).
  // We must check process.env.API_KEY first.
  const apiKey = process.env.API_KEY || env.API_KEY;

  return {
    plugins: [react()],
    define: {
      // This replaces 'process.env.API_KEY' in your code with the actual string value during build
      'process.env.API_KEY': JSON.stringify(apiKey),
    },
  };
});