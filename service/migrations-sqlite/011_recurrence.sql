-- Recurring bookings — an RFC 5545 RRULE on the event type.
--
-- The rule is stored as the standard writes it ('FREQ=WEEKLY;COUNT=4'), parsed
-- by a library rather than by us (DUPLICATION.md §5.1 forbids hand-rolling an
-- expander). A booker may take the series or a single meeting; the series is
-- one group_id, which is how cancelling it cancels all of it.

ALTER TABLE schedules ADD COLUMN recurrence_rule TEXT;
