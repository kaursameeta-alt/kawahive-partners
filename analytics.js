// KawaHive GA4 tracking
(function () {
  var MEASUREMENT_ID = 'G-SYPLY10GMT';

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID);

  // Preserve campaign parameters for lead events and CRM handoff.
  try {
    var params = new URLSearchParams(window.location.search);
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var utm = {};
    keys.forEach(function (key) {
      var value = params.get(key);
      if (value) utm[key] = value;
    });
    if (Object.keys(utm).length) {
      sessionStorage.setItem('kawahive_utm', JSON.stringify(utm));
    }
  } catch (e) {}

  function getUtm() {
    try { return JSON.parse(sessionStorage.getItem('kawahive_utm') || '{}'); }
    catch (e) { return {}; }
  }

  function trackLead(leadType, link) {
    var utm = getUtm();
    window.gtag('event', 'generate_lead', {
      lead_source: utm.utm_source || 'website',
      lead_type: leadType,
      link_url: link || ''
    });
  }

  function trackEvent(name, params) {
    window.gtag('event', name, params || {});
  }

  function bindTracking() {
    document.querySelectorAll('a[href*="calendly.com"]').forEach(function (link) {
      link.addEventListener('click', function () {
        trackLead('strategy_session', this.href);
      });
    });

    document.querySelectorAll('a[href^="mailto:"]').forEach(function (link) {
      link.addEventListener('click', function () {
        trackLead('email', this.href);
      });
    });

    document.querySelectorAll('a[href*="wa.me"]').forEach(function (link) {
      link.addEventListener('click', function () {
        trackLead('whatsapp', this.href);
      });
    });

    document.querySelectorAll('a[href*="linkedin.com"]').forEach(function (link) {
      link.addEventListener('click', function () {
        trackEvent('social_click', { platform: 'linkedin', link_url: this.href });
      });
    });

    document.querySelectorAll('a[href$="/lab.html"], a[href*="/lab.html?"]').forEach(function (link) {
      link.addEventListener('click', function () {
        trackEvent('lab_cta_click', { link_url: this.href });
      });
    });

    document.querySelectorAll('[data-track-event]').forEach(function (element) {
      element.addEventListener('click', function () {
        var name = this.getAttribute('data-track-event');
        var label = this.getAttribute('data-track-label') || this.textContent.trim();
        if (name) trackEvent(name, { link_label: label, link_url: this.href || '' });
      });
    });
  }

  // HubSpot form success callbacks. These are harmless until a HubSpot form is present.
  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || data.type !== 'hsFormCallback' || data.eventName !== 'onFormSubmitted') return;
    var utm = getUtm();
    trackEvent('generate_lead', {
      lead_source: utm.utm_source || 'website',
      lead_type: 'hubspot_form',
      form_id: data.id || ''
    });
  });

  window.addEventListener('hs-form-event:on-submission:success', function (event) {
    var detail = event && event.detail ? event.detail : {};
    var utm = getUtm();
    trackEvent('generate_lead', {
      lead_source: utm.utm_source || 'website',
      lead_type: 'hubspot_form',
      form_id: detail.formId || detail.id || ''
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindTracking);
  } else {
    bindTracking();
  }
})();