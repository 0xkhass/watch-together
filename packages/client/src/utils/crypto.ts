/**
 * End-to-end encryption for chat messages using Web Crypto API (AES-GCM).
 *
 * The encryption key is derived from the room code + optional password using
 * PBKDF2. Only clients in the room can decrypt messages — the server only
 * relays ciphertext.
 */

const SALT = 'watch-together-e2e-v1';
const KEY_ITERATIONS = 100_000;

let cachedKey: CryptoKey | null = null;
let cachedSeed = '';

/** Derive a stable AES-GCM key from room code + password. */
async function deriveKey(roomCode: string, password?: string): Promise<CryptoKey> {
  const seed = `${roomCode}:${password || ''}`;
  if (cachedKey && cachedSeed === seed) return cachedKey;

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(seed),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  cachedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT),
      iterations: KEY_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  cachedSeed = seed;
  return cachedKey;
}

/** Encrypt a plaintext string. Returns base64 string of iv + ciphertext. */
export async function encryptMessage(
  plaintext: string,
  roomCode: string,
  password?: string,
): Promise<string> {
  const key = await deriveKey(roomCode, password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );

  // Combine iv + ciphertext into a single array
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/** Decrypt a base64 string back to plaintext. Returns null on failure. */
export async function decryptMessage(
  encrypted: string,
  roomCode: string,
  password?: string,
): Promise<string | null> {
  try {
    const key = await deriveKey(roomCode, password);
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null; // Decryption failed (wrong key, tampered data, etc.)
  }
}

/** Clear cached key (call on room leave). */
export function clearEncryptionKey(): void {
  cachedKey = null;
  cachedSeed = '';
}
