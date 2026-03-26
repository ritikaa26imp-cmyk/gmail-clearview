// background.js (MV3 service worker)
// This runs "in the background" as a service worker (not a persistent page).
// Its main job is to obtain an OAuth token via chrome.identity and return it to
// content scripts / the popup when they ask for it.

const MSG_GET_TOKEN = "CLEARVIEW_GET_TOKEN";

/**
 * Get an OAuth token from Chrome's built-in identity flow.
 * - interactive=false: don't show UI; fails if user hasn't granted access yet.
 * - interactive=true: Chrome may show a consent/sign-in prompt if needed.
 */
function getAuthToken({ interactive }) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!token) return reject(new Error("No token returned"));
      resolve(token);
    });
  });
}

/**
 * Remove a token from Chrome's cache.
 * This is the standard recovery step if Gmail API calls start returning 401.
 */
function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

/**
 * Exported helper (service-worker side).
 * Other extension pages (popup/content scripts) don't import this directly;
 * they call it by sending a message to the service worker.
 */
export async function getToken({ interactive = false } = {}) {
  return await getAuthToken({ interactive });
}

/**
 * Message handler: other parts of the extension request a token.
 *
 * Contract:
 * - Request: { type: "CLEARVIEW_GET_TOKEN", interactive?: boolean, lastToken?: string }
 * - Response: { ok: true, token } or { ok: false, error }
 *
 * 401 handling:
 * - The 401 happens when calling the Gmail API with a token.
 * - When a caller sees a 401, they can re-request a token and include lastToken.
 * - We will clear the cached token and retry once automatically.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_TOKEN") {
    // Drop cached token first, then obtain a fresh one interactively (handles revoked tokens).
    chrome.identity.getAuthToken({ interactive: false }, (oldToken) => {
      if (oldToken) {
        chrome.identity.removeCachedAuthToken({ token: oldToken }, () => {
          chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
              console.error("Auth error:", chrome.runtime.lastError.message);
              sendResponse({ error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ token });
            }
          });
        });
      } else {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError) {
            console.error("Auth error:", chrome.runtime.lastError.message);
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ token });
          }
        });
      }
    });

    return true;
  }

  (async () => {
    try {
      if (!message || message.type !== MSG_GET_TOKEN) return;

      const interactive = Boolean(message.interactive);
      const lastToken = typeof message.lastToken === "string" ? message.lastToken : null;

      // Attempt 1: normal token request (may return cached token).
      try {
        const token = await getAuthToken({ interactive });
        return sendResponse({ ok: true, token });
      } catch (err) {
        // If the caller provided a previous token (likely used in a 401),
        // clear it and retry once.
        if (lastToken) {
          await removeCachedToken(lastToken);
          const token = await getAuthToken({ interactive });
          return sendResponse({ ok: true, token, refreshed: true });
        }

        return sendResponse({ ok: false, error: err.message || String(err) });
      }
    } catch (err) {
      return sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();

  // Keep the message channel open for async sendResponse.
  return true;
});

