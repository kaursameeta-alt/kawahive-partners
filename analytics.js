// KawaHive privacy-first analytics and lead-event tracking.
(function () {
  'use strict';
  var MEASUREMENT_ID = 'G-SYPLY10GMT';
  var CONSENT_KEY = 'kawahive_analytics_consent';
  var consentGranted = false;
  var analyticsLoaded = false;
  var trackingBound = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    analytics_storage: 'denied', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied',
    wait_for_update: 500
  });

  function readChoice() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function captureCampaignParameters() {
    if (!consentGranted) return;
    try {
      var params = new URLSearchParams(window.location.search);
      var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
      var utm = {};
      keys.forEach(function (key) { var value = params.get(key); if (value) utm[key] = value; });
      if (Object.keys(utm).length) sessionStorage.setItem('kawahive_utm', JSON.stringify(utm));
    } catch (e) {}
  }
  function getUtm() {
    if (!consentGranted) return {};
    try { return JSON.parse(sessionStorage.getItem('kawahive_utm') || '{}'); } catch (e) { return {}; }
  }
  function loadAnalytics() {
    consentGranted = true;
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, { anonymize_ip: true });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(script);
    captureCampaignParameters();
  }
  function removeGoogleAnalyticsCookies() {
    try {
      document.cookie.split(';').forEach(function (part) {
        var name = part.split('=')[0].trim();
        if (!/^_ga($|_)/.test(name)) return;
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
        document.cookie = name + '=; Max-Age=0; path=/; domain=' + location.hostname + '; SameSite=Lax';
        document.cookie = name + '=; Max-Age=0; path=/; domain=.kawahive.com; SameSite=Lax';
      });
      sessionStorage.removeItem('kawahive_utm');
    } catch (e) {}
  }
  function disableAnalytics() {
    consentGranted = false;
    window.gtag('consent', 'update', { analytics_storage: 'denied' });
    removeGoogleAnalyticsCookies();
  }
  function hideBanner() {
    var banner = document.getElementById('kawahive-cookie-banner');
    if (banner) banner.remove();
  }
  function saveChoice(choice) {
    try { localStorage.setItem(CONSENT_KEY, choice); } catch (e) {}
    if (choice === 'accepted') loadAnalytics(); else disableAnalytics();
    hideBanner();
  }
  function showBanner() {
    if (!document.body || document.getElementById('kawahive-cookie-banner')) return;
    if (!document.getElementById('kawahive-cookie-style')) {
      var style = document.createElement('style');
      style.id = 'kawahive-cookie-style';
      style.textContent = '#kawahive-cookie-banner{position:fixed;z-index:9999;left:16px;right:16px;bottom:16px;max-width:760px;margin-left:auto;background:#fff;color:#1b2b3e;border:1px solid #d8dee7;border-radius:14px;box-shadow:0 12px 40px rgba(7,23,43,.22);padding:18px 20px;font:14px/1.55 Inter,Arial,sans-serif}#kawahive-cookie-banner p{margin:0 0 12px}#kawahive-cookie-banner a{color:#805f25;text-decoration:underline;text-underline-offset:3px}#kawahive-cookie-banner .kh-cookie-actions{display:flex;gap:10px;flex-wrap:wrap}#kawahive-cookie-banner button{border:1px solid #0b1f3a;border-radius:7px;padding:9px 14px;font:600 13px Inter,Arial,sans-serif;cursor:pointer}#kawahive-cookie-banner .kh-accept{background:#0b1f3a;color:#fff}#kawahive-cookie-banner .kh-reject{background:#fff;color:#0b1f3a}#kawahive-cookie-banner button:focus-visible{outline:3px solid #8a6525;outline-offset:3px}@media(max-width:520px){#kawahive-cookie-banner{left:10px;right:10px;bottom:10px;padding:15px}#kawahive-cookie-banner .kh-cookie-actions button{flex:1}}';
      document.head.appendChild(style);
    }
    var banner = document.createElement('section');
    banner.id = 'kawahive-cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Analytics cookie preferences');
    banner.innerHTML = '<p><strong>Analytics preferences</strong><br>We use optional Google Analytics to understand how visitors use this website. Choose whether to allow analytics. The contact form remains available if you reject. Read our <a href="/privacy.html">Privacy Policy</a>.</p><div class="kh-cookie-actions"><button type="button" class="kh-accept">Accept analytics</button><button type="button" class="kh-reject">Reject analytics</button></div>';
    banner.querySelector('.kh-accept').addEventListener('click', function () { saveChoice('accepted'); });
    banner.querySelector('.kh-reject').addEventListener('click', function () { saveChoice('rejected'); });
    document.body.appendChild(banner);
  }
  function addCookieSettingsLink() {
    var footer = document.querySelector('footer');
    if (!footer || footer.querySelector('[data-kawahive-cookie-settings]')) return;
    var link = document.createElement('a');
    link.href = '#cookie-settings';
    link.id = 'cookie-settings';
    link.textContent = 'Cookie settings';
    link.setAttribute('data-kawahive-cookie-settings', 'true');
    link.style.cssText = 'display:inline-block;margin:8px 12px 0 0;text-decoration:underline;text-underline-offset:3px;';
    link.addEventListener('click', function (event) { event.preventDefault(); showBanner(); });
    var nav = footer.querySelector('nav, .footer-links, .footer-bottom');
    (nav || footer).appendChild(link);
  }
  function trackEvent(name, params) {
    if (consentGranted) window.gtag('event', name, params || {});
  }
  function trackLead(leadType, link) {
    var utm = getUtm();
    trackEvent('generate_lead', { lead_source: utm.utm_source || 'website', lead_type: leadType, link_url: link || '' });
  }
  function bindTracking() {
    if (trackingBound) return;
    trackingBound = true;
    document.querySelectorAll('a[href^="mailto:"]').forEach(function (link) {
      link.addEventListener('click', function () { trackLead('email', this.href); });
    });
    document.querySelectorAll('a[href*="wa.me"]').forEach(function (link) {
      link.addEventListener('click', function () { trackLead('whatsapp', this.href); });
    });
    document.querySelectorAll('a[href*="linkedin.com"]').forEach(function (link) {
      link.addEventListener('click', function () { trackEvent('social_click', { platform: 'linkedin', link_url: this.href }); });
    });
    document.querySelectorAll('a[href$="/lab.html"], a[href*="/lab.html?"]').forEach(function (link) {
      link.addEventListener('click', function () { trackEvent('lab_cta_click', { link_url: this.href }); });
    });
    document.querySelectorAll('[data-track-event]').forEach(function (element) {
      element.addEventListener('click', function () {
        var name = this.getAttribute('data-track-event');
        var label = this.getAttribute('data-track-label') || this.textContent.trim();
        if (name) trackEvent(name, { link_label: label, link_url: this.href || '' });
      });
    });
  }
  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (data && data.type === 'hsFormCallback' && data.eventName === 'onFormSubmitted') trackLead('hubspot_form', data.id || '');
  });
  window.addEventListener('hs-form-event:on-submission:success', function (event) {
    var detail = event && event.detail ? event.detail : {};
    trackLead('hubspot_form', detail.formId || detail.id || '');
  });
  function init() {
    var choice = readChoice();
    if (choice === 'accepted') loadAnalytics();
    else if (choice === 'rejected') disableAnalytics();
    else showBanner();
    addCookieSettingsLink();
    bindTracking();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();