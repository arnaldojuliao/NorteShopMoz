/**
 * Criptografia simples para dados sensíveis no localStorage.
 * Usa Web Crypto API (AES-GCM) com chave derivada de secret do servidor.
 * 
 * NOTA: Em produção, a chave mestra deve vir do backend via endpoint seguro
 * ou ser derivada de segredo compartilhado. Aqui usamos uma chave derivada
 * de variável de ambiente para demonstração.
 */

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

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

/** Obtém secret do ambiente (em produção, viria do backend). */
function getSecret(): string {
  // Em produção, usar NEXT_PUBLIC_ENCRYPTION_SECRET ou buscar do backend
  return process.env.NEXT_PUBLIC_ENCRYPTION_SECRET ?? "dev-secret-change-in-production-32chars!!";
}

/** Encripta dados para armazenamento seguro no localStorage. */
export async function encryptStorage<T>(key: string, data: T): Promise<void> {
  if (typeof window === "undefined") return;
  
  try {
    const secret = getSecret();
    const cryptoKey = await deriveKey(secret);
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
    console.warn("Falha ao encriptar localStorage:", error);
    // Fallback: armazena sem criptografia (melhor que perder dados)
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
    const cryptoKey = await deriveKey(secret);
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
    console.warn("Falha ao desencriptar localStorage:", error);
    // Tenta ler versão não encriptada
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

/** Chaves que devem ser encriptadas. */
export const ENCRYPTED_KEYS = {
  USER_PROFILE: "nsm:profile",
  CART: "nsm:cart",
  FAVORITES: "nsm:favorites",
  ADDRESSES: "nsm:addresses",
  ORDERS: "nsm:orders",
  GUEST_ID: "nsm:guest-id",
} as const;