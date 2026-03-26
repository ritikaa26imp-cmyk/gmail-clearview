// content.js
// This script is injected into Gmail pages (https://mail.google.com/*).
//
// For this first cut, it only proves authentication works by requesting an
// OAuth token from the background service worker and logging success/failure.
//
// This is also where we inject the ClearView slide-in drawer into Gmail's DOM.
//
// Important note:
// - We DO NOT fetch local extension HTML/CSS files here.
// - Instead, we inline the panel HTML/CSS as strings and inject them directly.

const MSG_GET_TOKEN = "CLEARVIEW_GET_TOKEN";

const CV_SESSION_RESULTS_KEY = "cv-clearview-results";
const CV_SESSION_PANEL_OPEN_KEY = "cv-panel-open";

async function getCachedResults() {
  try {
    const raw = sessionStorage.getItem(CV_SESSION_RESULTS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (!Array.isArray(data.otps)) return null;
    if (!Array.isArray(data.payments)) return null;
    if (!Array.isArray(data.junkSenders)) return null;
    return data;
  } catch {
    return null;
  }
}

function setCachedResults(data) {
  try {
    sessionStorage.setItem(CV_SESSION_RESULTS_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("ClearView: Could not cache results", e);
  }
}

function setPanelOpenSession(open) {
  if (open) sessionStorage.setItem(CV_SESSION_PANEL_OPEN_KEY, "1");
  else sessionStorage.removeItem(CV_SESSION_PANEL_OPEN_KEY);
}

// ----------------------------
// Drawer UI injection (NO fetch)
// ----------------------------

function injectStyles() {
  if (document.getElementById("clearview-style")) return;
  console.log("ClearView: Injecting styles");

  const style = document.createElement("style");
  style.id = "clearview-style";
  style.textContent = `
    #clearview-panel {
      position: fixed;
      right: 0;
      top: 0;
      width: 400px;
      height: 100vh;
      background: white;
      box-shadow: -4px 0 24px rgba(0,0,0,0.12);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      font-family: Google Sans, -apple-system, system-ui, sans-serif;
      transform: translateX(100%);
      transition: transform 0.3s ease;
    }
    #clearview-panel.open {
      transform: translateX(0);
    }
    .cv-header {
      padding: 16px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid #e0e0e0;
      gap: 8px;
    }
    .cv-logo {
      font-weight: 600;
      font-size: 16px;
      color: #1a73e8;
    }
    .cv-badge {
      background: #e8f0fe;
      color: #1a73e8;
      border-radius: 12px;
      padding: 2px 10px;
      font-size: 12px;
      margin-left: auto;
      white-space: nowrap;
    }
    .cv-close {
      margin-left: 8px;
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: #666;
      padding: 4px 8px;
    }
    .cv-section {
      border-bottom: 1px solid #f0f0f0;
    }
    .cv-section-header {
      padding: 12px 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      color: #333;
      user-select: none;
    }
    .cv-section-header:hover {
      background: #f8f9fa;
    }
    .cv-chevron {
      margin-left: 4px;
      color: #5f6368;
    }
    .cv-count-pill {
      background: #f1f3f4;
      border-radius: 10px;
      padding: 1px 8px;
      font-size: 12px;
      margin-left: auto;
      white-space: nowrap;
    }
    .cv-section-body {
      padding: 0 8px;
      max-height: 300px;
      overflow-y: auto;
    }
    .cv-email-row {
      display: flex;
      align-items: center;
      padding: 8px;
      border-radius: 8px;
      gap: 8px;
      font-size: 13px;
    }
    .cv-email-row:hover {
      background: #f8f9fa;
    }
    .cv-category-pill {
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
    }
    .pill-otp { background: #e8f0fe; color: #1a73e8; }
    .pill-payment-success { background: #e6f4ea; color: #137333; }
    .pill-payment-failure { background: #fce8e6; color: #c5221f; }
    .pill-junk { background: #fef3e2; color: #b06000; }
    .cv-email-subject {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #333;
    }
    .cv-open-link {
      color: #1a73e8;
      text-decoration: none;
      font-size: 16px;
      flex-shrink: 0;
      padding: 0 4px;
    }
    .cv-open-link:hover { text-decoration: underline; }
    .cv-otp-code {
      font-size: 18px;
      font-weight: 700;
      color: #1a73e8;
      letter-spacing: 2px;
      padding: 2px 8px;
      background: #e8f0fe;
      border-radius: 6px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .cv-footer {
      padding: 16px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: auto;
      background: white;
    }
    .cv-btn-archive {
      flex: 1;
      padding: 8px;
      border: 1px solid #1a73e8;
      color: #1a73e8;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .cv-btn-delete {
      flex: 1;
      padding: 8px;
      background: #d93025;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .cv-btn-archive:hover { background: #e8f0fe; }
    .cv-btn-delete:hover { background: #b52a20; }
    .cv-junk-sender-header {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 8px;
      border-radius: 8px;
      font-size: 13px;
    }
    .cv-junk-sender-header:hover { background: #f8f9fa; }
    .cv-junk-emails { display: none; padding-left: 16px; }
    .cv-junk-emails.expanded { display: block; }
    .cv-not-noise {
      font-size: 11px;
      color: #666;
      background: none;
      border: none;
      cursor: pointer;
      text-decoration: underline;
      padding: 0;
      flex-shrink: 0;
    }
    #clearview-empty {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 999999;
      background: white;
      border: 1px solid #e0e0e0;
      box-shadow: 0 8px 20px rgba(0,0,0,0.12);
      border-radius: 12px;
      padding: 10px 12px;
      font-family: Google Sans, -apple-system, system-ui, sans-serif;
      color: #137333;
      font-size: 13px;
    }
  `;
  document.head.appendChild(style);
}

function injectPanel() {
  if (document.getElementById("clearview-panel")) return;
  const orphanRoot = document.getElementById("clearview-root");
  if (orphanRoot) orphanRoot.remove();
  console.log("ClearView: Injecting panel HTML");

  const root = document.createElement("div");
  root.id = "clearview-root";
  root.innerHTML = `
    <div id="clearview-panel">
      <div class="cv-header">
        <div class="cv-logo">🛡️ ClearView</div>
        <div class="cv-badge" id="cv-total-count">0 emails flagged</div>
        <button class="cv-close" id="cv-close-btn">✕</button>
      </div>

      <div class="cv-section" id="cv-otp-section">
        <div class="cv-section-header" data-cv-toggle="cv-otp-list" data-cv-chevron="cv-otp-chevron">
          <span>🔑 OTP Emails</span>
          <span class="cv-count-pill" id="cv-otp-count">0</span>
          <span class="cv-chevron" id="cv-otp-chevron">▾</span>
        </div>
        <div class="cv-section-body" id="cv-otp-list"></div>
      </div>

      <div class="cv-section" id="cv-payment-section">
        <div class="cv-section-header" data-cv-toggle="cv-payment-list" data-cv-chevron="cv-payment-chevron">
          <span>💳 Payment Emails</span>
          <span class="cv-count-pill" id="cv-payment-count">0</span>
          <span class="cv-chevron" id="cv-payment-chevron">▾</span>
        </div>
        <div class="cv-section-body" id="cv-payment-list"></div>
      </div>

      <div class="cv-section" id="cv-junk-section">
        <div class="cv-section-header" data-cv-toggle="cv-junk-list" data-cv-chevron="cv-junk-chevron">
          <span>🗑️ Junk Senders</span>
          <span class="cv-count-pill" id="cv-junk-count">0</span>
          <span class="cv-chevron" id="cv-junk-chevron">▾</span>
        </div>
        <div class="cv-section-body" id="cv-junk-list"></div>
      </div>

      <div class="cv-footer">
        <label class="cv-select-all" style="font-size:13px;display:flex;align-items:center;gap:4px">
          <input type="checkbox" id="cv-select-all"> Select all
        </label>
        <button class="cv-btn-archive" id="cv-archive-btn">Archive All</button>
        <button class="cv-btn-delete" id="cv-delete-btn">Delete All</button>
      </div>
    </div>

    <div id="clearview-empty" style="display:none">
      <span>✓ Your inbox looks clear</span>
    </div>
  `;

  document.body.appendChild(root);

  const closeBtn = document.getElementById("cv-close-btn");
  if (closeBtn && closeBtn.dataset.wired !== "1") {
    closeBtn.dataset.wired = "1";
    closeBtn.addEventListener("click", () => {
      const panel = document.getElementById("clearview-panel");
      if (panel) panel.classList.remove("open");
      setPanelOpenSession(false);
    });
  }

  if (sessionStorage.getItem(CV_SESSION_PANEL_OPEN_KEY) === "1") {
    document.getElementById("clearview-panel")?.classList.add("open");
  }
}

function showScanningState() {
  const panel = document.getElementById("clearview-panel");
  if (panel) panel.classList.add("open");
  setPanelOpenSession(true);

  const existing = document.getElementById("cv-scanning-state");
  if (existing) existing.remove();

  const footer = document.querySelector("#clearview-panel .cv-footer");
  if (!footer) return;

  const scanningHtml = `
    <div id="cv-scanning-state" style="
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 24px;
      gap: 20px;
      min-height: 0;
    ">
      <div style="font-size: 32px">🛡️</div>

      <div style="text-align:center">
        <div style="font-size:15px;font-weight:500;color:#1a73e8;
                    margin-bottom:6px">
          Scanning your inbox...
        </div>
        <div id="cv-scan-status" style="font-size:13px;color:#666">
          Starting up...
        </div>
      </div>

      <div style="width:100%;background:#f1f3f4;
                  border-radius:99px;height:8px;overflow:hidden">
        <div id="cv-progress-bar" style="
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #1a73e8, #4285f4);
          border-radius: 99px;
          transition: width 0.4s ease;
        "></div>
      </div>

      <div id="cv-progress-label" style="
        font-size: 12px;
        color: #999;
        font-variant-numeric: tabular-nums;
      ">0% complete</div>

      <div style="font-size:12px;color:#bbb;text-align:center;
                  max-width:280px;line-height:1.5">
        All scanning happens locally on your device.
        Your emails never leave your browser.
      </div>
    </div>
  `;

  footer.insertAdjacentHTML("beforebegin", scanningHtml);

  ["cv-otp-section", "cv-payment-section", "cv-junk-section"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

function updateProgressTotal(total) {
  const status = document.getElementById("cv-scan-status");
  const label = document.getElementById("cv-progress-label");
  if (status) {
    status.textContent = `Fetching emails... (0 of ${total})`;
  }
  if (label) {
    label.textContent = "0% complete";
  }
  window._cvRealTotal = total;
}

function updateProgress(scanned, fallbackTotal) {
  const total = window._cvRealTotal || fallbackTotal;
  if (!total || total <= 0) return;
  const percent = Math.min(Math.round((scanned / total) * 100), 99);

  const bar = document.getElementById("cv-progress-bar");
  const label = document.getElementById("cv-progress-label");
  const status = document.getElementById("cv-scan-status");

  if (bar) bar.style.width = percent + "%";
  if (label) label.textContent = percent + "% complete";

  if (status) {
    if (percent < 20) {
      status.textContent = `Fetching emails... (${scanned} of ${total})`;
    } else if (percent < 50) {
      status.textContent = `Scanning for OTPs and payments... (${scanned} of ${total})`;
    } else if (percent < 80) {
      status.textContent = `Identifying junk senders... (${scanned} of ${total})`;
    } else {
      status.textContent = `Almost done... (${scanned} of ${total})`;
    }
  }
}

function showResults(data) {
  const bar = document.getElementById("cv-progress-bar");
  const label = document.getElementById("cv-progress-label");
  if (bar) bar.style.width = "100%";
  if (label) label.textContent = "100% complete";

  const scanningState = document.getElementById("cv-scanning-state");
  if (scanningState) scanningState.remove();

  ["cv-otp-section", "cv-payment-section", "cv-junk-section"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "";
  });

  const total =
    data.otps.length + data.payments.length + data.junkSenders.length;

  if (total === 0) {
    removeBannerIfPresent();
    const panel = document.getElementById("clearview-panel");
    if (panel) panel.classList.remove("open");
    try {
      sessionStorage.removeItem(CV_SESSION_RESULTS_KEY);
    } catch {
      /* ignore */
    }
    setPanelOpenSession(false);
    return;
  }

  setCachedResults(data);
  setPanelOpenSession(true);

  renderPanel(data);

  const parts = [];
  if (data.junkSenders.length > 0) {
    parts.push(
      `${data.junkSenders.length} junk sender${data.junkSenders.length > 1 ? "s" : ""}`
    );
  }
  if (data.otps.length > 0) {
    parts.push(`${data.otps.length} OTP${data.otps.length > 1 ? "s" : ""}`);
  }
  if (data.payments.length > 0) {
    parts.push(`${data.payments.length} payment${data.payments.length > 1 ? "s" : ""}`);
  }

  injectBanner(`🛡️ ClearView found: ${parts.join(" · ")}`);
}

function injectBanner(messageText) {
  // Remove existing banner if any
  const existing = document.getElementById("cv-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "cv-banner";
  banner.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    height: 48px !important;
    background: #1a73e8 !important;
    color: white !important;
    display: flex !important;
    align-items: center !important;
    padding: 0 16px !important;
    font-family: Google Sans, system-ui, sans-serif !important;
    font-size: 14px !important;
    z-index: 9999999 !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
  `;
  banner.innerHTML = `
    <span id="cv-banner-text">${messageText}</span>
    <button id="cv-review-btn" style="
      margin-left: auto;
      background: white;
      color: #1a73e8;
      border: none;
      border-radius: 4px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    ">Review Now</button>
    <button id="cv-dismiss-btn" style="
      margin-left: 8px;
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      cursor: pointer;
      font-size: 13px;
      padding: 6px 12px;
      border-radius: 4px;
    ">Dismiss</button>
  `;
  document.body.appendChild(banner);

  // Push Gmail content down so banner doesn't cover it
  document.body.style.paddingTop = "48px";

  // Wire up buttons
  document.getElementById("cv-review-btn").addEventListener("click", () => {
    console.log("ClearView: Review Now clicked");
    const panel = document.getElementById("clearview-panel");
    console.log("ClearView: Panel element found?", !!panel);
    if (panel) {
      panel.classList.add("open");
      console.log("ClearView: Panel opened, classes:", panel.className);
    } else {
      console.error("ClearView: Panel element not found in DOM!");
    }
  });

  document.getElementById("cv-dismiss-btn").addEventListener("click", () => {
    banner.remove();
    document.body.style.paddingTop = "";
  });

  console.log("ClearView: Banner injected, should be visible now");
}

function syncSelectAllFromPanel() {
  const selectAllEl = document.getElementById("cv-select-all");
  if (!selectAllEl) return;
  const boxes = document.querySelectorAll(
    '#clearview-panel input[type="checkbox"]:not(#cv-select-all)'
  );
  selectAllEl.checked =
    boxes.length > 0 && Array.from(boxes).every((x) => x.checked);
}

/** Keeps junk sender row checkbox in sync with its per-email checkboxes (incl. indeterminate). */
function syncJunkParentCheckboxForGroup(index) {
  const body = document.getElementById("junk-body-" + index);
  const header = document.querySelector(
    `#cv-junk-list .cv-junk-header[data-index="${index}"]`
  );
  const parentCb = header?.querySelector(".cv-junk-checkbox");
  if (!body || !parentCb) return;
  const children = body.querySelectorAll('input[type="checkbox"][data-id]');
  const n = children.length;
  if (n === 0) return;
  let checked = 0;
  for (const c of children) {
    if (c.checked) checked += 1;
  }
  parentCb.indeterminate = checked > 0 && checked < n;
  parentCb.checked = checked === n;
}

function renderPanel(data) {
  const { otps, payments, junkSenders } = data;
  const total =
    otps.length + payments.length + junkSenders.reduce((sum, s) => sum + s.emails.length, 0);

  document.getElementById("cv-total-count").textContent = total + " emails flagged";
  document.getElementById("cv-otp-count").textContent = otps.length;
  document.getElementById("cv-payment-count").textContent = payments.length;
  document.getElementById("cv-junk-count").textContent = junkSenders.reduce(
    (sum, s) => sum + s.emails.length,
    0
  );

  // Render OTPs
  const otpList = document.getElementById("cv-otp-list");
  otpList.innerHTML = otps
    .map(
      (otp) => `
    <div class="cv-email-row">
      <input type="checkbox" checked data-id="${otp.id}">
      <span class="cv-category-pill pill-otp">OTP</span>
      <span class="cv-email-subject">${otp.sender}</span>
      <span class="cv-otp-code" onclick="navigator.clipboard.writeText('${otp.otpCode}')" title="Click to copy">
        ${otp.otpCode}
      </span>
      <a href="https://mail.google.com/mail/u/0/#inbox/${otp.id}"
         target="_blank"
         style="color:#1a73e8;text-decoration:none;font-size:16px;flex-shrink:0"
         title="Open email">↗</a>
    </div>
  `
    )
    .join("");

  // Render Payments
  const paymentList = document.getElementById("cv-payment-list");
  paymentList.innerHTML = payments
    .map(
      (p) => `
    <div class="cv-email-row">
      <input type="checkbox" checked data-id="${p.id}">
      <span class="cv-category-pill ${
        p.status === "success" ? "pill-payment-success" : "pill-payment-failure"
      }">
        ${p.status === "success" ? "✅" : "❌"} ${p.currency}${p.amount}
      </span>
      <span class="cv-email-subject">${p.subject}</span>
      <a href="https://mail.google.com/mail/u/0/#inbox/${p.id}"
         target="_blank"
         style="color:#1a73e8;text-decoration:none;font-size:16px;flex-shrink:0"
         title="Open email">↗</a>
    </div>
  `
    )
    .join("");

  // Step 1: Render junk sender HTML (no onclick — CSP-safe)
  const junkHtml = junkSenders
    .map(
      (sender, i) => `
  <div style="border-bottom:1px solid #f5f5f5">
    <div
      class="cv-junk-header"
      data-index="${i}"
      style="display:flex;align-items:center;gap:8px;
             padding:10px 8px;cursor:pointer;border-radius:8px;
             font-size:13px;">
      <input
        type="checkbox"
        checked
        data-sender="${sender.sender}"
        class="cv-junk-checkbox"
        style="flex-shrink:0">
      <span style="background:#fef3e2;color:#b06000;border-radius:10px;
                   padding:2px 8px;font-size:11px;font-weight:500;
                   flex-shrink:0">Junk</span>
      <span style="flex:1;overflow:hidden;min-width:0;color:#333">
        <span style="font-weight:500">${sender.displayName || sender.sender}</span>
        <span style="font-size:11px;color:#999;display:block">
          ${sender.sender}
        </span>
      </span>
      <span style="font-size:11px;color:#999;flex-shrink:0;margin-right:4px">
        ${sender.totalCount} emails · ${sender.unreadCount} unread
      </span>
      <span
        class="cv-junk-arrow"
        data-index="${i}"
        style="color:#666;font-size:12px;flex-shrink:0">▸</span>
    </div>

    <div
      id="junk-body-${i}"
      style="display:none;padding:0 8px 8px 16px">
      ${sender.emails
        .map(
          (e) => `
        <div style="display:flex;align-items:center;gap:8px;
                    padding:7px 8px;border-radius:6px;font-size:12px;
                    border-bottom:1px solid #fafafa">
          <input type="checkbox" checked data-id="${e.id}"
                 data-junk-group="${i}"
                 class="cv-junk-email-cb"
                 style="flex-shrink:0">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;
                       white-space:nowrap;color:#333">
            ${e.subject}
          </span>
          <span style="color:#bbb;flex-shrink:0;font-size:11px;
                       margin-right:4px">
            ${e.date}
          </span>
          <a href="https://mail.google.com/mail/u/0/#all/${e.id}"
             target="_blank"
             style="color:#1a73e8;text-decoration:none;font-size:16px;
                    flex-shrink:0;line-height:1"
             title="Open this email in Gmail">↗</a>
        </div>
      `
        )
        .join("")}
    </div>
  </div>
`
    )
    .join("");

  document.getElementById("cv-junk-list").innerHTML = junkHtml;

  // Step 2: Attach click listeners to junk header rows
  document.querySelectorAll(".cv-junk-header").forEach((header) => {
    header.addEventListener("click", function (e) {
      if (e.target.classList.contains("cv-junk-checkbox")) return;

      const index = this.dataset.index;
      const body = document.getElementById("junk-body-" + index);
      const arrow = this.querySelector(".cv-junk-arrow");

      if (!body) return;

      const isCurrentlyOpen = body.style.display === "block";

      if (isCurrentlyOpen) {
        body.style.display = "none";
        if (arrow) arrow.textContent = "▸";
      } else {
        body.style.display = "block";
        if (arrow) arrow.textContent = "▾";
      }
    });
  });

  // Junk sender checkbox: select / deselect all emails from that sender.
  document.querySelectorAll(".cv-junk-checkbox").forEach((parentCb) => {
    parentCb.addEventListener("change", () => {
      const header = parentCb.closest(".cv-junk-header");
      const index = header?.dataset.index;
      if (index === undefined) return;
      const body = document.getElementById("junk-body-" + index);
      if (!body) return;
      parentCb.indeterminate = false;
      body.querySelectorAll('input[type="checkbox"][data-id]').forEach((child) => {
        child.checked = parentCb.checked;
      });
      syncSelectAllFromPanel();
    });
  });

  document.querySelectorAll(".cv-junk-email-cb").forEach((childCb) => {
    childCb.addEventListener("change", () => {
      const g = childCb.dataset.junkGroup;
      if (g === undefined) return;
      syncJunkParentCheckboxForGroup(g);
      syncSelectAllFromPanel();
    });
  });

  // Select all toggle: apply to every row checkbox.
  const selectAllEl = document.getElementById("cv-select-all");
  if (selectAllEl) {
    selectAllEl.onchange = function () {
      const allCheckboxes = document.querySelectorAll(
        "#clearview-panel input[type=\"checkbox\"]:not(#cv-select-all)"
      );
      allCheckboxes.forEach((cb) => {
        cb.checked = this.checked;
        if (cb.classList.contains("cv-junk-checkbox")) cb.indeterminate = false;
      });
      syncSelectAllFromPanel();
    };
  }

  // Keep Select All in sync when individual checkboxes change.
  const rowCheckboxes = document.querySelectorAll(
    '#clearview-panel input[type="checkbox"]:not(#cv-select-all)'
  );
  rowCheckboxes.forEach((cb) => {
    cb.addEventListener("change", () => syncSelectAllFromPanel());
  });

  wireActionButtons();

  // Slide in panel when results render.
  const panel = document.getElementById("clearview-panel");
  if (panel) panel.classList.add("open");
}

// ----------------------------
// Detectors (inlined so they are available in this content script)
// ----------------------------

// OTP detector (proximity-based)
const OTP_KEYWORDS = [
  "otp",
  "one-time",
  "one time",
  "verification code",
  "passcode",
  "secret code",
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

function detectOTPs(emails) {
  if (!Array.isArray(emails)) return [];
  return emails
    .filter((email) => {
      const text = `${email.subject || ""} ${email.body || ""}`.toLowerCase();
      if (EXCLUDE_PATTERNS.some((p) => text.includes(p))) return false;
      const code = findOtpCodeByProximity(text);
      if (!code) return false;
      if (!AUTH_KEYWORDS.some((k) => text.includes(k))) return false;
      return true;
    })
    .map((email) => {
      const text = `${email.subject || ""} ${email.body || ""}`.toLowerCase();
      return {
        id: email.id,
        sender: email.sender,
        subject: email.subject,
        date: email.date,
        otpCode: findOtpCodeByProximity(text),
        category: "OTP"
      };
    });
}

// Payment detector
const PROMO_EXCLUDE_RE = /\b(pay now|buy now|offer|sale|discount)\b/i;
const CURRENCY_AMOUNT_RE = /([₹$€£])\s*([0-9][0-9,]*(?:\.[0-9]+)?)/;
const SUCCESS_RE =
  /\b(paid successfully|payment successful|payment received|transaction successful|order confirmed)\b/i;
const FAILURE_RE = /\b(payment failed|payment declined|transaction failed|unsuccessful transaction)\b/i;
const ORDER_CONFIRMED_FUZZY_RE = /\border\b[\s\S]{0,40}\bconfirmed\b/i;

function parseAmount(rawAmount) {
  const cleaned = String(rawAmount || "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function detectPayments(emails) {
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
    if (PROMO_EXCLUDE_RE.test(combined)) continue;
    const moneyMatch = combined.match(CURRENCY_AMOUNT_RE);
    if (!moneyMatch) continue;
    const currency = moneyMatch[1];
    const amount = parseAmount(moneyMatch[2]);
    if (amount === null) continue;
    let status = null;
    if (SUCCESS_RE.test(combined) || ORDER_CONFIRMED_FUZZY_RE.test(combined)) status = "success";
    else if (FAILURE_RE.test(combined)) status = "failure";
    else continue;
    detections.push({ id, sender, subject, date, amount, currency, status, category: "Payment" });
  }
  return detections;
}

// Junk sender detector (protected domain list + rules)
const PROTECTED_DOMAINS = new Set([
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

function isProtectedDomain(senderEmail) {
  const from = String(senderEmail || "").trim();
  if (!from) return false;
  const match = from.match(/<([^>]+)>/);
  const email = (match ? match[1] : from).trim().toLowerCase();
  const domain = email.includes("@") ? email.split("@").pop() : "";
  if (!domain) return false;
  if (PROTECTED_DOMAINS.has(domain)) return true;
  if (domain.endsWith(".edu")) return true;
  if (domain.endsWith(".ac.in")) return true;
  if (domain.endsWith(".edu.in")) return true;
  if (domain.endsWith(".gov.in")) return true;
  return false;
}

function parseEmailAddress(sender) {
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
  const t =
    dateValue instanceof Date
      ? dateValue.getTime()
      : typeof dateValue === "number"
        ? dateValue
        : Date.parse(String(dateValue || ""));
  return Number.isFinite(t) ? t : 0;
}

function detectJunkSenders(emails) {
  if (!Array.isArray(emails)) return [];

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

    if (isProtectedDomain(sender)) continue;
    if (totalCount < 10) continue;
    if (unreadPercentage < 0.7) continue;

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

  flagged.sort((a, b) => b.totalCount - a.totalCount);
  return flagged;
}

// ----------------------------
// Real Gmail scan
// ----------------------------

function removeBannerIfPresent() {
  const banner = document.getElementById("cv-banner");
  if (banner) banner.remove();
  // Only clear padding if we were the ones who set it.
  if (document.body.style.paddingTop === "48px") document.body.style.paddingTop = "";
}

function extractEmail(fromHeader) {
  if (!fromHeader) return "";
  // Try to extract email from "Display Name <email@domain.com>" format
  const match = String(fromHeader).match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  // If no angle brackets, the whole thing is the email
  return String(fromHeader).toLowerCase().trim();
}

async function scanInbox(token) {
  console.log("ClearView: Starting real inbox scan...");

  try {
    delete window._cvRealTotal;

    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 2);
    const afterDate = Math.floor(cutoffDate.getTime() / 1000);

    const MAX_EMAILS = 5000;
    const PER_PAGE = 500;
    let allMessageIds = [];
    let pageToken = null;
    let pageCount = 0;
    let realTotal = null;

    console.log("ClearView: Fetching email list (up to 5000 emails)...");

    while (allMessageIds.length < MAX_EMAILS) {
      let url =
        `https://www.googleapis.com/gmail/v1/users/me/messages?` +
        `maxResults=${PER_PAGE}&labelIds=INBOX&q=after:${afterDate}`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const listRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!listRes.ok) {
        console.error("ClearView: API error", listRes.status);
        break;
      }

      const listData = await listRes.json();

      if (
        !realTotal &&
        typeof listData.resultSizeEstimate === "number" &&
        listData.resultSizeEstimate > 0
      ) {
        realTotal = Math.min(listData.resultSizeEstimate, MAX_EMAILS);
        console.log("ClearView: Actual inbox count:", realTotal);
        updateProgressTotal(realTotal);
      }

      if (!listData.messages || listData.messages.length === 0) {
        console.log("ClearView: No more emails to fetch");
        break;
      }

      allMessageIds.push(...listData.messages);
      pageCount++;

      console.log(
        `ClearView: Fetched page ${pageCount} — ${allMessageIds.length} email IDs collected so far`
      );

      if (!listData.nextPageToken) {
        console.log("ClearView: Reached end of inbox");
        break;
      }

      pageToken = listData.nextPageToken;

      if (allMessageIds.length >= MAX_EMAILS) {
        console.log("ClearView: Reached 5000 email limit");
        break;
      }
    }

    if (allMessageIds.length > MAX_EMAILS) {
      allMessageIds = allMessageIds.slice(0, MAX_EMAILS);
    }

    console.log(`ClearView: Total email IDs fetched: ${allMessageIds.length}`);

    if (allMessageIds.length === 0) {
      return { otps: [], payments: [], junkSenders: [] };
    }

    window._cvRealTotal = allMessageIds.length;

    const emails = [];
    const BATCH_SIZE = 20;
    const total = allMessageIds.length;

    const decodeBase64Url = (data) => {
      if (!data) return "";
      const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      try {
        return atob(padded);
      } catch {
        return "";
      }
    };

    updateProgress(0, total);

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = allMessageIds.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (msg) => {
        try {
          const msgUrl = `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
          const msgRes = await fetch(msgUrl, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (!msgRes.ok) return null;

          const msgData = await msgRes.json();
          const headers = msgData.payload?.headers || [];
          const subject = headers.find((h) => h.name === "Subject")?.value || "";
          const fromHeader = headers.find((h) => h.name === "From")?.value || "";
          const date = headers.find((h) => h.name === "Date")?.value || "";
          const isUnread = msgData.labelIds?.includes("UNREAD") || false;

          const sender = extractEmail(fromHeader);
          const senderName = fromHeader;

          let body = "";
          const extractBody = (part) => {
            if (!part) return;
            if (part.mimeType === "text/plain" && part.body?.data) {
              body += decodeBase64Url(part.body.data);
            }
            if (part.parts) part.parts.forEach(extractBody);
          };
          if (msgData.payload) extractBody(msgData.payload);

          return {
            id: msg.id,
            subject,
            sender,
            senderName,
            date,
            body,
            isUnread,
            snippet: msgData.snippet || ""
          };
        } catch (err) {
          console.warn("ClearView: Failed to fetch email", msg.id);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      const validResults = batchResults.filter((e) => e !== null);
      emails.push(...validResults);

      updateProgress(emails.length, total);
      console.log(`ClearView: Processed ${emails.length} / ${total} emails`);

      if (i > 0 && i % (BATCH_SIZE * 5) === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(`ClearView: Scan complete. Running detectors on ${emails.length} emails...`);

    // Run all three detectors
    const otps = detectOTPs(emails);
    const payments = detectPayments(emails);
    const junkSenders = detectJunkSenders(emails);

    console.log(
      `ClearView: Found ${otps.length} OTPs, ${payments.length} payments, ${junkSenders.length} junk senders`
    );

    return { otps, payments, junkSenders };
  } catch (err) {
    console.error("ClearView: Scan failed", err);
    return { otps: [], payments: [], junkSenders: [] };
  }
}

// Gets all checked email IDs from the panel
function getSelectedEmailIds() {
  const checkboxes = document.querySelectorAll(
    '#clearview-panel input[type="checkbox"][data-id]:checked'
  );
  return Array.from(checkboxes).map((cb) => cb.dataset.id);
}

// Gets auth token from background.js
function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "GET_TOKEN" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else if (response?.error) {
        reject(new Error(response.error));
      } else if (response?.token) {
        resolve(response.token);
      } else {
        reject(new Error("No token received"));
      }
    });
  });
}

function wireActionButtons() {
  const deleteBtn = document.getElementById("cv-delete-btn");
  const archiveBtn = document.getElementById("cv-archive-btn");
  if (!deleteBtn || !archiveBtn) return;
  if (deleteBtn.dataset.wired === "1" && archiveBtn.dataset.wired === "1") return;

  deleteBtn.dataset.wired = "1";
  archiveBtn.dataset.wired = "1";

  document.getElementById("cv-delete-btn").addEventListener("click", async () => {
    const btn = document.getElementById("cv-delete-btn");
    const selectedIds = getSelectedEmailIds();

    if (selectedIds.length === 0) {
      alert("No emails selected. Please select emails first.");
      return;
    }

    btn.textContent = `Deleting ${selectedIds.length} emails...`;
    btn.disabled = true;

    try {
      const token = await getAuthToken();
      console.log("ClearView: Trashing", selectedIds.length, "emails");

      await Promise.all(
        selectedIds.map((id) =>
          fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${id}/trash`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );

      btn.textContent = `✓ Deleted ${selectedIds.length} emails`;
      console.log("ClearView: Delete successful, reloading...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error("ClearView: Delete failed", err);
      btn.textContent = "Delete failed — try again";
      btn.disabled = false;
    }
  });

  document.getElementById("cv-archive-btn").addEventListener("click", async () => {
    const btn = document.getElementById("cv-archive-btn");
    const selectedIds = getSelectedEmailIds();

    if (selectedIds.length === 0) {
      alert("No emails selected. Please select emails first.");
      return;
    }

    btn.textContent = `Archiving ${selectedIds.length} emails...`;
    btn.disabled = true;

    try {
      const token = await getAuthToken();
      console.log("ClearView: Archiving", selectedIds.length, "emails");

      await Promise.all(
        selectedIds.map((id) =>
          fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ removeLabelIds: ["INBOX"] })
          })
        )
      );

      btn.textContent = `✓ Archived ${selectedIds.length} emails`;
      console.log("ClearView: Archive successful, reloading...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error("ClearView: Archive failed", err);
      btn.textContent = "Archive failed — try again";
      btn.disabled = false;
    }
  });
}

function requestTokenFromBackground() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: MSG_GET_TOKEN, interactive: false }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!response || !response.ok) return reject(new Error(response?.error || "Unknown error"));
      resolve(response.token);
    });
  });
}

