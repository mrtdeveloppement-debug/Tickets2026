-- =====================================================
-- Script de diagnostic pour vérifier les logs d'activité
-- =====================================================

-- 1. Vérifier si la table existe et sa structure
-- =====================================================
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'activity_logs'
ORDER BY ordinal_position;

-- 2. Compter tous les logs
-- =====================================================
SELECT 
  COUNT(*) as total_logs,
  COUNT(CASE WHEN action = 'LOGIN' THEN 1 END) as login_count,
  COUNT(CASE WHEN action = 'LOGOUT' THEN 1 END) as logout_count,
  MIN(created_at) as oldest_log,
  MAX(created_at) as newest_log
FROM activity_logs;

-- 3. Voir les 20 derniers logs LOGIN/LOGOUT
-- =====================================================
SELECT 
  id,
  user_name,
  user_email,
  action,
  description,
  created_at
FROM activity_logs
WHERE action IN ('LOGIN', 'LOGOUT')
ORDER BY created_at DESC
LIMIT 20;

-- 4. Vérifier les logs par utilisateur
-- =====================================================
SELECT 
  u.email,
  u.full_name,
  COUNT(CASE WHEN al.action = 'LOGIN' THEN 1 END) as login_count,
  COUNT(CASE WHEN al.action = 'LOGOUT' THEN 1 END) as logout_count,
  MAX(CASE WHEN al.action = 'LOGIN' THEN al.created_at END) as last_login,
  MAX(CASE WHEN al.action = 'LOGOUT' THEN al.created_at END) as last_logout
FROM users u
LEFT JOIN activity_logs al ON u.id = al.user_id AND al.action IN ('LOGIN', 'LOGOUT')
GROUP BY u.id, u.email, u.full_name
ORDER BY last_login DESC NULLS LAST;

-- 5. Vérifier les politiques RLS
-- =====================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'activity_logs';

-- 6. Tester l'insertion manuelle (remplacer USER_ID par un ID réel)
-- =====================================================
/*
INSERT INTO activity_logs (
  user_id,
  user_name,
  user_email,
  action,
  entity_type,
  entity_id,
  entity_name,
  description
) VALUES (
  'USER_ID_HERE'::uuid,
  'Test User',
  'test@example.com',
  'LOGIN',
  'user',
  'USER_ID_HERE'::uuid,
  'Test User',
  'Test de connexion manuelle'
)
RETURNING *;
*/

