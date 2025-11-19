-- =====================================================
-- Migration 008: Fix user deletion and add access control
-- =====================================================

-- 1. Fix foreign key constraint in login_history
-- =====================================================
-- Drop the existing foreign key constraint
ALTER TABLE login_history 
  DROP CONSTRAINT IF EXISTS login_history_user_id_fkey;

-- Recreate with ON DELETE CASCADE to allow user deletion
ALTER TABLE login_history 
  ADD CONSTRAINT login_history_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

-- 2. Add access control fields to users table
-- =====================================================
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS can_access_installation BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_access_reclamation BOOLEAN DEFAULT true;

-- Set default values for existing users
UPDATE users 
SET 
  can_access_installation = true,
  can_access_reclamation = true
WHERE can_access_installation IS NULL OR can_access_reclamation IS NULL;

-- Add comments
COMMENT ON COLUMN users.can_access_installation IS 'Permet l''accès à la page Installation';
COMMENT ON COLUMN users.can_access_reclamation IS 'Permet l''accès à la page Réclamation';

