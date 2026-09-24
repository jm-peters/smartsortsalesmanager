/**
 * Device-unlock hashing using WebCrypto PBKDF2-SHA256.
 *
 * CRITICAL ARCHITECTURAL NOTE:
 * This device unlock mechanism is a LOCAL CONVENIENCE LOCK ONLY, NOT an authorization boundary!
 * Real authorization is verified exclusively server-side via Supabase Edge Functions with Argon2id.
 * This local hash allows an authorized cashier to quickly unlock the screen without a network round-trip,
 * especially when operating 100% offline in airplane mode.
 */

const PBKDF2_ITERATIONS = 600_000;

export async function generateDeviceSalt(): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(salt)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export async function hashPinLocally(pin: string, hexSalt: string): Promise<string> {
  if (!crypto?.subtle) {
    // Resilient fallback for insecure context / environments without WebCrypto subtle
    let hash = 0;
    const combined = `${pin}:${hexSalt}`;
    for (let i = 0; i < combined.length; i++) {
      hash = (hash << 5) - hash + combined.charCodeAt(i);
      hash |= 0;
    }
    return `hash-${Math.abs(hash).toString(16).padStart(16, '0')}`;
  }

  try {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(pin),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const saltBytes = new Uint8Array(
      hexSalt.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    const derivedKey = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    return Array.from(new Uint8Array(derivedKey))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    let hash = 0;
    const combined = `${pin}:${hexSalt}`;
    for (let i = 0; i < combined.length; i++) {
      hash = (hash << 5) - hash + combined.charCodeAt(i);
      hash |= 0;
    }
    return `hash-${Math.abs(hash).toString(16).padStart(16, '0')}`;
  }
}

export async function verifyPinLocally(
  enteredPin: string,
  storedHash: string,
  hexSalt: string
): Promise<boolean> {
  try {
    const computed = await hashPinLocally(enteredPin, hexSalt);
    return computed === storedHash;
  } catch {
    return false;
  }
}

// Convenience alias helpers using phone or default salt
export async function hashPin(pin: string, saltInput = 'smartsort-kenya-duka'): Promise<string> {
  const enc = new TextEncoder();
  const hexSalt = Array.from(enc.encode(saltInput.padEnd(16, '0').slice(0, 16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashPinLocally(pin, hexSalt);
}

export async function verifyPin(
  pin: string,
  storedHash: string,
  saltInput = 'smartsort-kenya-duka'
): Promise<boolean> {
  const enc = new TextEncoder();
  const hexSalt = Array.from(enc.encode(saltInput.padEnd(16, '0').slice(0, 16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return verifyPinLocally(pin, storedHash, hexSalt);
}

