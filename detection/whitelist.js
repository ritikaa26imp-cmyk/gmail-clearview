// detection/whitelist.js
// Protected domains that should NEVER be flagged as junk.
//
// Why:
// - Banks, payments, government, healthcare, utilities, and education domains
//   can generate lots of unread emails (alerts) but are important.
// - This list prevents "high volume + unread" rules from incorrectly flagging them.

export const PROTECTED_DOMAINS = new Set([
  "hdfcbank.com",
  "sbi.co.in",
  "icicibank.com",
  "axisbank.com",
  "kotak.com",
  "yesbank.in",
  "pnb.co.in",
  "bankofbaroda.in",
  "canarabank.in",
  "indusind.com",
  "federalbank.co.in",
  "idfcfirstbank.com",
  "rblbank.com",
  "bandhanbank.com",
  "aubank.in",
  "sc.com",
  "hsbc.co.in",
  "citi.com",
  "chase.com",
  "wellsfargo.com",
  "bankofamerica.com",
  "citibank.com",
  "barclays.co.uk",
  "hsbc.com",
  "razorpay.com",
  "payu.in",
  "paytm.com",
  "phonepe.com",
  "googlepay.com",
  "amazonpay.in",
  "stripe.com",
  "paypal.com",
  "billdesk.com",
  "cashfree.com",
  "incometax.gov.in",
  "gst.gov.in",
  "uidai.gov.in",
  "epfindia.gov.in",
  "irctc.co.in",
  "digilocker.gov.in",
  "npci.org.in",
  "sebi.gov.in",
  "rbi.org.in",
  "passport.gov.in",
  "irs.gov",
  "hmrc.gov.uk",
  "gov.uk",
  "apollohospitals.com",
  "fortishealthcare.com",
  "manipalhospitals.com",
  "maxhealthcare.in",
  "narayanahealth.org",
  "medanta.org",
  "aiims.edu",
  "practo.com",
  "1mg.com",
  "pharmeasy.in",
  "netmeds.com",
  "jio.com",
  "airtel.in",
  "vodafoneidea.com",
  "bsnl.co.in",
  "tatapower.com",
  "licindia.in",
  "hdfclife.com",
  "iciciprulife.com",
  "starhealth.in",
  "policybazaar.com",
  "nseindia.com",
  "bseindia.com",
  "zerodha.com",
  "groww.in",
  "angelone.in",
  "amfiindia.com",
  "du.ac.in",
  "mu.ac.in",
  "bits-pilani.ac.in",
  "amity.edu",
  "manipal.edu"
]);

function extractDomain(senderEmail) {
  const from = String(senderEmail || "").trim();
  if (!from) return "";

  // Accept either "Name <user@domain.com>" or "user@domain.com".
  const match = from.match(/<([^>]+)>/);
  const email = (match ? match[1] : from).trim().toLowerCase();
  const domain = email.includes("@") ? email.split("@").pop() : "";
  return domain || "";
}

/**
 * isProtectedDomain(senderEmail)
 * - Extracts domain from an email address
 * - Returns true if it's in PROTECTED_DOMAINS
 * - Also returns true for wildcard endings:
 *   - .edu, .ac.in, .edu.in, .gov.in
 */
export function isProtectedDomain(senderEmail) {
  const domain = extractDomain(senderEmail);
  if (!domain) return false;

  if (PROTECTED_DOMAINS.has(domain)) return true;

  // Wildcard patterns
  if (domain.endsWith(".edu")) return true;
  if (domain.endsWith(".ac.in")) return true;
  if (domain.endsWith(".edu.in")) return true;
  if (domain.endsWith(".gov.in")) return true;

  return false;
}

