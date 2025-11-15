-- =====================================================
-- RIMATEL SA - User Region Assignments
-- Migration 20241115000002
-- =====================================================

-- =====================================================
-- 1. CRÉER LA TABLE DES RÉGIONS ASSIGNÉES AUX UTILISATEURS
-- =====================================================
CREATE TABLE IF NOT EXISTS user_regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, region_id)
);

-- =====================================================
-- 2. CRÉER LA TABLE DES WILAYAS ASSIGNÉES AUX UTILISATEURS
-- =====================================================
CREATE TABLE IF NOT EXISTS user_wilayas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wilaya_code VARCHAR(20) NOT NULL REFERENCES wilayas(code) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, wilaya_code)
);

-- =====================================================
-- 3. INDEXES POUR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_user_regions_user ON user_regions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_regions_region ON user_regions(region_id);
CREATE INDEX IF NOT EXISTS idx_user_wilayas_user ON user_wilayas(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wilayas_wilaya ON user_wilayas(wilaya_code);

-- =====================================================
-- 4. RLS POLICIES POUR LES TABLES D'ASSIGNATION
-- =====================================================

-- User Regions - Admins peuvent tout faire
ALTER TABLE user_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage user regions"
  ON user_regions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view their own regions"
  ON user_regions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- User Wilayas - Admins peuvent tout faire
ALTER TABLE user_wilayas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage user wilayas"
  ON user_wilayas FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can view their own wilayas"
  ON user_wilayas FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- 5. FONCTIONS POUR VÉRIFIER L'ACCÈS BASÉ SUR LES RÉGIONS
-- =====================================================

-- Fonction pour vérifier si un utilisateur peut voir un ticket basé sur les wilayas
CREATE OR REPLACE FUNCTION can_user_view_ticket_by_wilaya(ticket_wilaya_code VARCHAR, user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin et user normal peuvent tout voir
  IF EXISTS (SELECT 1 FROM users WHERE users.id = user_id AND users.role IN ('admin', 'user')) THEN
    RETURN true;
  END IF;
  
  -- Pour les techniciens et autres rôles, vérifier l'assignation de wilaya
  RETURN EXISTS (
    SELECT 1 FROM user_wilayas 
    WHERE user_wilayas.user_id = user_id 
    AND user_wilayas.wilaya_code = ticket_wilaya_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour vérifier si un utilisateur peut voir un ticket basé sur les régions (NKC)
CREATE OR REPLACE FUNCTION can_user_view_ticket_by_region(ticket_region_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin et user normal peuvent tout voir
  IF EXISTS (SELECT 1 FROM users WHERE users.id = user_id AND users.role IN ('admin', 'user')) THEN
    RETURN true;
  END IF;
  
  -- Pour les techniciens et autres rôles, vérifier l'assignation de région
  -- Si le ticket n'a pas de région (non-NKC), retourner true
  IF ticket_region_id IS NULL THEN
    RETURN true;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM user_regions 
    WHERE user_regions.user_id = user_id 
    AND user_regions.region_id = ticket_region_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. METTRE À JOUR LES RLS POLICIES DES TICKETS
-- =====================================================

-- Supprimer l'ancienne policy basée sur les services
DROP POLICY IF EXISTS "Users can view tickets based on role" ON tickets;

-- Nouvelle policy combinée : accès basé sur les rôles, services, wilayas et régions
CREATE POLICY "Users can view tickets based on role and assignments"
  ON tickets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND (
        -- Admin et user normal peuvent tout voir
        users.role IN ('admin', 'user')
        OR (
          -- Technicien : doit avoir l'assignation de service ET (wilaya ou région)
          users.role = 'technicien' 
          AND can_technician_view_ticket(tickets.subscription_type, auth.uid())
          AND (
            -- Pour NKC : vérifier l'accès par région
            (tickets.wilaya_code = 'NKC' AND can_user_view_ticket_by_region(tickets.region_id, auth.uid()))
            -- Pour autres wilayas : vérifier l'accès par wilaya
            OR (tickets.wilaya_code != 'NKC' AND can_user_view_ticket_by_wilaya(tickets.wilaya_code, auth.uid()))
          )
        )
        OR (
          -- Autres rôles : vérifier l'accès par wilaya/région uniquement
          users.role NOT IN ('admin', 'user', 'technicien')
          AND (
            (tickets.wilaya_code = 'NKC' AND can_user_view_ticket_by_region(tickets.region_id, auth.uid()))
            OR (tickets.wilaya_code != 'NKC' AND can_user_view_ticket_by_wilaya(tickets.wilaya_code, auth.uid()))
          )
        )
      )
    )
  );

-- =====================================================
-- 7. CRÉER DES FONCTIONS POUR GÉRER LES ASSIGNATIONS
-- =====================================================

-- Fonction pour assigner une wilaya à un utilisateur
CREATE OR REPLACE FUNCTION assign_wilaya_to_user(
  target_user_id UUID,
  wilaya_code VARCHAR,
  assigned_by_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_wilayas (user_id, wilaya_code, assigned_by)
  VALUES (target_user_id, wilaya_code, assigned_by_user_id)
  ON CONFLICT (user_id, wilaya_code) 
  DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour assigner une région à un utilisateur
CREATE OR REPLACE FUNCTION assign_region_to_user(
  target_user_id UUID,
  region_id UUID,
  assigned_by_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_regions (user_id, region_id, assigned_by)
  VALUES (target_user_id, region_id, assigned_by_user_id)
  ON CONFLICT (user_id, region_id) 
  DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TERMINÉ
-- =====================================================