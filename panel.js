// panel.js
// Drawer UI logic for the ClearView slide-in review panel.
//
// This script is loaded as a content script on Gmail pages (see manifest.json).
// content.js injects the HTML/CSS; this file renders data + wires interactivity.

const PANEL_ID = "clearview-panel";
const EMPTY_ID = "clearview-empty";
const USER_WHITELIST_KEY = "cv_user_whitelist";

let onDeleteCb = null;
let onArchiveCb = null;
let onCloseCb = null;

let userWhitelist = new Set();
let whitelistLoaded = false;

function $(id) {
  return document.getElementById(id);
}

function getPanelRoot() {
  return $(PANEL_ID);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(currency, amount) {
  if (typeof amount !== "number") return `${currency}${amount ?? ""}`;
  // Keep it simple: show decimals only if present.
  const hasDecimals = Math.round(amount) !== amount;
  const formatted = hasDecimals ? amount.toFixed(2) : String(amount);
  return `${currency}${formatted}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getGmailMessageUrl(id) {
  // Gmail supports navigating directly to a message by ID in the inbox.
  // This is a best-effort deep link; it may vary between accounts/UIs.
  return `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(id)}`;
}

function loadUserWhitelistOnce() {
  if (whitelistLoaded) return;
  whitelistLoaded = true;

  try {
    chrome.storage.local.get([USER_WHITELIST_KEY], (res) => {
      const list = Array.isArray(res?.[USER_WHITELIST_KEY]) ? res[USER_WHITELIST_KEY] : [];
      userWhitelist = new Set(list.map((x) => String(x).toLowerCase()));
    });
  } catch {
    // If storage isn't available for some reason, we just run without this feature.
    userWhitelist = new Set();
  }
}

function addSenderToUserWhitelist(senderEmail) {
  const sender = String(senderEmail || "").trim().toLowerCase();
  if (!sender) return;
  userWhitelist.add(sender);

  try {
    chrome.storage.local.get([USER_WHITELIST_KEY], (res) => {
      const list = Array.isArray(res?.[USER_WHITELIST_KEY]) ? res[USER_WHITELIST_KEY] : [];
      const set = new Set(list.map((x) => String(x).toLowerCase()));
      set.add(sender);
      chrome.storage.local.set({ [USER_WHITELIST_KEY]: Array.from(set) });
    });
  } catch {
    // ignore
  }
}

function wireSectionToggles() {
  const panel = getPanelRoot();
  if (!panel) return;

  panel.querySelectorAll(".cv-section-header[data-cv-toggle]").forEach((header) => {
    header.addEventListener("click", () => {
      const bodyId = header.getAttribute("data-cv-toggle");
      const chevId = header.getAttribute("data-cv-chevron");
      const body = bodyId ? $(bodyId) : null;
      const chev = chevId ? $(chevId) : null;
      if (!body) return;

      const isCollapsed = body.style.display === "none";
      body.style.display = isCollapsed ? "" : "none";
      if (chev) chev.textContent = isCollapsed ? "▾" : "▸";
    });
  });
}

function wireSelectAll() {
  const panel = getPanelRoot();
  const selectAll = $("cv-select-all");
  if (!panel || !selectAll) return;

  selectAll.addEventListener("change", () => {
    const checked = selectAll.checked;
    panel
      .querySelectorAll('input[type="checkbox"][data-cv-email-id]')
      .forEach((cb) => (cb.checked = checked));
  });
}

function wireFooterButtons() {
  const archiveBtn = $("cv-archive-btn");
  const deleteBtn = $("cv-delete-btn");
  const closeBtn = $("cv-close-btn");

  if (archiveBtn) {
    archiveBtn.addEventListener("click", () => {
      if (typeof onArchiveCb === "function") onArchiveCb(getSelectedIds());
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      if (typeof onDeleteCb === "function") onDeleteCb(getSelectedIds());
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (typeof onCloseCb === "function") onCloseCb();
      const panel = getPanelRoot();
      if (panel) panel.classList.remove("open");
    });
  }
}

function wireCopyOtp() {
  const panel = getPanelRoot();
  if (!panel) return;

  panel.querySelectorAll("[data-cv-copy]").forEach((el) => {
    el.addEventListener("click", async () => {
      const code = el.getAttribute("data-cv-copy") || "";
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        el.textContent = code; // keep it stable
      } catch {
        // ignore
      }
    });
  });
}

function wireNotNoiseButtons() {
  const panel = getPanelRoot();
  if (!panel) return;

  panel.querySelectorAll("[data-cv-not-noise]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const sender = btn.getAttribute("data-cv-not-noise") || "";
      addSenderToUserWhitelist(sender);

      // Remove the visual row immediately.
      const row = btn.closest("[data-cv-row]");
      if (row) row.remove();

      // Recompute counts based on remaining rows.
      updateCountsFromDOM();
    });
  });
}

function wireJunkSenderExpand() {
  const panel = getPanelRoot();
  if (!panel) return;

  panel.querySelectorAll("[data-cv-junk-toggle]").forEach((header) => {
    header.addEventListener("click", () => {
      const targetId = header.getAttribute("data-cv-junk-toggle");
      const emailsEl = targetId ? $(targetId) : null;
      const chev = header.querySelector("[data-cv-junk-chevron]");
      if (!emailsEl) return;

      const expanded = emailsEl.classList.toggle("expanded");
      if (chev) chev.textContent = expanded ? "▾" : "▸";
    });
  });
}

function updateCountsFromDOM() {
  const panel = getPanelRoot();
  if (!panel) return;

  const otpCount = panel.querySelectorAll('[data-cv-kind="otp"]').length;
  const payCount = panel.querySelectorAll('[data-cv-kind="payment"]').length;
  const junkSenderCount = panel.querySelectorAll('[data-cv-kind="junk-sender"]').length;

  const total = otpCount + payCount + junkSenderCount;

  const totalBadge = $("cv-total-count");
  const otpBadge = $("cv-otp-count");
  const payBadge = $("cv-payment-count");
  const junkBadge = $("cv-junk-count");

  if (totalBadge) totalBadge.textContent = `${total} emails flagged`;
  if (otpBadge) otpBadge.textContent = String(otpCount);
  if (payBadge) payBadge.textContent = String(payCount);
  if (junkBadge) junkBadge.textContent = String(junkSenderCount);

  const empty = $(EMPTY_ID);
  if (total === 0) {
    if (panel) panel.style.display = "none";
    if (empty) empty.style.display = "";
  } else {
    if (panel) panel.style.display = "";
    if (empty) empty.style.display = "none";
  }
}

function renderOtpRow(item) {
  const sender = item.sender || "";
  const subject = item.subject || "";
  const date = item.date || "";
  const id = item.id || "";
  const otpCode = item.otpCode || "";

  return `
    <div class="cv-email-row" data-cv-row data-cv-kind="otp">
      <input type="checkbox" data-cv-email-id="${escapeHtml(id)}" data-cv-sender="${escapeHtml(sender)}" />
      <span class="cv-category-pill pill-otp">OTP</span>
      <span class="cv-sender" title="${escapeHtml(sender)}">${escapeHtml(sender)}</span>
      <span class="cv-otp-code" title="Click to copy" data-cv-copy="${escapeHtml(otpCode)}">${escapeHtml(
    otpCode
  )}</span>
      <a class="cv-open-link" href="${escapeHtml(getGmailMessageUrl(id))}" target="_blank" rel="noreferrer">↗</a>
      <button class="cv-not-noise" data-cv-not-noise="${escapeHtml(sender)}" title="Don't show this sender again">Not noise</button>
    </div>
  `;
}

function renderPaymentRow(item) {
  const sender = item.sender || "";
  const subject = item.subject || "";
  const date = item.date || "";
  const id = item.id || "";
  const currency = item.currency || "";
  const amount = item.amount;
  const status = item.status || "success";

  const pillClass = status === "failure" ? "pill-payment-failure" : "pill-payment-success";
  const symbol = status === "failure" ? "❌" : "✅";
  const money = formatMoney(currency, amount);

  return `
    <div class="cv-email-row" data-cv-row data-cv-kind="payment">
      <input type="checkbox" data-cv-email-id="${escapeHtml(id)}" data-cv-sender="${escapeHtml(sender)}" />
      <span class="cv-category-pill ${pillClass}">${symbol} ${escapeHtml(money)}</span>
      <span class="cv-sender" title="${escapeHtml(sender)}">${escapeHtml(sender)}</span>
      <span class="cv-email-subject" title="${escapeHtml(subject)}">${escapeHtml(subject)}</span>
      <a class="cv-open-link" href="${escapeHtml(getGmailMessageUrl(id))}" target="_blank" rel="noreferrer">↗</a>
      <button class="cv-not-noise" data-cv-not-noise="${escapeHtml(sender)}" title="Don't show this sender again">Not noise</button>
    </div>
  `;
}

function renderJunkSender(item, idx) {
  const sender = item.sender || "";
  const domain = item.domain || "";
  const totalCount = item.totalCount || 0;
  const unreadCount = item.unreadCount || 0;
  const emails = Array.isArray(item.emails) ? item.emails : [];
  const toggleId = `cv-junk-emails-${idx}`;

  const emailsHtml = emails
    .map((e) => {
      const id = e.id || "";
      const subject = e.subject || "";
      const date = e.date || "";
      return `
        <div class="cv-email-row" data-cv-row data-cv-kind="junk-email">
          <input type="checkbox" data-cv-email-id="${escapeHtml(id)}" data-cv-sender="${escapeHtml(sender)}" />
          <span class="cv-category-pill pill-junk">Junk</span>
          <span class="cv-email-subject" title="${escapeHtml(subject)}">${escapeHtml(subject)}</span>
          <a class="cv-open-link" href="${escapeHtml(getGmailMessageUrl(id))}" target="_blank" rel="noreferrer">↗</a>
          <button class="cv-not-noise" data-cv-not-noise="${escapeHtml(sender)}" title="Don't show this sender again">Not noise</button>
        </div>
      `;
    })
    .join("");

  return `
    <div class="cv-junk-sender-row" data-cv-row data-cv-kind="junk-sender">
      <div class="cv-junk-sender-header" data-cv-junk-toggle="${escapeHtml(toggleId)}">
        <span class="cv-category-pill pill-junk">Junk</span>
        <span class="cv-sender" title="${escapeHtml(sender)}">${escapeHtml(sender)}</span>
        <span style="color:#5f6368;font-size:12px;">
          ${escapeHtml(domain)} · ${escapeHtml(totalCount)} emails · ${escapeHtml(unreadCount)} unread
        </span>
        <span data-cv-junk-chevron style="margin-left:auto;color:#5f6368;">▸</span>
        <button class="cv-not-noise" data-cv-not-noise="${escapeHtml(sender)}" title="Don't show this sender again">Not noise</button>
      </div>
      <div class="cv-junk-emails" id="${escapeHtml(toggleId)}">
        ${emailsHtml}
      </div>
    </div>
  `;
}

/**
 * renderPanel(data)
 * data: { otps: [], payments: [], junkSenders: [] }
 *
 * Side effects:
 * - Updates list UIs + counts
 * - Shows empty state if nothing is detected
 * - Adds "open" class so the drawer slides in
 */
function renderPanel(data) {
  loadUserWhitelistOnce();

  const panel = getPanelRoot();
  if (!panel) return;

  const otps = Array.isArray(data?.otps) ? data.otps : [];
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const junkSenders = Array.isArray(data?.junkSenders) ? data.junkSenders : [];

  // Apply user "Not noise" whitelist (sender-based).
  const keep = (item) => !userWhitelist.has(String(item?.sender || "").trim().toLowerCase());
  const otpsFiltered = otps.filter(keep);
  const paymentsFiltered = payments.filter(keep);
  const junkFiltered = junkSenders.filter(keep);

  const otpList = $("cv-otp-list");
  const payList = $("cv-payment-list");
  const junkList = $("cv-junk-list");

  if (otpList) otpList.innerHTML = otpsFiltered.map(renderOtpRow).join("") || "";
  if (payList) payList.innerHTML = paymentsFiltered.map(renderPaymentRow).join("") || "";
  if (junkList) junkList.innerHTML = junkFiltered.map(renderJunkSender).join("") || "";

  // Update badges/counts
  updateCountsFromDOM();

  // Slide in
  panel.classList.add("open");

  // Re-wire interactions because we re-rendered the DOM.
  wireSectionToggles();
  wireSelectAll();
  wireFooterButtons();
  wireCopyOtp();
  wireNotNoiseButtons();
  wireJunkSenderExpand();
}

/**
 * getSelectedIds()
 * Returns all checked email IDs in the current panel.
 */
function getSelectedIds() {
  const panel = getPanelRoot();
  if (!panel) return [];
  return Array.from(panel.querySelectorAll('input[type="checkbox"][data-cv-email-id]:checked'))
    .map((cb) => cb.getAttribute("data-cv-email-id"))
    .filter(Boolean);
}

function onDelete(callback) {
  onDeleteCb = callback;
  wireFooterButtons();
}

function onArchive(callback) {
  onArchiveCb = callback;
  wireFooterButtons();
}

function onClose(callback) {
  onCloseCb = callback;
  wireFooterButtons();
}

// Make the API easy to call from content.js without needing module imports.
window.ClearViewPanel = {
  renderPanel,
  getSelectedIds,
  onDelete,
  onArchive,
  onClose
};

