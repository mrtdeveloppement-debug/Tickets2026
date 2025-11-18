-- Extend installation_status allowed values to include 'extension' and 'manque_de_materiel'

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_installation_status_check;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_installation_status_check CHECK (
    installation_status IN (
      'matériel',
      'équipe_installation',
      'installé',
      'annulé',
      'injoignable',
      'installation_impossible',
      'optimisation',
      'extension',
      'manque_de_materiel'
    )
  );
