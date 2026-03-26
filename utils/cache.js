// utils/cache.js
// A small wrapper around chrome.storage.local.
//
// Why this exists:
// - chrome.storage is async and callback-based.
// - This file provides Promise-based helpers so the rest of the code is cleaner.
//
// What to cache:
// - lightweight metadata (e.g., "last scan time", sender stats, user settings)
// - avoid caching full email bodies unless you truly need it

export function getFromCache(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key]));
  });
}

export function setInCache(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

export function removeFromCache(key) {
  return new Promise((resolve) => {
    chrome.storage.local.remove([key], () => resolve());
  });
}

