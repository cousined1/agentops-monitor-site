(() => {
  "use strict";

  const STORAGE_KEY = "aom_cookie_consent";
  const POLICY_VERSION = "2026-08-19-v1";
  const gpcEnabled = navigator.globalPrivacyControl === true;

  const EEA_COUNTRIES = new Set([
    "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
    "FR", "GR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT",
    "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK",
  ]);

  function detectRegion() {
    const locale = navigator.language || "";
    const country = locale.match(/[-_]([A-Z]{2})$/i)?.[1]?.toUpperCase();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";

    if (country && EEA_COUNTRIES.has(country)) return "eea";
    if (country === "GB") return "uk";
    if (country === "US" && timeZone === "America/Los_Angeles") return "california-possible";
    return "unknown-strict-default";
  }

  function readConsent() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (value?.policyVersion !== POLICY_VERSION || !value.categories) return null;
      return value;
    } catch {
      return null;
    }
  }

  const initialConsent = readConsent();
  if (initialConsent?.categories) {
    window.__aomConsent = initialConsent.categories;
  }

  function updateConsentMode(categories) {
    window.gtag?.("consent", "update", {
      analytics_storage: categories.analytics ? "granted" : "denied",
      functionality_storage: categories.preferences ? "granted" : "denied",
      personalization_storage: categories.preferences ? "granted" : "denied",
      ad_storage: categories.marketing ? "granted" : "denied",
      ad_user_data: categories.marketing ? "granted" : "denied",
      ad_personalization: categories.marketing ? "granted" : "denied",
      security_storage: "granted",
    });
  }

  function saveConsent(categories, source) {
    const normalized = {
      necessary: true,
      analytics: Boolean(categories.analytics),
      preferences: Boolean(categories.preferences),
      marketing: gpcEnabled ? false : Boolean(categories.marketing),
    };
    const record = {
      policyVersion: POLICY_VERSION,
      timestamp: new Date().toISOString(),
      source,
      region: detectRegion(),
      gpc: gpcEnabled,
      categories: normalized,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {}

    updateConsentMode(normalized);
    window.__aomConsent = normalized;
    window.dispatchEvent(new CustomEvent("aom:consent-updated", { detail: record }));
    return record;
  }

  function renderControls() {
    const gpcNotice = gpcEnabled
      ? '<p class="consent-gpc">Global Privacy Control is active. Marketing remains off.</p>'
      : "";

    document.body.insertAdjacentHTML("beforeend", `
      <aside class="consent-banner" id="consent-banner" aria-labelledby="consent-title" hidden>
        <div class="consent-copy">
          <p class="consent-label">Privacy controls</p>
          <h2 id="consent-title">Choose what this site may store</h2>
          <p>Strictly necessary storage keeps your choice. Analytics, preferences, and marketing stay off unless you allow them.</p>
          ${gpcNotice}
        </div>
        <div class="consent-actions">
          <button class="cta cta-primary" type="button" data-consent-action="accept">Accept All</button>
          <button class="cta cta-ghost" type="button" data-consent-action="reject">Reject Non-Essential</button>
          <button class="consent-link" type="button" data-consent-action="manage">Manage Preferences</button>
        </div>
      </aside>
      <dialog class="consent-dialog" id="consent-dialog" aria-labelledby="preferences-title">
        <form method="dialog" id="consent-form">
          <div class="consent-dialog-head">
            <div>
              <p class="consent-label">Privacy controls</p>
              <h2 id="preferences-title">Cookie preferences</h2>
            </div>
            <button class="consent-close" type="button" data-consent-action="close" aria-label="Close cookie preferences">Close</button>
          </div>
          <p>Choose which optional technologies may run. You can change this choice at any time.</p>
          ${gpcNotice}
          <fieldset class="consent-categories">
            <legend class="sr-only">Consent categories</legend>
            <label class="consent-category">
              <span><strong>Strictly necessary</strong><small>Stores your privacy choice and supports site security.</small></span>
              <input type="checkbox" checked disabled aria-describedby="necessary-note">
            </label>
            <span class="sr-only" id="necessary-note">Always active</span>
            <label class="consent-category">
              <span><strong>Analytics</strong><small>Would measure site use. No analytics provider is currently installed.</small></span>
              <input name="analytics" type="checkbox">
            </label>
            <label class="consent-category">
              <span><strong>Preferences</strong><small>Would remember optional interface settings.</small></span>
              <input name="preferences" type="checkbox">
            </label>
            <label class="consent-category">
              <span><strong>Marketing</strong><small>Would support advertising or cross-site measurement. None is currently installed.</small></span>
              <input name="marketing" type="checkbox" ${gpcEnabled ? "disabled" : ""}>
            </label>
          </fieldset>
          <div class="consent-dialog-actions">
            <button class="cta cta-primary" type="submit">Save Preferences</button>
            <button class="cta cta-ghost" type="button" data-consent-action="reject">Reject Non-Essential</button>
          </div>
          <p class="consent-policy-link"><a href="/cookie-policy">Read the Cookie Policy</a></p>
        </form>
      </dialog>
      <p class="sr-only" id="consent-status" aria-live="polite"></p>
    `);
  }

  function init() {
    renderControls();

    const banner = document.querySelector("#consent-banner");
    const dialog = document.querySelector("#consent-dialog");
    const form = document.querySelector("#consent-form");
    const status = document.querySelector("#consent-status");
    let consent = readConsent();

    const fillForm = () => {
      const categories = consent?.categories || {};
      form.elements.analytics.checked = Boolean(categories.analytics);
      form.elements.preferences.checked = Boolean(categories.preferences);
      form.elements.marketing.checked = gpcEnabled ? false : Boolean(categories.marketing);
    };

    const closeBanner = () => {
      banner.hidden = true;
    };

    const confirm = (categories, source) => {
      consent = saveConsent(categories, source);
      closeBanner();
      if (dialog.open) dialog.close();
      status.textContent = "Cookie preferences saved.";
    };

    const openPreferences = () => {
      fillForm();
      dialog.showModal();
    };

    document.addEventListener("click", (event) => {
      const control = event.target.closest("[data-consent-action], [data-cookie-preferences]");
      if (!control) return;

      const action = control.dataset.consentAction || "manage";
      if (action === "accept") {
        confirm({ analytics: true, preferences: true, marketing: true }, "accept-all");
      } else if (action === "reject") {
        confirm({ analytics: false, preferences: false, marketing: false }, "reject-non-essential");
      } else if (action === "close") {
        if (dialog.open) dialog.close();
      } else {
        openPreferences();
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      confirm({
        analytics: form.elements.analytics.checked,
        preferences: form.elements.preferences.checked,
        marketing: form.elements.marketing.checked,
      }, "manage-preferences");
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog && dialog.open) dialog.close();
    });

    if (consent) {
      updateConsentMode(consent.categories);
    } else {
      banner.hidden = false;
    }
  }

  window.AOMCookieConsent = {
    getConsent: readConsent,
    openPreferences: () => {
      const dialog = document.getElementById("consent-dialog");
      if (dialog && typeof dialog.showModal === "function") {
        dialog.showModal();
      }
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
