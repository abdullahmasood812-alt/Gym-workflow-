import type { UserCredentials } from '../types';

const encoder = new TextEncoder();

export const RECOVERY_QUESTIONS = [
  'What was your first school?',
  'What is your favourite food?',
  "What is your mother's birthplace?",
  "What was your first pet's name?",
];

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buffer))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 150000, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(bits);
}

export async function makeCredentials(username: string, password: string): Promise<UserCredentials> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const s = toHex(saltBytes);
  return {
    u: username.toLowerCase(),
    s,
    h: await hashPassword(password, s),
  };
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}
