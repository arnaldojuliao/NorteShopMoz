import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Global setup for E2E tests.
 * 1. Espera que o frontend (Next.js) esteja a responder.
 * 2. Espera que o backend (Spring Boot) esteja saudável — sem ele, o login
 *    e o carrinho falham em cadeia.
 * 3. Garante que os utilizadores de teste existem (registo via API; ignora
 *    conflito se já existirem).
 *
 * Usa apenas fetch (sem browser) para não depender dos binários do Playwright.
 */

const FRONTEND_URL = 'http://localhost:3000';

/** Lê NEXT_PUBLIC_API_BASE_URL do .env.local (Next não exporta env ao processo pai). */
function apiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  try {
    const raw = readFileSync(resolve(__dirname, '../../.env.local'), 'utf8');
    const line = raw.split('\n').find((l) => l.startsWith('NEXT_PUBLIC_API_BASE_URL='));
    if (line) return line.split('=')[1].trim();
  } catch {
    /* sem .env.local — usa o padrão */
  }
  return 'http://localhost:8080';
}

const API_BASE = apiBase();

/** Utilizadores criados a partir do registo público (POST /api/auth/register). */
const TEST_USERS = [
  { fullName: 'Utilizador A', email: 'usera@test.com', password: 'Teste@123', phone: '841234567' },
];

async function waitFor(url: string, label: string, maxRetries = 45): Promise<void> {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok || res.status === 401) {
        console.log(`✅ ${label} está pronto`);
        return;
      }
    } catch {
      // ainda não está pronto
    }
    retries++;
    console.log(`À espera do ${label}... (${retries}/${maxRetries})`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${label} não arrancou a tempo (${url}). Arranque-o manualmente e volte a correr.`);
}

async function ensureTestUsers(): Promise<void> {
  for (const user of TEST_USERS) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok || res.status === 409) {
        console.log(`✅ Utilizador de teste pronto: ${user.email}`);
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        console.warn(`⚠️ Registo de ${user.email} devolveu ${res.status}: ${body?.error ?? 'desconhecido'}`);
      }
    } catch (err) {
      console.warn(`⚠️ Não foi possível registar ${user.email}: ${err instanceof Error ? err.message : err}`);
    }
  }
  // O admin (admin@norteshopmoz.com / Admin@2026) é criado pelo DataSeeder do backend.
}

async function globalSetup() {
  await waitFor(FRONTEND_URL, 'frontend (Next.js)');
  await waitFor(`${API_BASE}/actuator/health`, 'backend (Spring Boot)');
  await ensureTestUsers();
}

export default globalSetup;
