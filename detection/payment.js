// detection/payment.js
// Payment detection rules used by Gmail ClearView.
//
// Goal:
// - Detect transaction confirmations (success/failure), not promotions.
// - Extract currency + amount when present.

// Explicit exclusion: if an email looks promotional, we skip it even if it contains money.
const PROMO_EXCLUDE_RE = /\b(pay now|buy now|offer|sale|discount)\b/i;

// Currency + amount signal:
// - One of (₹, $, €, £)
// - Followed by a numeric value (commas allowed, decimals optional)
//
// Examples matched:
// - ₹1,650
// - $29.99
// - €1000
const CURRENCY_AMOUNT_RE = /([₹$€£])\s*([0-9][0-9,]*(?:\.[0-9]+)?)/;

// Status signal
const SUCCESS_RE =
  /\b(paid successfully|payment successful|payment received|transaction successful|order confirmed)\b/i;
const FAILURE_RE = /\b(payment failed|payment declined|transaction failed|unsuccessful transaction)\b/i;

// "Order confirmed" often appears as "order ... confirmed" (e.g. "Your order has been confirmed").
// This preserves the intent of the "order confirmed" keyword while handling common phrasing.
const ORDER_CONFIRMED_FUZZY_RE = /\border\b[\s\S]{0,40}\bconfirmed\b/i;

function parseAmount(rawAmount) {
  // Convert "1,650" -> 1650, "29.99" -> 29.99
  const cleaned = String(rawAmount || "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * detectPayments(emails)
 *
 * Input:
 * - emails: Array<{id, subject, body, sender, date, isUnread}>
 *
 * Output:
 * - Array<{id, sender, subject, date, amount, currency, status, category:"Payment"}>
 *   where status is "success" or "failure"
 *
 * Detection rules (both required):
 * 1) Currency + amount signal in subject OR body
 * 2) Status signal: success keywords OR failure keywords
 *
 * Exclusion:
 * - If subject OR body contains promo terms like "pay now", "offer", etc., do NOT flag.
 */
export function detectPayments(emails) {
  if (!Array.isArray(emails)) return [];

  const detections = [];

  for (const email of emails) {
    const id = email?.id;
    const subject = String(email?.subject || "");
    const body = String(email?.body || "");
    const sender = String(email?.sender || "");
    const date = email?.date ?? "";

    if (!id) continue;

    const combined = `${subject}\n${body}`;

    // Promo exclusion (explicit).
    if (PROMO_EXCLUDE_RE.test(combined)) continue;

    // Rule (1): currency + amount must exist in subject OR body.
    const moneyMatch = combined.match(CURRENCY_AMOUNT_RE);
    if (!moneyMatch) continue;

    const currency = moneyMatch[1];
    const amount = parseAmount(moneyMatch[2]);
    if (amount === null) continue;

    // Rule (2): status keywords must exist.
    let status = null;
    if (SUCCESS_RE.test(combined) || ORDER_CONFIRMED_FUZZY_RE.test(combined)) status = "success";
    else if (FAILURE_RE.test(combined)) status = "failure";
    else continue;

    detections.push({
      id,
      sender,
      subject,
      date,
      amount,
      currency,
      status,
      category: "Payment"
    });
  }

  return detections;
}

/**
 * runPaymentTests()
 * Small local sanity tests (logs PASS/FAIL per case).
 */
export function runPaymentTests() {
  const cases = [
    {
      name: '1) "Paid Successfully" + "₹1,650 has been debited" → success, 1650',
      emails: [
        {
          id: "p1",
          sender: "bank@example.com",
          subject: "Paid Successfully",
          body: "₹1,650 has been debited",
          date: "2026-03-19",
          isUnread: true
        }
      ],
      expectDetected: true,
      expectStatus: "success",
      expectCurrency: "₹",
      expectAmount: 1650
    },
    {
      name: '2) "Payment Failed" + "₹500 could not be processed" → failure',
      emails: [
        {
          id: "p2",
          sender: "bank@example.com",
          subject: "Payment Failed",
          body: "₹500 could not be processed",
          date: "2026-03-19",
          isUnread: true
        }
      ],
      expectDetected: true,
      expectStatus: "failure"
    },
    {
      name: '3) "50% off — pay now!" → NOT detected',
      emails: [
        {
          id: "p3",
          sender: "promo@example.com",
          subject: "50% off — pay now!",
          body: "Save big today.",
          date: "2026-03-19",
          isUnread: false
        }
      ],
      expectDetected: false
    },
    {
      name: '4) "Your order of $29.99 has been confirmed" → success',
      emails: [
        {
          id: "p4",
          sender: "store@example.com",
          subject: "Order update",
          body: "Your order of $29.99 has been confirmed",
          date: "2026-03-19",
          isUnread: false
        }
      ],
      expectDetected: true,
      expectStatus: "success",
      expectCurrency: "$",
      expectAmount: 29.99
    }
  ];

  for (const t of cases) {
    const got = detectPayments(t.emails);
    const detected = got.length > 0;
    const r = got[0];

    const pass =
      detected === t.expectDetected &&
      (t.expectDetected ? r.status === t.expectStatus : true) &&
      (t.expectDetected && typeof t.expectCurrency === "string" ? r.currency === t.expectCurrency : true) &&
      (t.expectDetected && typeof t.expectAmount === "number" ? r.amount === t.expectAmount : true);

    console.log(`${pass ? "PASS" : "FAIL"} - ${t.name}`, {
      detected,
      result: got
    });
  }
}

