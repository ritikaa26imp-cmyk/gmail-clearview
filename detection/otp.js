// detection/otp.js
// Proximity-based OTP detection to reduce false positives from newsletters.

const OTP_KEYWORDS = [
  "otp",
  "one-time",
  "one time",
  "verification code",
  "passcode",
  "secret code",
  // Kept to satisfy test case #5: "Enter code 992341 to verify your account"
  "code"
];

const AUTH_KEYWORDS = [
  "login",
  "log in",
  "sign in",
  "signin",
  "verify your",
  "verification",
  "authenticate",
  "confirm your identity",
  "access your account",
  // Kept so "verify account" and "to verify your account" are detected.
  "verify"
];

const EXCLUDE_PATTERNS = [
  "unsubscribe",
  "newsletter",
  "product update",
  "weekly update",
  "monthly update",
  "digest",
  "webinar",
  "hackathon",
  "you are invited",
  "join us",
  "register now",
  "% off",
  "discount",
  "promo",
  "this week",
  "this month"
];

function findOtpCodeByProximity(text) {
  const numberMatches = [...text.matchAll(/\b\d{4,8}\b/g)];
  const keywordPositions = [];
  for (const keyword of OTP_KEYWORDS) {
    let idx = text.indexOf(keyword);
    while (idx !== -1) {
      keywordPositions.push(idx);
      idx = text.indexOf(keyword, idx + 1);
    }
  }
  if (!keywordPositions.length) return null;

  let best = null;
  for (const match of numberMatches) {
    const numPos = match.index ?? 0;
    let minDist = Infinity;
    for (const kp of keywordPositions) {
      const dist = Math.abs(numPos - kp);
      if (dist < minDist) minDist = dist;
    }
    if (minDist <= 60 && (!best || minDist < best.dist)) {
      best = { code: match[0], dist: minDist };
    }
  }

  return best ? best.code : null;
}

export function detectOTPs(emails) {
  if (!Array.isArray(emails)) return [];

  return emails
    .filter((email) => {
      const text = `${email.subject || ""} ${email.body || ""}`.toLowerCase();

      // Step 1: Hard exclude marketing/newsletter emails
      const isMarketing = EXCLUDE_PATTERNS.some((p) => text.includes(p));
      if (isMarketing) return false;

      // Step 2 + 3: find number + OTP keyword proximity
      const detectedCode = findOtpCodeByProximity(text);
      if (!detectedCode) return false;

      // Step 4: Auth keyword must exist anywhere in the email
      const hasAuthKeyword = AUTH_KEYWORDS.some((k) => text.includes(k));
      if (!hasAuthKeyword) return false;

      return true;
    })
    .map((email) => {
      const text = `${email.subject || ""} ${email.body || ""}`.toLowerCase();
      const detectedCode = findOtpCodeByProximity(text);

      return {
        id: email.id,
        sender: email.sender,
        subject: email.subject,
        date: email.date,
        otpCode: detectedCode,
        category: "OTP"
      };
    });
}

/**
 * runOTPTests()
 * Quick local sanity tests you can run in the console (or import and call).
 * Logs PASS/FAIL for each case.
 */
export function runOTPTests() {
  const cases = [
    {
      name: '1) "Use OTP 458537 to login, valid 10 mins" → detect 458537',
      emails: [
        {
          id: "t1",
          sender: "test@example.com",
          subject: "Security alert",
          body: "Use OTP 458537 to login, valid 10 mins",
          date: "2026-03-19",
          isUnread: true
        }
      ],
      expectDetected: true,
      expectCode: "458537"
    },
    {
      name: '2) "Invoice #458537 attached" → NOT detect',
      emails: [
        {
          id: "t2",
          sender: "billing@example.com",
          subject: "Invoice available",
          body: "Invoice #458537 attached",
          date: "2026-03-19",
          isUnread: true
        }
      ],
      expectDetected: false
    },
    {
      name: '3) "Your OTP is 1234. Do not share." → detect 1234',
      emails: [
        {
          id: "t3",
          sender: "no-reply@example.com",
          subject: "Verification code",
          body: "Your OTP is 1234. Do not share.",
          date: "2026-03-19",
          isUnread: false
        }
      ],
      expectDetected: true,
      expectCode: "1234"
    },
    {
      name: '4) "Order confirmation #889921" → NOT detect',
      emails: [
        {
          id: "t4",
          sender: "store@example.com",
          subject: "Order confirmation",
          body: "Order confirmation #889921",
          date: "2026-03-19",
          isUnread: false
        }
      ],
      expectDetected: false
    },
    {
      name: '5) "Enter code 992341 to verify your account" → detect 992341',
      emails: [
        {
          id: "t5",
          sender: "auth@example.com",
          subject: "Please verify",
          body: "Enter code 992341 to verify your account",
          date: "2026-03-19",
          isUnread: true
        }
      ],
      expectDetected: true,
      expectCode: "992341"
    },
    {
      name: '6) "The OTP is 4567, use it to log in" → detect 4567',
      emails: [
        {
          id: "t6",
          sender: "auth2@example.com",
          subject: "Security check",
          body: "The OTP is 4567, use it to log in",
          date: "2026-03-19",
          isUnread: true
        }
      ],
      expectDetected: true,
      expectCode: "4567"
    },
    {
      name: '7) "Sent on 16/03/2025, the OTP is 2023, verify account" → detect 2023',
      emails: [
        {
          id: "t7",
          sender: "auth3@example.com",
          subject: "Access code",
          body: "Sent on 16/03/2025, the OTP is 2023, verify account",
          date: "2026-03-19",
          isUnread: true
        }
      ],
      expectDetected: true,
      expectCode: "2023"
    },
    {
      name: '8) "Replit Product Updates ... unsubscribe" → NOT detect',
      emails: [
        {
          id: "t8",
          sender: "updates@replit.com",
          subject: "Replit Product Updates - verify your preferences this month",
          body: "unsubscribe here",
          date: "2026-03-19",
          isUnread: true
        }
      ],
      expectDetected: false
    }
  ];

  for (const t of cases) {
    const got = detectOTPs(t.emails);
    const detected = got.length > 0;
    const code = got[0]?.otpCode;

    const pass =
      detected === t.expectDetected && (t.expectDetected ? code === t.expectCode : true);

    console.log(`${pass ? "PASS" : "FAIL"} - ${t.name}`, {
      detected,
      otpCode: code,
      result: got
    });
  }
}

