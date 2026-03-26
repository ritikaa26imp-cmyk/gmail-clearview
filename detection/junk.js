// detection/junk.js
// Junk sender detection used by Gmail ClearView.
//
// This module does NOT try to classify individual emails as junk.
// Instead, it looks for "worst offender" senders:
// - many emails over a long window
// - overwhelming majority unread
// and flags those senders for review.

import { isProtectedDomain } from "./whitelist.js";

function parseEmailAddress(sender) {
  // Accept either "Name <user@domain.com>" or "user@domain.com".
  const raw = String(sender || "").trim();
  if (!raw) return "";
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

function extractDisplayName(fromHeader) {
  if (!fromHeader) return "";
  const match = String(fromHeader).match(/^([^<]+)</);
  if (match) return match[1].replace(/"/g, "").trim();
  return String(fromHeader).trim();
}

function extractDomainFromEmailAddress(emailAddress) {
  if (!emailAddress || !emailAddress.includes("@")) return "";
  return emailAddress.split("@").pop() || "";
}

function toSortableTime(dateValue) {
  // Supports:
  // - Date objects
  // - ISO strings
  // - RFC 2822 strings
  // If parsing fails, treat as 0 (oldest).
  const t =
    dateValue instanceof Date
      ? dateValue.getTime()
      : typeof dateValue === "number"
        ? dateValue
        : Date.parse(String(dateValue || ""));
  return Number.isFinite(t) ? t : 0;
}

/**
 * detectJunkSenders(emails)
 *
 * Input:
 * - emails: Array<{id, subject, body, sender, senderName?, date, isUnread}>
 *   (sender should be the normalized email; senderName is optional raw From header)
 *
 * Output:
 * - Array of sender groups shaped like:
 *   {
 *     sender,
 *     displayName,
 *     domain,
 *     totalCount,
 *     unreadCount,
 *     unreadPercentage,
 *     emails: [{id, subject, date, isUnread}],
 *     category: "Junk"
 *   }
 *
 * Flag ONLY if all conditions pass:
 * 1) sender domain is NOT protected
 * 2) sender has sent >= 10 emails (within the scanned window, e.g. last 2 years)
 * 3) unread ratio >= 0.70
 */
export function detectJunkSenders(emails) {
  if (!Array.isArray(emails)) return [];

  // Group by clean sender email (sender field).
  const bySender = new Map();

  for (const e of emails) {
    const senderAddress = parseEmailAddress(e?.sender);
    if (!senderAddress) continue;

    const subject = String(e?.subject || "");
    const date = e?.date ?? "";
    const isUnread = Boolean(e?.isUnread);
    const id = e?.id;

    if (!bySender.has(senderAddress)) {
      const rawFrom = e?.senderName || e?.sender || "";
      bySender.set(senderAddress, {
        sender: senderAddress,
        displayName: extractDisplayName(rawFrom),
        domain: extractDomainFromEmailAddress(senderAddress),
        totalCount: 0,
        unreadCount: 0,
        emails: []
      });
    }

    const group = bySender.get(senderAddress);
    group.totalCount += 1;
    if (isUnread) group.unreadCount += 1;

    group.emails.push({ id, subject, date, isUnread });
  }

  const senderGroups = {};
  emails.forEach((email) => {
    const key = email.sender; // now the clean email address
    if (!senderGroups[key]) senderGroups[key] = [];
    senderGroups[key].push(email);
  });

  Object.entries(senderGroups)
    .filter(([_, grouped]) => grouped.length >= 5)
    .forEach(([sender, grouped]) => {
      console.log(`ClearView sender: ${sender} — ${grouped.length} emails, 
      ${grouped.filter((e) => e.isUnread).length} unread`);
    });

  const flagged = [];

  for (const group of bySender.values()) {
    const { sender, domain, totalCount, unreadCount } = group;
    const unreadPercentage = totalCount > 0 ? unreadCount / totalCount : 0;

    // Condition (1): must NOT be protected.
    if (isProtectedDomain(sender)) continue;

    // Condition (2): volume threshold
    if (totalCount < 10) continue;

    // Condition (3): unread ratio threshold (70%+)
    if (unreadPercentage < 0.7) continue;

    // Sort emails newest first by date.
    group.emails.sort((a, b) => toSortableTime(b.date) - toSortableTime(a.date));

    flagged.push({
      sender,
      displayName: group.displayName,
      domain,
      totalCount,
      unreadCount,
      unreadPercentage,
      emails: group.emails,
      category: "Junk"
    });
  }

  // Worst offenders first.
  flagged.sort((a, b) => b.totalCount - a.totalCount);
  return flagged;
}

/**
 * runJunkTests()
 * Logs PASS/FAIL for the junk detection scenarios.
 */
export function runJunkTests() {
  function makeEmails({ sender, count, unreadCount }) {
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        id: `${sender}-${i + 1}`,
        sender,
        subject: `Subject ${i + 1}`,
        body: "Body",
        date: new Date(2026, 2, 1 + i).toISOString(), // increasing dates
        isUnread: i < unreadCount
      });
    }
    return out;
  }

  const tests = [
    {
      name: 'Test 1: "promo@somestore.com" with 23 emails all unread → FLAGGED',
      emails: makeEmails({ sender: "promo@somestore.com", count: 23, unreadCount: 23 }),
      expectFlagged: true
    },
    {
      name: 'Test 2: "alerts@hdfcbank.com" with 62 emails all unread → NOT flagged (protected domain)',
      emails: makeEmails({ sender: "alerts@hdfcbank.com", count: 62, unreadCount: 62 }),
      expectFlagged: false
    },
    {
      name: 'Test 3: "news@blog.com" with 9 emails all unread → NOT flagged (below 10 threshold)',
      emails: makeEmails({ sender: "news@blog.com", count: 9, unreadCount: 9 }),
      expectFlagged: false
    },
    {
      name: 'Test 4: "updates@app.com" with 15 emails, only 10 unread (66%) → NOT flagged (below 70%)',
      emails: makeEmails({ sender: "updates@app.com", count: 15, unreadCount: 10 }),
      expectFlagged: false
    },
    {
      name: 'Test 5: "updates@app.com" with 15 emails, 11 unread (73%) → FLAGGED (meets 70%)',
      emails: makeEmails({ sender: "updates2@app.com", count: 15, unreadCount: 11 }),
      expectFlagged: true
    }
  ];

  for (const t of tests) {
    const result = detectJunkSenders(t.emails);
    const flagged = result.some((r) => r.sender === parseEmailAddress(t.emails[0]?.sender));
    const pass = flagged === t.expectFlagged;
    console.log(`${pass ? "PASS" : "FAIL"} - ${t.name}`, { flagged, result });
  }
}

