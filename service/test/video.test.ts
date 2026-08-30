import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locationText, type Schedule } from '../src/schedules.ts';
import { createZoomMeeting } from '../src/video-zoom.ts';

const baseSched: Schedule = {
  schedule_id: 'sched-1',
  owner_id: 'owner-1',
  slug: 'test-meeting',
  title: 'Strategy Session',
  owner_timezone: 'America/Chicago',
  owner_name: 'Test Host',
  duration_minutes: 30,
  granularity_minutes: 15,
  buffer_before_minutes: 0,
  buffer_after_minutes: 5,
  minimum_notice_minutes: 240,
  maximum_horizon_days: 60,
  max_bookings_per_day: null,
  max_bookings_per_week: null,
  max_bookings_per_month: null,
  max_minutes_per_day: null,
  max_minutes_per_week: null,
  availability_set_id: null,
  description: 'Team call',
  color: '#1a56db',
  location_kind: 'meet',
  location_value: null,
  available_from: null,
  available_until: null,
  scheduling_kind: 'solo',
  recurrence_rule: null,
  require_email_verification: false,
  org_id: null,
};

test('locationText renders appropriate descriptions for all video call providers', () => {
  // Google Meet
  assert.equal(
    locationText({ ...baseSched, location_kind: 'meet' }, 'https://meet.google.com/abc-defg-hij'),
    'https://meet.google.com/abc-defg-hij',
  );
  assert.equal(
    locationText({ ...baseSched, location_kind: 'meet' }),
    'Google Meet — link arrives with the confirmation',
  );

  // Microsoft Teams
  assert.equal(
    locationText({ ...baseSched, location_kind: 'teams' }, 'https://teams.microsoft.com/l/meetup-join/xyz'),
    'https://teams.microsoft.com/l/meetup-join/xyz',
  );
  assert.equal(
    locationText({ ...baseSched, location_kind: 'teams' }),
    'Microsoft Teams — link arrives with the confirmation',
  );

  // Zoom with static URL
  assert.equal(
    locationText({ ...baseSched, location_kind: 'zoom', location_value: 'https://us02web.zoom.us/j/1234567890' }),
    'Zoom — https://us02web.zoom.us/j/1234567890',
  );

  // Zoom with dynamic URL
  assert.equal(
    locationText({ ...baseSched, location_kind: 'zoom' }, 'https://us02web.zoom.us/j/9876543210'),
    'https://us02web.zoom.us/j/9876543210',
  );

  // Google Chat
  assert.equal(
    locationText({ ...baseSched, location_kind: 'google_chat', location_value: 'https://chat.google.com/room/AAA' }),
    'Google Chat Space — https://chat.google.com/room/AAA',
  );
});

test('createZoomMeeting handles missing credentials gracefully without throwing', async () => {
  const res = await createZoomMeeting({
    topic: 'Test Meeting',
    startTime: '2026-09-01T15:00:00Z',
    durationMinutes: 30,
    timezone: 'America/Chicago',
  }, {});

  assert.equal(res, null);
});
