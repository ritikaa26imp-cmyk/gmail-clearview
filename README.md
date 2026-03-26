# Gmail ClearView

**Stop missing what matters.** Surface OTPs, payments, and junk senders buried in your Gmail inbox — automatically.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Built with Cursor](https://img.shields.io/badge/Built%20with-Cursor%20AI-000000?logoColor=white)](https://cursor.com)

*MIT License · Chrome Extension · Built with Cursor AI*

<!-- SCREENSHOT -->

---

## The problem

Roughly **1.8 billion people** use Gmail, yet the inbox is dominated by noise: newsletters, promos, and low-signal mail that drowns out what actually matters.

For many **urban Indian professionals (roughly 22–28)** the pattern is familiar: **WhatsApp** for everyday chat, **Gmail** only for consequential things — job updates, OTPs, bank alerts, and receipts. The inbox is not a social feed; it’s where high-stakes information is supposed to live.

The painful part is the **exit emotion**: people often leave Gmail **more anxious than when they opened it**, wondering whether something important slipped through — an OTP, a payment confirmation, or a time-sensitive update they never saw.

---

## Features

| Feature | What it does | Accuracy* |
|--------|----------------|-----------|
| 🔑 **OTP detection** | Finds OTP emails using **proximity-based** logic (not keyword-only), shows the code clearly with **one-tap copy** | >99% |
| 💳 **Payment emails** | Surfaces **payment success** and **failure** messages with **amount** and **status** at a glance | >95% |
| 🗑️ **Junk senders** | Flags senders with **10+** matching emails where **70%+** are **unread**; groups by sender with a full list and **per-email open links** | >85% |

\* *Rule-based heuristics on your own mail; figures reflect design goals and testing, not a formal benchmark.*

---

## How it works

1. **Open Gmail (Inbox)** — ClearView runs automatically and scans your mail (up to **5,000** recent inbox messages via **Gmail API pagination**).
2. **Review** — A side **panel** lists flagged OTPs, payments, and junk senders. Expand junk groups to see individual messages.
3. **Act** — **Archive** or **move to trash** selected messages in one flow (using your Google account via OAuth).

---

## Privacy

**Your data stays on your device.**

- **Zero** ClearView servers — **no** backend that sees your mail.
- **No** tracking, **no** analytics SDKs, **no** third-party data sale.
- Mail is read through the **Gmail API** inside your browser; detection logic runs **locally** in the extension.
- **Open source** — you can read the code and verify what runs.

OAuth exists only so the extension can call Gmail **on your behalf**, using the scopes declared in the manifest.

---

## Installation

### Option A — Manual install (current)

1. Clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Turn **Developer mode** on (top right).
4. Click **Load unpacked** and choose this project folder.
5. Open [Gmail](https://mail.google.com) in the **Inbox** view — ClearView starts when the extension loads.

### Option B — Chrome Web Store

**Coming soon** — listing not published yet.

---

## Built with

- **Vanilla JavaScript** (no React/Vue — small, auditable content script)
- **Gmail API** with **OAuth 2.0** (`chrome.identity`)
- **Chrome Extension Manifest V3**
- **Cursor AI** — implementation from spec through shipped extension

### Technical notes (recruiters & reviewers)

- **Pagination:** `messages.list` at **500** messages per request, up to **5,000** IDs, then batched `messages.get` for full payloads.
- **Detectors:** Rule-based (OTP proximity, payment patterns + status phrases, junk by normalized sender + unread ratio). Chosen for predictable behavior over opaque “AI” labels on short snippets.
- **Whitelist:** **100+** domains (banks, government, education, healthcare, etc.) excluded from junk flagging.
- **Caching:** Scan results stored in the browser session so the panel can be restored when you navigate inside Gmail without rescanning every time.
- **Progress UI:** Uses Gmail’s **result size estimate** when available, with **100%** shown when results finish rendering.
- **Panel:** Designed to persist across Gmail’s in-app navigation where possible.

---

## The product story

This extension was built by a **product manager**, not a software engineer. The path from problem framing to a **shipped MV3 extension** used **Cursor AI** as the implementation engine. The PM’s job was to **define the problem**, **design detection rules**, **test edge cases**, and **iterate on UX** — **without** a dedicated engineering team. This repo is meant to reflect **clarity of intent**, **honest tradeoffs**, and **shipping**.

---

## Contributing

1. Fork the repository.
2. Create a **feature branch** (e.g. `feature/your-change`).
3. Open a **pull request** with a **clear description** of what changed and why.
4. **Issues** and **feature requests** are welcome — especially reproducible Gmail edge cases.

---

## License

**MIT License** — free to use, modify, and distribute.

---

*Gmail is a trademark of Google LLC. This project is an independent open-source tool and is not affiliated with or endorsed by Google.*
