/**
 * In-App Feedback & Bug Reporting Service.
 *
 * Captures user feedback, screenshot, runtime diagnostics, and creates a GitHub
 * issue on https://github.com/pumasi-ai/pumasi-booking with full transparency
 * and sanitized diagnostic context.
 */

export interface FeedbackDiagnosticError {
  message: string;
  source?: string;
  lineno?: number;
  colno?: number;
  timestamp?: string;
}

export interface FeedbackPayload {
  type: 'bug' | 'feature' | 'general';
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

export function formatFeedbackMarkdown(payload: FeedbackPayload): { title: string; body: string; labels: string[] } {
  const typeIcons: Record<string, string> = {
    bug: '🐛 Bug',
    feature: '✨ Feature Request',
    general: '💬 Feedback',
  };

  const typeName = typeIcons[payload.type] ?? '💬 Feedback';
  const summary = (payload.description || 'User feedback').slice(0, 70).replace(/\n/g, ' ');
  const issueTitle = payload.title?.trim() || `[Feedback] ${typeName}: ${summary}${payload.description.length > 70 ? '...' : ''}`;

  const labels = ['feedback'];
  if (payload.type === 'bug') labels.push('bug');
  else if (payload.type === 'feature') labels.push('enhancement');
  else labels.push('triage');

  const errorLines = (payload.errors ?? [])
    .map((e) => `- \`${e.timestamp || ''}\` **${e.message}** (${e.source || 'inline'}:${e.lineno || 0}:${e.colno || 0})`)
    .join('\n');

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
| **Page URL** | \`${sanitizeUrl(payload.url)}\` |
| **User Agent** | \`${payload.userAgent || 'Unknown'}\` |
| **Viewport** | \`${payload.viewport || 'Unknown'}\` |
| **Timezone** | \`${payload.timezone || 'UTC'}\` |
| **Network Online** | \`${payload.online !== false ? 'Yes' : 'No'}\` |
| **Client Errors** | \`${payload.errors?.length ?? 0} error(s) captured\` |
`;

  if (payload.errors && payload.errors.length > 0) {
    body += `\n<details>\n<summary><b>Recent Client-Side Console Errors (${payload.errors.length})</b></summary>\n\n${errorLines}\n</details>\n`;
  }

  if (payload.screenshot && payload.screenshot.startsWith('data:image/')) {
    body += `\n---
### Attached Screenshot
<details open>
<summary><b>View Screenshot</b></summary>

<img src="${payload.screenshot}" alt="User Screenshot" style="max-width:100%;border-radius:8px;border:1px solid #e4e7ec;margin-top:8px;" />
</details>
`;
  }

  return { title: issueTitle, body, labels };
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
  const { title, body, labels } = formatFeedbackMarkdown(payload);

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
