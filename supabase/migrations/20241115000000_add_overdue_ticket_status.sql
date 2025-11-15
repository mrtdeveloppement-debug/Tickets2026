-- =====================================================
-- Cron Job: Auto-update overdue tickets to "En Retard"
-- =====================================================
-- This cron job runs every hour to check for tickets that have
-- been in 'en_cours' or 'assigné' status for more than 24 hours
-- and automatically changes their status to 'en_retard'.
-- =====================================================

-- 1. Create the function to update overdue tickets
CREATE OR REPLACE FUNCTION update_overdue_tickets()
RETURNS void AS $$
BEGIN
  -- Update tickets that are in 'en_cours' or 'assigné' status for more than 24 hours
  UPDATE tickets
  SET 
    status = 'en_retard',
    updated_at = NOW()
  WHERE status IN ('en_cours', 'assigné')
    AND updated_at < NOW() - INTERVAL '24 hours';
    
  -- Log the update for monitoring purposes
  RAISE NOTICE 'Updated % tickets to en_retard status', FOUND;
END;
$$ LANGUAGE plpgsql;

-- 2. Create a function to get overdue tickets count (for dashboard/monitoring)
CREATE OR REPLACE FUNCTION get_overdue_tickets_count()
RETURNS INTEGER AS $$
DECLARE
  overdue_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO overdue_count
  FROM tickets
  WHERE status IN ('en_cours', 'assigné')
    AND updated_at < NOW() - INTERVAL '24 hours';
    
  RETURN overdue_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Schedule the cron job to run every hour
SELECT cron.schedule(
  'update-overdue-tickets-hourly',
  '0 * * * *', -- Every hour at minute 0
  'SELECT update_overdue_tickets()'
);

-- 4. Create an index for better performance on the query
CREATE INDEX IF NOT EXISTS idx_tickets_status_updated_at 
ON tickets(status, updated_at) 
WHERE status IN ('en_cours', 'assigné');

-- 5. Add comment to document the function
COMMENT ON FUNCTION update_overdue_tickets() IS 
'Automatically updates tickets from "en_cours" or "assigné" to "en_retard" 
when they have been in those statuses for more than 24 hours without treatment.';

COMMENT ON FUNCTION get_overdue_tickets_count() IS 
'Returns the count of tickets that are overdue (in "en_cours" or "assigné" 
status for more than 24 hours).';