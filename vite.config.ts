
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const cwd = (process as any).cwd();
  const env = loadEnv(mode, cwd, '');
  
  // 注入 Gemini 和 DeepSeek 的 Key
  const apiKey = process.env.API_KEY || env.API_KEY;
  const dsKey = process.env.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY;

  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.DEEPSEEK_API_KEY': JSON.stringify(dsKey),
    },
  };
});