function isInboxPage() {
  const hash = window.location.hash;
  // Inbox: default route, #, or any #inbox… (thread URLs are #inbox/…).
  // Omitted `!hash.includes('/')` from the naive guard — it matches #spam, #sent, #trash, etc.
  return (
    hash === "" ||
    hash === "#" ||
    hash === "#inbox" ||
    hash.startsWith("#inbox")
  );
}

async function runClearViewScan() {
  try {
    const token = await requestTokenFromBackground();
    if (token) console.log("ClearView: Auth successful");

    const results = await scanInbox(token);
    showResults(results);
  } catch (error) {
    console.log("ClearView: Auth failed", error);
    showResults({ otps: [], payments: [], junkSenders: [] });
  }
}

function watchForPanelRemoval() {
  const observer = new MutationObserver(() => {
    const panel = document.getElementById("clearview-panel");
    if (!panel) {
      console.log("ClearView: Panel removed by Gmail, re-injecting");
      injectStyles();
      injectPanel();
      getCachedResults().then((cached) => {
        if (cached) showResults(cached);
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: false
  });
}

function startClearView() {
  if (!isInboxPage()) {
    console.log("ClearView: Not on inbox page, skipping scan. Current page:", window.location.hash);
  } else {
    injectStyles();
    injectPanel();
    showScanningState();
    runClearViewScan();
  }
  watchForPanelRemoval();
}

startClearView();

window.addEventListener("hashchange", async () => {
  console.log("ClearView: URL changed to", window.location.hash);

  const panel = document.getElementById("clearview-panel");
  if (!panel) return;

  const isPanelOpen = panel.classList.contains("open");
  if (!isPanelOpen) return;

  const cached = await getCachedResults();
  if (cached) {
    showResults(cached);
  }
});
