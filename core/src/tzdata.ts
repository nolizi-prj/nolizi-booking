/**
 * SPEC-0001 §6 — mandatory environment declaration.
 *
 * This suite is not a function of the implementation alone. It depends on the
 * IANA tzdata version, which changes offsets for historical and future dates,
 * so identical code passes on one machine and fails on another. That is not a
 * flake; it is a category of test whose truth is environment-relative.
 *
 * Callers assert the version and fail loudly. A skip is not acceptable — a
 * silently skipped timezone test is worse than a failing one.
 */

export const PINNED_TZDATA = '2026a';

export function runtimeTzdataVersion(): string | undefined {
  return (process as NodeJS.Process & { versions: { tz?: string } }).versions.tz;
}

export interface TzdataCheck {
  pinned: string;
  runtime: string | undefined;
  matches: boolean;
}

export function checkTzdata(): TzdataCheck {
  const runtime = runtimeTzdataVersion();
  return { pinned: PINNED_TZDATA, runtime, matches: runtime === PINNED_TZDATA };
}

/**
 * The transitions this suite's expected values actually depend on.
 *
 * A version label is a proxy for what we care about. tzdata releases several
 * times a year and most changes touch zones this suite never names, so a label
 * mismatch is a weak signal — while a label MATCH would not prove these
 * transitions are what we think they are either.
 *
 * Asserting the transitions directly is stricter in the way that matters and
 * looser in the way that does not.
 */
export interface Transition {
  zone: string;
  local: string;
  expect: 'nonexistent' | 'ambiguous' | 'normal';
  note: string;
}

export const REQUIRED_TRANSITIONS: readonly Transition[] = [
  { zone: 'America/New_York', local: '2026-03-08T02:30', expect: 'nonexistent', note: 'spring forward — S3, cases C-008, C-023' },
  { zone: 'America/New_York', local: '2026-11-01T01:30', expect: 'ambiguous', note: 'fall back — S4, case C-009' },
  { zone: 'America/New_York', local: '2026-06-01T09:00', expect: 'normal', note: 'baseline EDT — most slot cases' },
  { zone: 'Australia/Sydney', local: '2026-06-15T09:00', expect: 'normal', note: 'southern hemisphere — case C-017' },
  { zone: 'Pacific/Kiritimati', local: '2026-06-01T09:00', expect: 'normal', note: 'UTC+14 date crossing — case C-018' },
  { zone: 'Pacific/Apia', local: '2011-12-30T12:00', expect: 'nonexistent', note: 'skipped calendar day — case C-022' },
];

export interface TransitionResult extends Transition {
  actual: string;
  ok: boolean;
}

/**
 * Verify every transition the suite relies on. A failure here means the host's
 * timezone database genuinely disagrees with the suite, and no expected value
 * in it can be trusted — that is a hard stop, not a finding.
 */
export function checkTransitions(
  classify: (zone: string, date: string, time: string) => { kind: string },
): TransitionResult[] {
  return REQUIRED_TRANSITIONS.map((t) => {
    const [date, time] = t.local.split('T') as [string, string];
    let actual: string;
    try {
      actual = classify(t.zone, date, time).kind;
    } catch (err) {
      actual = `threw ${(err as Error).message}`;
    }
    return { ...t, actual, ok: actual === t.expect };
  });
}
