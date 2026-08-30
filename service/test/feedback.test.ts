import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFeedbackMarkdown, submitFeedback } from '../src/feedback.ts';

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
  });

  assert.ok(formatted.title.includes('[Feedback] 🐛 Bug: When clicking on 2:00 PM slot'));
  assert.ok(formatted.labels.includes('bug'));
  assert.ok(formatted.labels.includes('feedback'));
  assert.ok(formatted.body.includes('user@example.com'));
  assert.ok(formatted.body.includes('REDACTED'), 'Secret token should be redacted from URL');
  assert.ok(!formatted.body.includes('SECRET_TOKEN_123'), 'Secret value must not appear in output');
  assert.ok(formatted.body.includes('Uncaught TypeError: cannot read properties of null'));
  assert.ok(formatted.body.includes('<img src="data:image/png;base64,'), 'Screenshot is embedded in markdown');
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
