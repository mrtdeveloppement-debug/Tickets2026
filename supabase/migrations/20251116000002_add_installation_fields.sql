-- Add installation category and status to tickets
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'reclamation' CHECK (category IN ('reclamation','installation')),
  ADD COLUMN IF NOT EXISTS installation_status VARCHAR(30) CHECK (installation_status IN (
    'matériel',
    'équipe_installation',
    'installé',
    'annulé',
    'injoignable',
    'installation_impossible',
    'optimisation'
  ));

-- Optional index for analytics
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_installation_status ON tickets(installation_status);

