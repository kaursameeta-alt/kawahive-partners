const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.SITE_BASE_URL || 'https://kawahive.com';
const pages = [
  '/', '/about.html', '/contact.html', '/lab.html', '/insights.html',
  '/terms.html', '/privacy.html',
  '/apac-medical-device-distributor-underperforming-customer-revenue.html',
  '/registered-medtech-apac-market-demand.html',
  '/stocked-by-the-distributor-bought-by-whom.html',
  '/why-hospital-demos-dont-convert-to-purchase-orders-asia-pacific.html',
  '/why-medtech-products-dont-sell-after-regulatory-approval.html'
];
const results = { base, startedAt: new Date().toISOString(), pages: [], internalLinks: [], externalLinks: [], accessibility: [], form: {} };
const fail = (message) => { results.failures = results.failures || []; results.failures.push(message); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  const trainingPage = await context.newPage();
  const trainingResponse = await trainingPage.goto('https://lab.kawahive.com/kawahive-prospecting-training', {waitUntil:'domcontentloaded',timeout:45000}).catch(()=>null);
  const trainingInfo = await trainingPage.evaluate(() => ({title:document.title,h1:document.querySelector('h1')?.innerText || '',text:(document.body?.innerText || '').slice(0,12000)})).catch(()=>({title:'',h1:'',text:''}));
  results.trainingPage = {status:trainingResponse?.status() ?? null,title:trainingInfo.title,h1:trainingInfo.h1,hasProspecting:/prospecting/i.test(trainingInfo.title+' '+trainingInfo.h1+' '+trainingInfo.text),hasICPScorecard:/ICP\\s*Scorecard/i.test(trainingInfo.title+' '+trainingInfo.h1+' '+trainingInfo.text)};
  if (!trainingResponse || trainingResponse.status() >= 400) fail('KawaHive prospecting training page unavailable');
  if (!results.trainingPage.hasProspecting || !results.trainingPage.hasICPScorecard) fail('External training page naming is not aligned with Prospecting Training with ICP Scorecard');
  await trainingPage.close();

  const robotsResponse = await context.request.get(base + '/robots.txt', { timeout: 20000 }).catch(e => null);
  const robotsText = robotsResponse ? await robotsResponse.text() : '';
  results.robots = { status: robotsResponse?.status() ?? null, hasSitemap: /Sitemap:\s*https:\/\/kawahive\.com\/sitemap\.xml/i.test(robotsText), allowsRoot: /Allow:\s*\//i.test(robotsText) };
  if (!robotsResponse || robotsResponse.status() >= 400 || !results.robots.hasSitemap || !results.robots.allowsRoot) fail('robots.txt missing, blocked, or does not reference sitemap');

  const sitemapResponse = await context.request.get(base + '/sitemap.xml', { timeout: 20000 }).catch(e => null);
  const sitemapText = sitemapResponse ? await sitemapResponse.text() : '';
  const sitemapUrls = [...sitemapText.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  results.sitemap = { status: sitemapResponse?.status() ?? null, urlCount: sitemapUrls.length, urls: sitemapUrls, containsRetiredFDA: sitemapText.includes('fda-pending-ce-pending-apac-commercial-opportunity.html'), containsNoindexSegmentStubs: /(?:radiology|surgery|obgyn|urology|rehabilitation|gastroenterology)-medical-device-gtm-asia-pacific\.html/.test(sitemapText) };
  if (!sitemapResponse || sitemapResponse.status() >= 400 || !sitemapText.includes('<urlset')) fail('Live sitemap.xml is unavailable or invalid');
  if (results.sitemap.containsRetiredFDA || results.sitemap.containsNoindexSegmentStubs) fail('Sitemap contains retired or noindex redirect URLs');
  if (sitemapUrls.length !== pages.length) fail('Expected ' + pages.length + ' indexable sitemap URLs, found ' + sitemapUrls.length);

  for (const route of pages) {
    const url = new URL(route, base).href;
    const entry = { route, url, desktop: {}, mobile: {} };
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => null);
    entry.status = response ? response.status() : null;
    if (!response || response.status() >= 400) fail('Page unavailable: ' + route + ' status=' + entry.status);
    await page.waitForTimeout(500);

    const meta = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      viewport: document.querySelector('meta[name="viewport"]')?.content || '',
      h1: document.querySelectorAll('h1').length,
      images: [...document.images].map(i => ({src:i.currentSrc || i.src, alt:i.getAttribute('alt')})),
      jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent),
      ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
      twitterImage: document.querySelector('meta[name="twitter:image"]')?.content || '',
      ogSiteName: document.querySelector('meta[property="og:site_name"]')?.content || ''
    }));
    entry.meta = { title: meta.title, descriptionLength: meta.description.length, canonical: meta.canonical, h1: meta.h1, imageCount: meta.images.length, missingAlt: meta.images.filter(i => i.alt === null || i.alt.trim() === '').map(i=>i.src) };
    entry.analyticsConsent = await page.evaluate(() => ({
      bannerVisible: !!document.querySelector('#kawahive-cookie-banner'),
      cookieSettingsPresent: !!document.querySelector('[data-kawahive-cookie-settings]'),
      analyticsScriptLoaded: [...document.scripts].some(s => (s.src || '').includes('googletagmanager.com/gtag/js'))
    }));
    if (!entry.analyticsConsent.bannerVisible) fail('Analytics consent banner missing on first visit: ' + route);
    if (entry.analyticsConsent.analyticsScriptLoaded) fail('Google Analytics loaded before consent on ' + route);
    if (!meta.title || !meta.description || !meta.canonical || !meta.viewport) fail('Missing SEO metadata: ' + route);
    if (!meta.ogImage || !meta.twitterImage || !meta.ogSiteName) fail('Missing social sharing metadata: ' + route);
    if (meta.ogImage !== meta.twitterImage || !meta.ogImage.endsWith('.png')) fail('Social preview must use the same PNG for Open Graph and Twitter: ' + route);
    if (meta.h1 !== 1) fail('Expected exactly one H1 on ' + route + ', got ' + meta.h1);
    if (meta.canonical !== url) fail('Canonical mismatch on ' + route + ': ' + meta.canonical);
    if (entry.meta.missingAlt.length) fail('Images missing alt on ' + route);
    if (route === '/about.html' && meta.images.length) fail('About page includes images; review that no individual is presented as the public face');
    for (const raw of meta.jsonld) { try { JSON.parse(raw); } catch (e) { fail('Invalid JSON-LD on ' + route + ': ' + e.message); } }

    const links = await page.locator('a[href]').evaluateAll(as => as.map(a => ({href:a.href, text:(a.innerText || a.getAttribute('aria-label') || '').trim()})));
    for (const link of links) {
      let target;
      try { target = new URL(link.href); } catch { continue; }
      if (target.origin === new URL(base).origin) {
        const key = target.pathname + target.search;
        if (!results.internalLinks.some(x=>x.url===target.href)) {
          const check = await context.request.get(target.href, { timeout: 20000 }).catch(e=>null);
          results.internalLinks.push({from:route, url:target.href, status:check?.status() ?? null});
          if (!check || check.status() >= 400) fail('Broken internal link from ' + route + ': ' + target.href);
        }
        if (target.hash) {
          const samePage = target.pathname === route;
          const checkPage = samePage ? page : await context.newPage();
          if (!samePage) await checkPage.goto(target.href, {waitUntil:'domcontentloaded', timeout:30000}).catch(()=>null);
          const found = await checkPage.locator(target.hash).count().catch(()=>0);
          if (!found) fail('Missing internal anchor from ' + route + ': ' + target.href);
          if (!samePage) await checkPage.close();
        }
      } else if (target.protocol === 'https:' && (target.hostname.endsWith('kawahive.com') || target.hostname.endsWith('hubspot.com'))) {
        if (!results.externalLinks.some(x=>x.url===target.href)) {
          const check = await context.request.get(target.href, { timeout: 20000 }).catch(e=>null);
          results.externalLinks.push({from:route, url:target.href, status:check?.status() ?? null});
          if (!check || check.status() >= 400) fail('Linked service unavailable from ' + route + ': ' + target.href);
        }
      }
    }

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze().catch(e=>({violations:[{id:'axe-run-error',impact:'critical',description:e.message,nodes:[]}]}));
    results.accessibility.push({route, violations:axe.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.length}))});
    for (const v of axe.violations) if (v.impact === 'critical' || v.impact === 'serious') fail('Accessibility ' + v.impact + ' on ' + route + ': ' + v.id);

    if (route === '/contact.html') {
      const formContainer = page.locator('#hubspot-contact-form');
      await formContainer.waitFor({state:'attached'});
      await page.waitForFunction(() => {
        const el = document.querySelector('#hubspot-contact-form');
        return !!(el && (el.querySelector('form') || el.querySelector('iframe')));
      }, null, {timeout:30000}).catch(()=>null);
      results.form = await page.evaluate(() => {
        const el = document.querySelector('#hubspot-contact-form');
        const form = el?.querySelector('form');
        return {
          containerPresent: !!el,
          formRendered: !!form || !!el?.querySelector('iframe'),
          formCount: el?.querySelectorAll('form').length || 0,
          iframeCount: el?.querySelectorAll('iframe').length || 0,
          fields: form ? [...form.querySelectorAll('input,select,textarea')].filter(x=>!['hidden','submit'].includes((x.type||'').toLowerCase())).map(x=>({type:x.type||x.tagName.toLowerCase(),name:x.name,required:x.required,placeholder:x.placeholder})) : [],
          requiredEmailPresent: !!form?.querySelector('input[type="email"][required]')
        };
      });
      if (!results.form.formRendered) fail('HubSpot form did not render on Contact page');
      if (results.form.formRendered && results.form.formCount && !results.form.requiredEmailPresent) fail('Contact form has no required email field');
    }

    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(250);
    entry.mobile = await page.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2,
      h1Visible: !!document.querySelector('h1') && document.querySelector('h1').getBoundingClientRect().width > 0,
      navLinks: [...document.querySelectorAll('header nav a')].filter(a=>getComputedStyle(a).display!=='none').length
    }));
    if (entry.mobile.horizontalOverflow) fail('Horizontal overflow at 390px on ' + route);
    const axeMobile = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze().catch(e=>({violations:[{id:'axe-mobile-run-error',impact:'critical',description:e.message,nodes:[]}]}));
    results.accessibility.push({route, viewport:'mobile', violations:axeMobile.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.length}))});
    for (const v of axeMobile.violations) if (v.impact === 'critical' || v.impact === 'serious') fail('Mobile accessibility ' + v.impact + ' on ' + route + ': ' + v.id);
    if (!entry.mobile.h1Visible) fail('H1 not visible at 390px on ' + route);
    await page.screenshot({path:path.join('audit-results', route==='/'?'home-mobile.png':route.replaceAll('/','').replace('.html','')+'-mobile.png'), fullPage:true}).catch(()=>null);
    await page.setViewportSize({width:1440,height:1000});
    entry.desktop = { viewport: 1440, titleVisible: !!meta.title };
    results.pages.push(entry);
  }

  await browser.close();
  results.finishedAt = new Date().toISOString();
  fs.mkdirSync('audit-results',{recursive:true});
  fs.writeFileSync('audit-results/site-quality-report.json', JSON.stringify(results,null,2));
  console.log(JSON.stringify({pages:results.pages.length,internalLinks:results.internalLinks.length,externalLinks:results.externalLinks.length,form:results.form,failures:results.failures||[],report:'audit-results/site-quality-report.json'},null,2));
  if (results.failures?.length) process.exit(1);
})().catch(e=>{console.error(e);process.exit(1);});
