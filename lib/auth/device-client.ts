"use client";

// Browser half of the device credential. The secret lives here and nowhere
// else — the server only ever holds its hash — so clearing site data or using
// a different browser correctly forces a fresh magic-link enrolment.

const KEY = "bd_device";

export type StoredDevice = {
  deviceId: string;
  deviceSecret: string;
  label?: string;
  hasPasskey?: boolean;
};

export function loadDevice(): StoredDevice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDevice;
    return parsed?.deviceId && parsed?.deviceSecret ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDevice(d: StoredDevice): void {
  window.localStorage.setItem(KEY, JSON.stringify(d));
}

export function updateDevice(patch: Partial<StoredDevice>): void {
  const cur = loadDevice();
  if (!cur) return;
  saveDevice({ ...cur, ...patch });
}

export function forgetDevice(): void {
  window.localStorage.removeItem(KEY);
}

/** Platform authenticator = built-in biometrics, not a roaming USB key. */
export async function biometricsAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}
