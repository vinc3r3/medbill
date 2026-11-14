// The user's personal details, kept only in this browser's localStorage (docs/spec.md, "Redaction").
// Used to redact documents before any network call and to fill letter placeholders at approval.

export type Profile = { name: string; dateOfBirth: string; memberId: string; address: string };

export const EMPTY_PROFILE: Profile = { name: '', dateOfBirth: '', memberId: '', address: '' };

export const PROFILE_STORAGE_KEY = 'medbill.profile';
export const PROFILE_CHANGED_EVENT = 'medbill:profile-changed';

/** Parses stored JSON into a Profile; anything malformed becomes empty fields. */
export function parseProfile(raw: string | null): Profile {
  if (!raw) return EMPTY_PROFILE;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const str = (k: keyof Profile) => (typeof data[k] === 'string' ? (data[k] as string).trim() : '');
    return { name: str('name'), dateOfBirth: str('dateOfBirth'), memberId: str('memberId'), address: str('address') };
  } catch {
    return EMPTY_PROFILE;
  }
}

export const isProfileEmpty = (p: Profile) => !p.name && !p.dateOfBirth && !p.memberId && !p.address;

// ---- Browser storage (no-ops on the server or when storage is blocked) -----------------------
export function readStoredProfile(): string | null {
  try {
    return window.localStorage.getItem(PROFILE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Returns false when the browser blocks storage (private mode etc.). */
export function saveProfile(profile: Profile | null): boolean {
  try {
    if (profile) window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    else window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}
