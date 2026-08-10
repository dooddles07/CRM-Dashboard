-- docs/DATABASE.md §2.5, verbatim. Requires `follow_ups` (generated
-- migration). Storing `overdue` would need a nightly job to keep it true;
-- deriving it cannot go stale.

CREATE VIEW follow_ups_with_status AS
SELECT f.*,
  CASE WHEN f.completed_at IS NOT NULL THEN 'completed'
       WHEN f.due_date < CURRENT_DATE  THEN 'overdue'
       WHEN f.due_date = CURRENT_DATE  THEN 'pending'
       ELSE 'scheduled' END AS status
FROM follow_ups f;
