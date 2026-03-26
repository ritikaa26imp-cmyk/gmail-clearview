// gmail-api.js
// All Gmail API calls live here.
//
// Privacy promise:
// - We fetch email data from Google's Gmail API into the browser.
// - We process/classify emails locally.
// - We do NOT send email content to any third-party server.

const GMAIL_BASE = "https://www.googleapis.com/gmail/v1/users/me";

/**
 * Gmail uses base64url (URL-safe base64) for message bodies.
 * This helper converts base64url -> plain text.
 */
function decodeBase64Url(b64url) {
  if (!b64url) return "";
  const base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return atob(padded);
}

/**
 * Messages can be nested MIME parts. We walk the tree and prefer:
 * - text/plain if available
 * - otherwise text/html
 */
function extractBody(payload) {
  if (!payload) return "";

  // Some emails store content directly on the top-level payload.
  if (payload.body?.data) return decodeBase64Url(payload.body.data);

  const stack = [...(payload.parts || [])];
  let text = "";
  let html = "";

  while (stack.length) {
    const part = stack.shift();
    if (!part) continue;

    if (part.parts?.length) stack.push(...part.parts);

    const mime = (part.mimeType || "").toLowerCase();
    const data = part.body?.data;
    if (!data) continue;

    if (!text && mime.includes("text/plain")) text = decodeBase64Url(data);
    if (!html && mime.includes("text/html")) html = decodeBase64Url(data);
  }

  return text || html || "";
}

function headersToObject(headers = []) {
  const out = {};
  for (const h of headers) out[(h.name || "").toLowerCase()] = h.value || "";
  return out;
}

/**
 * We target:
 * - Primary tab
 * - Inbox
 * - Last ~1.5 years (approx using "newer_than:18m")
 */
function buildQuery() {
  return "in:inbox category:primary newer_than:18m -in:spam -in:trash";
}

/**
 * fetchEmails(token, maxResults=500)
 * Fetches the most recent Primary inbox emails, including their decoded bodies.
 *
 * Returns objects shaped like:
 * { id, threadId, subject, from, date, snippet, body }
 */
export async function fetchEmails(token, maxResults = 500) {
  const q = buildQuery();

  // 1) List message IDs
  const listUrl = new URL(`${GMAIL_BASE}/messages`);
  listUrl.searchParams.set("q", q);
  listUrl.searchParams.set("maxResults", String(maxResults));

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!listRes.ok) {
    const text = await listRes.text().catch(() => "");
    throw new Error(`Gmail list failed (${listRes.status}): ${text || listRes.statusText}`);
  }

  const listJson = await listRes.json();
  const messages = listJson.messages || [];
  if (!messages.length) return [];

  // 2) Fetch each message in "full" format (includes headers + MIME payload).
  // This is simple and reliable. You can optimize later if needed.
  const results = [];
  for (const m of messages) {
    const msgUrl = `${GMAIL_BASE}/messages/${encodeURIComponent(m.id)}?format=full`;
    const msgRes = await fetch(msgUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!msgRes.ok) {
      const text = await msgRes.text().catch(() => "");
      throw new Error(`Gmail get failed (${msgRes.status}): ${text || msgRes.statusText}`);
    }

    const msg = await msgRes.json();
    const hdrs = headersToObject(msg.payload?.headers || []);

    results.push({
      id: msg.id,
      threadId: msg.threadId,
      subject: hdrs.subject || "",
      from: hdrs.from || "",
      date: hdrs.date || "",
      snippet: msg.snippet || "",
      body: extractBody(msg.payload)
    });
  }

  return results;
}

/**
 * archiveEmails(token, emailIds)
 * Archives emails by removing the INBOX label.
 */
export async function archiveEmails(token, emailIds) {
  if (!Array.isArray(emailIds) || emailIds.length === 0) return;
  await gmailBatchModify(token, emailIds, { removeLabelIds: ["INBOX"] });
}

/**
 * trashEmails(token, emailIds)
 * Moves emails to trash by adding TRASH and removing INBOX.
 */
export async function trashEmails(token, emailIds) {
  if (!Array.isArray(emailIds) || emailIds.length === 0) return;
  await gmailBatchModify(token, emailIds, {
    addLabelIds: ["TRASH"],
    removeLabelIds: ["INBOX"]
  });
}

/**
 * Internal helper that calls Gmail's batchModify endpoint.
 * This lets us update many message IDs in one request.
 */
async function gmailBatchModify(token, ids, { addLabelIds = [], removeLabelIds = [] } = {}) {
  const url = `${GMAIL_BASE}/messages/batchModify`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ids, addLabelIds, removeLabelIds })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail batchModify failed (${res.status}): ${text || res.statusText}`);
  }
}

