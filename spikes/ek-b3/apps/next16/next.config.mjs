import { fileURLToPath } from 'node:url';

// Depo kökündeki package-lock.json yüzünden Next kök klasörü yanlış tahmin etmesin.
const root = fileURLToPath(new URL('.', import.meta.url));

export default { turbopack: { root }, outputFileTracingRoot: root };
