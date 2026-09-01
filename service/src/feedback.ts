/**
 * In-App Feedback & Bug Reporting Service.
 *
 * Captures user feedback, screenshot, runtime diagnostics, and creates a GitHub
 * issue on https://github.com/pumasi-ai/pumasi-booking with full transparency
 * and sanitized diagnostic context.
 */

import { VERSION } from './version.ts';

export interface FeedbackDiagnosticError {
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  timestamp?: string;
}

export interface FeedbackPayload {
  type: 'bug' | 'feature' | 'general';
  /**
   * PR-1 · the build the reporter was actually looking at. The widget renders
   * it from this server's own `VERSION` and shows it in the "Included
   * Diagnostics" panel before submit, so it is not a hidden field appended
   * after consent (PR-2). Optional because the API accepts reports that were
   * not composed by the widget; those fall back to this process's VERSION.
   */
  version?: string;
  title?: string;
  description: string;
  email?: string;
  url?: string;
  viewport?: string;
  timezone?: string;
  userAgent?: string;
  online?: boolean;
  errors?: FeedbackDiagnosticError[];
  screenshot?: string; // base64 data URL
  attachmentName?: string;
}

export interface FeedbackResult {
  ok: boolean;
  issueUrl?: string;
  issueNumber?: number;
  message?: string;
  error?: string;
}

/** Sanitize URL to strip sensitive tokens or cookies */
function sanitizeUrl(rawUrl?: string): string {
  if (!rawUrl) return 'N/A';
  try {
    const u = new URL(rawUrl);
    for (const key of Array.from(u.searchParams.keys())) {
      if (/token|state|code|session|secret|key|auth/i.test(key)) {
        u.searchParams.set(key, 'REDACTED');
      }
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * PR-1 · the version the report concerns. The widget sends this server's own
 * VERSION back, so the value is normally already correct; it is still checked
 * against a version shape rather than pasted, because everything on the client
 * side of this payload is attacker-controlled and this one ends up inside a
 * GitHub issue body. Anything that is not a version falls back to the version
 * this process is actually running, which is never a guess.
 */
function reportedVersion(reported?: string): string {
  const v = reported?.trim() ?? '';
  return /^[0-9A-Za-z.+-]{1,32}$/.test(v) ? v : VERSION;
}

export function formatFeedbackMarkdown(
  payload: FeedbackPayload,
  screenshotUrl?: string | null,
): { title: string; body: string; labels: string[] } {
  const typeIcons: Record<string, string> = {
    bug: '🐛 Bug',
    feature: '✨ Feature Request',
    general: '💬 Feedback',
  };

  const typeLabel = (payload.type || 'general').toLowerCase();
  const typeName = typeIcons[typeLabel] || '💬 Feedback';
  const issueLabels = ['feedback'];
  if (typeLabel === 'bug') issueLabels.push('bug');
  if (typeLabel === 'feature') issueLabels.push('enhancement');

  const firstLine = payload.description.trim().split('\n')[0] ?? 'New Feedback';
  const truncatedSummary = firstLine.length > 70 ? firstLine.slice(0, 67) + '...' : firstLine;
  const issueTitle = `[Feedback] ${typeName}: ${truncatedSummary}`;

  let errorLines = '';
  if (payload.errors && payload.errors.length > 0) {
    errorLines = payload.errors
      .slice(-5)
      .map((e) => `- \`${e.timestamp}\`: **${e.message}** (${e.source ?? 'unknown'}:${e.lineno ?? '?'}:${e.colno ?? '?'})`)
      .join('\n');
  }

  let body = `### Feedback Description
${payload.description}

---

### Submitter Info
- **Type**: ${typeName}
- **Contact Email**: ${payload.email?.trim() ? `\`${payload.email.trim()}\`` : '_None provided_'}
- **Submitted At**: \`${new Date().toISOString()}\`

---

### Diagnostic Environment (Client-Side)
| Key | Value |
| :--- | :--- |
| **Product Version** | \`${reportedVersion(payload.version)}\` |
| **Reported From** | \`${sanitizeUrl(payload.url)}\` |
| **User Agent** | \`${payload.userAgent || 'Unknown'}\` |
| **Viewport** | \`${payload.viewport || 'Unknown'}\` |
| **Timezone** | \`${payload.timezone || 'UTC'}\` |
| **Network Online** | \`${payload.online !== false ? 'Yes' : 'No'}\` |
| **Client Errors** | \`${payload.errors?.length ?? 0} error(s) captured\` |
`;

  if (payload.errors && payload.errors.length > 0) {
    body += `\n<details>\n<summary><b>Recent Client-Side Console Errors (${payload.errors.length})</b></summary>\n\n${errorLines}\n</details>\n`;
  }

  if (screenshotUrl) {
    // The screenshot and "Reported From" can legitimately disagree, and issue
    // #32 is the worked example: the field said `/app/event/<id>` while the
    // image showed `/yunyoungmok/abc`. Neither was wrong. `Reported From` is
    // `location.href` of the page the widget ran on, and the image comes from
    // `getDisplayMedia`, where the browser lets the person choose which tab,
    // window or screen to share — `preferCurrentTab` is a hint, not a
    // constraint. A reader who assumes they must match goes to the wrong page,
    // so the report says so rather than leaving it to be rediscovered.
    body += `\n---
### Attached Screenshot
<details open>
<summary><b>View Screenshot</b> (<a href="${screenshotUrl}" target="_blank" rel="noopener">Open full-resolution image ↗</a>)</summary>

![User Feedback Screenshot](${screenshotUrl})
</details>

> The image is a screen capture and may show a different tab or window from
> **Reported From** above, which is the page the feedback widget itself ran on.
`;
  }

  return { title: issueTitle, body, labels: issueLabels };
}

/** Upload base64 image directly to GitHub repository so GitHub natively renders it */
async function uploadScreenshotToGithub(
  base64DataUrl: string,
  repo: string,
  token: string,
): Promise<string | null> {
  try {
    const match = base64DataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!match || !match[1] || !match[2]) return null;

    let ext = match[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    const content = match[2];

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 8);
    const filePath = `.github/feedback-attachments/${dateStr}-shot-${rand}.${ext}`;

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        'authorization': `Bearer ${token}`,
        'accept': 'application/vnd.github.v3+json',
        'user-agent': 'pumasi-feedback-bot/1.0',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: `feedback: attach screenshot ${filePath}`,
        content,
        branch: 'main',
      }),
    });

    if (!res.ok) {
      console.warn(`[feedback] Failed to upload screenshot to GitHub (${res.status}):`, await res.text());
      return null;
    }

    const data = (await res.json()) as { content?: { download_url?: string } };
    return data.content?.download_url || `https://raw.githubusercontent.com/${repo}/main/${filePath}`;
  } catch (err) {
    console.warn('[feedback] Exception uploading screenshot to GitHub:', err);
    return null;
  }
}

