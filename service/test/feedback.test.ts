import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFeedbackMarkdown, submitFeedback } from '../src/feedback.ts';
import { homePage } from '../src/pages.ts';

test('GitHub #34 · feedback never auto-attaches a synthetic or racing DOM capture', () => {
  const html = homePage();
  assert.ok(html.includes('For an accurate image, choose Capture Screen'));
  assert.ok(html.includes('id="pf-include-shot">'), 'attachment starts unchecked');
  assert.ok(!html.includes('html2canvas'), 'the unreliable DOM renderer is not loaded');
  assert.equal((html.match(/addEventListener\('click', openModal\)/g) ?? []).length, 1,
    'one click starts one modal-open cycle');
});

test('formatFeedbackMarkdown formats markdown with diagnostics, errors, and sanitized URLs', () => {
  const formatted = formatFeedbackMarkdown({
    type: 'bug',
    description: 'When clicking on 2:00 PM slot, the page showed an unexpected dialog.',
    email: 'user@example.com',
    url: 'https://booking.pumasi.ai/sarah/30min?token=SECRET_TOKEN_123&other=test',
    viewport: '1440x900',
    timezone: 'America/Chicago',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    errors: [
      {
        message: 'Uncaught TypeError: cannot read properties of null',
        source: 'https://booking.pumasi.ai/app.js',
        lineno: 42,
        colno: 10,
        timestamp: '2026-08-30T05:15:00Z',
      },
    ],
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  }, 'https://raw.githubusercontent.com/pumasi-ai/pumasi-booking/main/.github/feedback-attachments/20260830-shot-123.png');

  assert.ok(formatted.title.includes('[Feedback] 🐛 Bug: When clicking on 2:00 PM slot'));
  assert.ok(formatted.labels.includes('bug'));
  assert.ok(formatted.labels.includes('feedback'));
  assert.ok(formatted.body.includes('user@example.com'));
  assert.ok(formatted.body.includes('REDACTED'), 'Secret token should be redacted from URL');
  assert.ok(!formatted.body.includes('SECRET_TOKEN_123'), 'Secret value must not appear in output');
  assert.ok(formatted.body.includes('Uncaught TypeError: cannot read properties of null'));
  assert.ok(formatted.body.includes('![User Feedback Screenshot](https://raw.githubusercontent.com/'), 'Screenshot URL is embedded as Markdown image');
});

test('submitFeedback refuses empty description', async () => {
  const res = await submitFeedback({
    type: 'general',
    description: '   ',
  });
  assert.equal(res.ok, false);
  assert.ok(res.error?.includes('cannot be empty'));
});

test('submitFeedback succeeds in local mode without GitHub token', async () => {
  const res = await submitFeedback({
    type: 'feature',
    description: 'Add support for custom webhook headers.',
    email: 'admin@pumasi.ai',
  });
  assert.equal(res.ok, true);
  assert.ok(res.issueUrl?.includes('github.com/pumasi-ai/pumasi-booking/issues'));
});

/**
 * SPEC-0008 §S3 — the report does not invite a reader to conflate two
 * surfaces. Issue #32 is the worked example: `Reported From` read
 * `/app/event/<id>` while the attached image showed `/yunyoungmok/abc`.
 * Neither value was wrong — the widget reports `location.href` of the page it
 * ran on, and the image comes from `getDisplayMedia`, where the person chooses
 * which tab or window to share. The defect was that nothing said so.
 */
test('the report names the page the widget ran on, and says the image may differ', () => {
  const withShot = formatFeedbackMarkdown({
    type: 'bug',
    description: 'i cannot see specific times',
    url: 'https://booking.pumasi.ai/app/event/06f1bfbc-46f0-407f-ba64-47bca20f0dba',
  }, 'https://raw.githubusercontent.com/pumasi-ai/pumasi-booking/main/x.png');

  assert.ok(
    withShot.body.includes('**Reported From**'),
    'the field is named for what it actually holds — the page the widget ran on',
  );
  assert.ok(
    !withShot.body.includes('**Page URL**'),
    'and not for what a reader would take as the page in the screenshot',
  );
  assert.ok(
    withShot.body.includes('may show a different tab or window'),
    'the disagreement issue #32 produced is stated where the image is',
  );

  const noShot = formatFeedbackMarkdown({
    type: 'bug',
    description: 'i cannot see specific times',
    url: 'https://booking.pumasi.ai/app/event/06f1bfbc-46f0-407f-ba64-47bca20f0dba',
  }, null);
  assert.ok(noShot.body.includes('**Reported From**'), 'the field is there either way');
  assert.ok(
    !noShot.body.includes('may show a different tab or window'),
    'the caveat appears only where there is an image to caveat',
  );
});
