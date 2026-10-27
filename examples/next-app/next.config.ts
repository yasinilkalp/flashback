import type { NextConfig } from 'next';

/**
 * Rewind EK-B3 örneği (Next.js App Router). `NEXT_DIST_DIR`: Turbopack (`.next`) ve webpack (`.next-webpack`)
 * geliştirme sunucuları aynı anda çalışabilsin diye (e2e testleri). tsconfig.json iki klasörün tiplerini de
 * içerir; böylece `next dev` tsconfig'i yeniden yazmaz.
 */
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  devIndicators: false,
  // `next dev` aksi hâlde örnek klasörüne AGENTS.md yazar.
  agentRules: false,
};

export default config;
