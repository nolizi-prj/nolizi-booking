import { test } from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

test('Live Browser Test: Home Page, Login Page, and SSO Redirects', async () => {
  const baseUrl = 'https://booking.nolizi.com';
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // 1. Visit Live Home Page
    const homeRes = await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' });
    assert.equal(homeRes?.status(), 200, 'Home page returns 200 OK');
    const homeTitle = await page.title();
    assert.ok(homeTitle.includes('Pumasi Booking'), 'Home title contains Pumasi Booking');

    // Check Hero and CTA buttons
    const heroHeadline = await page.$eval('h1', el => el.textContent);
    assert.ok(heroHeadline?.includes('Open-source scheduling') || heroHeadline?.includes('absolute truth'), 'Hero headline rendered');

    // 2. Visit Live Login Page
    const loginRes = await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' });
    assert.equal(loginRes?.status(), 200, 'Login page returns 200 OK');

    const ssoButtons = await page.$$eval('.sso-btn', btns => btns.map(b => b.textContent?.trim()));
    console.log('Detected live SSO buttons:', ssoButtons);
    assert.ok(ssoButtons.some(b => b?.includes('Google')), 'Google SSO button is present');
    assert.ok(ssoButtons.some(b => b?.includes('Microsoft')), 'Microsoft SSO button is present');

    // 3. Test Google SSO Click & Redirect
    console.log('Testing Google SSO redirect in real browser...');
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('.sso-google'),
    ]);
    const googleUrl = page.url();
    console.log('Redirected to Google OAuth URL:', googleUrl);
    assert.ok(googleUrl.includes('accounts.google.com'), 'Redirects to accounts.google.com');
    assert.ok(googleUrl.includes('client_id=191845877480-b7bt1gae3i0a2hcvnodr8i1mis8f76q2'), 'Includes Google Client ID');
    assert.ok(googleUrl.includes('redirect_uri=https%3A%2F%2Fbooking.nolizi.com%2Foauth%2Fgoogle%2Fcallback'), 'Includes Google Callback');

    // 4. Test Microsoft SSO Click & Redirect
    console.log('Testing Microsoft SSO redirect in real browser...');
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('.sso-ms'),
    ]);
    const msUrl = page.url();
    console.log('Redirected to Microsoft OAuth URL:', msUrl);
    assert.ok(msUrl.includes('login.microsoftonline.com'), 'Redirects to login.microsoftonline.com');
    assert.ok(msUrl.includes('client_id=5420636b-e46c-429a-aefc-82aa706eef91'), 'Includes Microsoft Client ID');
    assert.ok(msUrl.includes('redirect_uri=https%3A%2F%2Fbooking.nolizi.com%2Foauth%2Fmicrosoft%2Fcallback'), 'Includes Microsoft Callback');

    // 5. Test Live Magic Link Form Submission
    console.log('Testing magic link form submission in real browser...');
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle2' });
    await page.type('#e', 'test-browser@pumasi.ai');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('.submit'),
    ]);
    const sentBody = await page.content();
    assert.ok(sentBody.includes('Check your email') || sentBody.includes('sign-in link is on its way'), 'Renders sent state');
    console.log('Magic link form flow passed!');

    // 6. Test Feedback Widget & Modal
    console.log('Testing Feedback button and modal in real browser...');
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' });
    const feedbackBtn = await page.$('#pf-open-btn');
    assert.ok(feedbackBtn, 'Feedback button is present in DOM');
    await page.click('#pf-open-btn');

    await page.waitForSelector('#pf-modal:not([hidden])', { visible: true });
    const diagContent = await page.$eval('#pf-diag-view', el => el.textContent);
    assert.ok(diagContent?.includes('timezone'), 'Diagnostics rendered in feedback modal');

    // Fill feedback form fields
    await page.type('#pf-desc', 'Browser test feedback form validation.');
    await page.type('#pf-email', 'e2e-tester@pumasi.ai');

    // Test cancel/close to verify UI cycle without polluting production GitHub issues
    await page.click('#pf-cancel-btn');
    await page.waitForFunction("!document.getElementById('pf-modal') || document.getElementById('pf-modal').hidden || document.getElementById('pf-modal').style.display === 'none'");
    console.log('Feedback modal opened, validated, and closed cleanly.');

    // 7. Test Live Health and Ready Endpoints
    await page.goto(`${baseUrl}/readyz`);
    const readyJson = JSON.parse(await page.$eval('body', el => el.textContent || '{}'));
    console.log('Live readyz response:', readyJson);
    assert.equal(readyJson.status, 'ready');

  } finally {
    await browser.close();
  }
});
