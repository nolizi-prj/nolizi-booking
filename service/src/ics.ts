/**
 * P3 — a booking as an iCalendar object (RFC 5545), attached to the
 * confirmation so any calendar can swallow it. METHOD:PUBLISH, one VEVENT,
 * UTC instants only — the recipient's calendar renders local time itself.
 */

const escapeText = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const stamp = (iso: string): string => iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export function icsFor(opts: {
  bookingId: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pumasi Booking//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.bookingId}@booking.pumasi.ai`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(opts.start)}`,
    `DTEND:${stamp(opts.end)}`,
    `SUMMARY:${escapeText(opts.title)}`,
    ...(opts.location ? [`LOCATION:${escapeText(opts.location)}`] : []),
    ...(opts.description ? [`DESCRIPTION:${escapeText(opts.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}
