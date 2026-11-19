import type { BioSetting, Role } from '../types';
import { getBioSetting, setBioSetting } from './storage';

interface MMNativeBridge {
  canAuth?: () => boolean;
  authenticate?: () => void;
}

declare global {
  interface Window {
    MMNative?: MMNativeBridge;
    bioResult?: (ok: boolean) => void;
  }
}

let pendingBioCallback: ((ok: boolean) => void) | null = null;

if (typeof window !== 'undefined') {
  window.bioResult = (ok: boolean) => {
    const cb = pendingBioCallback;
    pendingBioCallback = null;
    if (cb) cb(ok);
  };
}

export async function canUseBiometrics(): Promise<{
  available: boolean;
  mode: 'native' | 'webauthn' | 'none';
  reason?: string;
}> {
  try {
    if (window.MMNative && typeof window.MMNative.canAuth === 'function' && window.MMNative.canAuth()) {
      return { available: true, mode: 'native' };
    }
  } catch {
    // ignore native bridge error
  }

  try {
    if (
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    ) {
      const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (available) {
        return { available: true, mode: 'webauthn' };
      }
      return {
        available: false,
        mode: 'none',
        reason: 'No fingerprint or platform biometric sensor detected on this browser.',
      };
    }
  } catch {
    return {
      available: false,
      mode: 'none',
      reason: 'Biometric authentication is blocked by browser context. You can use Quick PIN Security instead.',
    };
  }

  return {
    available: false,
    mode: 'none',
    reason: 'Browser does not support WebAuthn biometrics. You can use Quick PIN Security instead.',
  };
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function enrollBiometric(role: Role, user: string): Promise<{ ok: boolean; message: string }> {
  const capability = await canUseBiometrics();
  if (!capability.available) {
    return {
      ok: false,
      message: capability.reason || 'Fingerprint or device biometric unlock is not available here.',
    };
  }

  if (capability.mode === 'native' && window.MMNative?.authenticate) {
    const ok = await new Promise<boolean>((resolve) => {
      pendingBioCallback = resolve;
      window.MMNative!.authenticate!();
    });
    if (ok) {
      setBioSetting({
        role,
        user,
        mode: 'native',
        enabledAt: new Date().toISOString().slice(0, 10),
      });
      return { ok: true, message: 'Fingerprint unlock enabled' };
    }
    return { ok: false, message: 'Fingerprint was not confirmed' };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = new TextEncoder().encode(`${role}:${user}`);
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Muscle Max Gym' },
        user: {
          id: userId,
          name: user,
          displayName: `${user} (${role})`,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { ok: false, message: 'Biometric enrollment was cancelled' };
    }

    const bio: BioSetting = {
      role,
      user,
      credentialId: bufferToBase64Url(credential.rawId),
      mode: 'webauthn',
      enabledAt: new Date().toISOString().slice(0, 10),
    };
    setBioSetting(bio);
    return { ok: true, message: 'Fingerprint unlock enabled' };
  } catch {
    return {
      ok: false,
      message: 'Biometric enrollment was blocked or cancelled. Set a Quick PIN as backup.',
    };
  }
}

export async function authenticateBiometric(): Promise<{ ok: boolean; bio?: BioSetting; message?: string }> {
  const bio = getBioSetting();
  if (!bio) return { ok: false };

  if (window.MMNative && typeof window.MMNative.authenticate === 'function') {
    const ok = await new Promise<boolean>((resolve) => {
      pendingBioCallback = resolve;
      window.MMNative!.authenticate!();
    });
    return ok ? { ok: true, bio } : { ok: false, message: 'Fingerprint was not confirmed' };
  }

  if (bio.credentialId && window.PublicKeyCredential) {
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              type: 'public-key',
              id: base64UrlToUint8Array(bio.credentialId),
            },
          ],
          userVerification: 'required',
          timeout: 60000,
        },
      });
      if (assertion) {
        return { ok: true, bio };
      }
    } catch {
      return { ok: false, message: 'Fingerprint verification cancelled or failed' };
    }
  }

  return { ok: false, message: 'Biometric unlock is unavailable here. Use Quick PIN or password.' };
}
