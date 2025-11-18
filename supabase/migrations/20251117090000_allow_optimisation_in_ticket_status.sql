-- Allow 'optimisation' as a valid value for tickets.status
-- Drop old CHECK constraint and recreate it including 'optimisation'

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_status_check CHECK (
    status IN (
      'nouveau',
      'assigné',
      'paiement',
      'en_cours',
      'injoignable',
      'en_retard',
      'fermé',
      'optimisation'
    )
  );

COMMENT ON CONSTRAINT tickets_status_check ON tickets IS 'Allowed statuses updated to include optimisation';
