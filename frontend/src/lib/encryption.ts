/**
 * Ofuscação dos dados guardados no localStorage (carrinho, favoritos).
 * Usa Web Crypto API (AES-GCM) com chave derivada de um segredo do ambiente.
 *
 * ⚠️ IMPORTANTE — isto NÃO é confidencialidade. A chave é derivada de uma
 * variável `NEXT_PUBLIC_*`, ou seja, vai dentro do bundle enviado ao browser:
 * qualquer pessoa (ou XSS) consegue lê-la e desencriptar os dados. Serve para
 * evitar leitura casual/inspeção trivial do localStorage, não para proteger
 * segredos. Dados verdadeiramente sensíveis devem ficar no servidor.
 *
 * Nota: `crypto.subtle` só existe em contextos seguros (HTTPS ou localhost).
 * Em HTTP sobre IP a derivação falha e o valor é guardado sem ofuscação.
 */

import { envOr } from "@/lib/env";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/**
 * Cache das chaves derivadas por segredo. Derivar é caro (PBKDF2, 100k
 * iterações) — sem cache, cada gravação/leitura do carrinho repetia o cálculo.
 */
const derivedKeyCache = new Map<string, Promise<CryptoKey>>();

function getDerivedKey(secret: string): Promise<CryptoKey> {
  let cached = derivedKeyCache.get(secret);
  if (!cached) {
    cached = deriveKey(secret);
    derivedKeyCache.set(secret, cached);
  }
  return cached;
}

/** Deriva chave de criptografia a partir de secret. */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: ENCODER.encode("norteshopmoz-localstorage-salt"), // Salt fixo para determinismo
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Segredo usado para derivar a chave. Vem de NEXT_PUBLIC_ENCRYPTION_SECRET —
 * logo é público (ver aviso no topo do ficheiro). Serve apenas para ofuscar.
 */
function getSecret(): string {
  // `envOr`: um build arg ausente chega como "" — sem isto a chave seria
  // derivada de password vazia (o default nunca se aplicaria).
  return envOr(process.env.NEXT_PUBLIC_ENCRYPTION_SECRET, "dev-secret-change-in-production-32chars!!");
}

/** Encripta dados para armazenamento seguro no localStorage. */
export async function encryptStorage<T>(key: string, data: T): Promise<void> {
  if (typeof window === "undefined") return;
  
  try {
    const secret = getSecret();
    const cryptoKey = await getDerivedKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV para AES-GCM
    const plaintext = ENCODER.encode(JSON.stringify(data));
    
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      plaintext
    );
    
    // Armazena IV + ciphertext como base64
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    
    const stored = btoa(String.fromCharCode(...combined));
    window.localStorage.setItem(`enc:${key}`, stored);
  } catch (error) {
    console.warn("Falha ao ofuscar localStorage (a usar texto simples):", error);
    // Fallback: armazena sem ofuscação (melhor que perder dados). Acontece em
    // contextos sem crypto.subtle (HTTP sobre IP, fora de localhost).
    window.localStorage.setItem(key, JSON.stringify(data));
  }
}

/** Desencripta dados do localStorage. */
export async function decryptStorage<T>(key: string): Promise<T | null> {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = window.localStorage.getItem(`enc:${key}`);
    if (!stored) {
      // Tenta ler versão não encriptada (migração)
      const plain = window.localStorage.getItem(key);
      return plain ? JSON.parse(plain) : null;
    }
    
    const secret = getSecret();
    const cryptoKey = await getDerivedKey(secret);
    const combined = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      ciphertext
    );
    
    return JSON.parse(DECODER.decode(plaintext));
  } catch (error) {
    console.warn("Falha ao desofuscar localStorage:", error);
    // Tenta ler versão não ofuscada (migração/contexto sem crypto.subtle)
    const plain = window.localStorage.getItem(key);
    return plain ? JSON.parse(plain) : null;
  }
}

/** Remove dados encriptados do localStorage. */
export function removeEncryptedStorage(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`enc:${key}`);
  window.localStorage.removeItem(key); // Também remove versão não encriptada
}

/** Chaves cujo valor é ofuscado antes de ir para o localStorage. */
export const ENCRYPTED_KEYS = {
  USER_PROFILE: "nsm:profile",
  CART: "nsm:cart",
  FAVORITES: "nsm:favorites",
  ADDRESSES: "nsm:addresses",
  ORDERS: "nsm:orders",
  GUEST_ID: "nsm:guest-id",
} as const;