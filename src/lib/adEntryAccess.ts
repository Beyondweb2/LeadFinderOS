// In-memory fallback so the flag is never lost between route transitions
let inMemoryAdAccess = false;

export function markAdEntryAccess() {
  inMemoryAdAccess = true;
  try {
    sessionStorage.setItem('adEntryAccess', 'true');
  } catch {}
}

export function clearAdEntryAccess() {
  inMemoryAdAccess = false;
  try {
    sessionStorage.removeItem('adEntryAccess');
  } catch {}
}

export function hasAdEntryAccess(): boolean {
  if (inMemoryAdAccess) return true;
  try {
    return sessionStorage.getItem('adEntryAccess') === 'true';
  } catch {
    return false;
  }
}
