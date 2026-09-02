-- Phase 2: a no-show is a booking lifecycle event, not merely a reporting bit.
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_trigger_check;
ALTER TABLE workflows ADD CONSTRAINT workflows_trigger_check CHECK (trigger IN
  ('booking_created', 'booking_cancelled', 'booking_rescheduled',
   'booking_no_show', 'before_event', 'after_event'));