export async function submitFeedback(
  payload: FeedbackPayload,
  opts: {
    githubToken?: string;
    repo?: string;
  } = {},
): Promise<FeedbackResult> {
  const desc = (payload.description ?? '').trim();
  if (!desc) {
    return { ok: false, error: 'Feedback description cannot be empty.' };
  }

  const repo = opts.repo || 'pumasi-ai/pumasi-booking';
  const token = opts.githubToken;

  let screenshotUrl: string | null = null;
  if (token && payload.screenshot && payload.screenshot.startsWith('data:image/')) {
    screenshotUrl = await uploadScreenshotToGithub(payload.screenshot, repo, token);
  }

  const { title, body, labels } = formatFeedbackMarkdown(payload, screenshotUrl);

  if (!token) {
    console.log(`[feedback] (No GitHub token configured) Recorded feedback: "${title}" from ${payload.email || 'anonymous'}`);
    return {
      ok: true,
      issueUrl: `https://github.com/${repo}/issues`,
      message: 'Feedback received and recorded.',
    };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${token}`,
        'accept': 'application/vnd.github.v3+json',
        'user-agent': 'pumasi-feedback-bot/1.0',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body,
        labels,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[feedback] GitHub issue creation failed (${res.status}): ${errText}`);
      return {
        ok: false,
        error: `GitHub API error (${res.status}). Feedback logged locally.`,
        issueUrl: `https://github.com/${repo}/issues`,
      };
    }

    const data = (await res.json()) as { html_url: string; number: number };
    return {
      ok: true,
      issueUrl: data.html_url,
      issueNumber: data.number,
      message: `Issue #${data.number} created successfully!`,
    };
  } catch (err) {
    console.error(`[feedback] Exception creating GitHub issue:`, err);
    return {
      ok: false,
      error: `Network failure while posting issue.`,
      issueUrl: `https://github.com/${repo}/issues`,
    };
  }
}
