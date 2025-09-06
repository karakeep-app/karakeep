/**
 * Chrome Storage Utilities
 * Generic utilities for working with chrome.storage.local
 */

/**
 * Get a single value from chrome.storage.local
 */
export async function getStorageValue<T>(
  key: string,
  defaultValue?: T,
): Promise<T> {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? defaultValue;
  } catch (err) {
    console.error(`Failed to get storage value for key "${key}":`, err);
    return defaultValue as T;
  }
}

/**
 * Set a single value in chrome.storage.local
 */
export async function setStorageValue<T>(key: string, value: T): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (err) {
    console.error(`Failed to set storage value for key "${key}":`, err);
    throw err;
  }
}

/**
 * Remove a single key from chrome.storage.local
 */
export async function removeStorageKey(key: string): Promise<void> {
  try {
    await chrome.storage.local.remove(key);
  } catch (err) {
    console.error(`Failed to remove storage key "${key}":`, err);
    throw err;
  }
}
