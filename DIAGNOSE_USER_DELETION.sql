-- =====================================================
-- Script de diagnostic pour identifier les contraintes
-- qui bloquent la suppression d'un utilisateur
-- =====================================================
-- Remplacez 'user_5' par le username de l'utilisateur à diagnostiquer

-- 1. Trouver l'ID de l'utilisateur
-- =====================================================
SELECT 
  id,
  username,
  email,
  full_name,
  role
FROM users
WHERE username = 'user_5';

-- 2. Vérifier toutes les références à cet utilisateur
-- =====================================================
-- Remplacez 'USER_ID_HERE' par l'ID trouvé ci-dessus

-- Tickets créés par cet utilisateur
SELECT 'tickets (created_by)' as table_name, COUNT(*) as count
FROM tickets
WHERE created_by = 'USER_ID_HERE'  -- Remplacez par l'ID réel
UNION ALL

-- Tickets assignés à cet utilisateur
SELECT 'tickets (assigned_to)', COUNT(*)
FROM tickets
WHERE assigned_to = 'USER_ID_HERE'
UNION ALL

-- Historique des tickets modifiés par cet utilisateur
SELECT 'ticket_history (changed_by)', COUNT(*)
FROM ticket_history
WHERE changed_by = 'USER_ID_HERE'
UNION ALL

-- Historique de connexion
SELECT 'login_history', COUNT(*)
FROM login_history
WHERE user_id = 'USER_ID_HERE'
UNION ALL

-- Services assignés (si technicien)
SELECT 'technician_services (user_id)', COUNT(*)
FROM technician_services
WHERE user_id = 'USER_ID_HERE'
UNION ALL

-- Services assignés par cet utilisateur
SELECT 'technician_services (assigned_by)', COUNT(*)
FROM technician_services
WHERE assigned_by = 'USER_ID_HERE'
UNION ALL

-- Wilayas assignées
SELECT 'user_wilayas (user_id)', COUNT(*)
FROM user_wilayas
WHERE user_id = 'USER_ID_HERE'
UNION ALL

-- Wilayas assignées par cet utilisateur
SELECT 'user_wilayas (assigned_by)', COUNT(*)
FROM user_wilayas
WHERE assigned_by = 'USER_ID_HERE'
UNION ALL

-- Régions assignées
SELECT 'user_regions (user_id)', COUNT(*)
FROM user_regions
WHERE user_id = 'USER_ID_HERE'
UNION ALL

-- Régions assignées par cet utilisateur
SELECT 'user_regions (assigned_by)', COUNT(*)
FROM user_regions
WHERE assigned_by = 'USER_ID_HERE'
UNION ALL

-- Logs d'activité
SELECT 'activity_logs', COUNT(*)
FROM activity_logs
WHERE user_id = 'USER_ID_HERE';

-- 3. Vérifier toutes les contraintes de clé étrangère
-- =====================================================
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    tc.constraint_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE ccu.table_name = 'users'
  AND rc.delete_rule NOT IN ('CASCADE', 'SET NULL')
ORDER BY tc.table_name, kcu.column_name;

-- 4. Solution: Mettre à NULL manuellement les références problématiques
-- =====================================================
-- Exécutez ces commandes UNIQUEMENT si vous êtes sûr de vouloir supprimer l'utilisateur
-- Remplacez 'USER_ID_HERE' par l'ID réel de l'utilisateur

/*
BEGIN;

-- Mettre à NULL les références dans tickets
UPDATE tickets SET created_by = NULL WHERE created_by = 'USER_ID_HERE';
UPDATE tickets SET assigned_to = NULL WHERE assigned_to = 'USER_ID_HERE';

-- Mettre à NULL les références dans ticket_history
UPDATE ticket_history SET changed_by = NULL WHERE changed_by = 'USER_ID_HERE';

-- Mettre à NULL les références dans technician_services
UPDATE technician_services SET assigned_by = NULL WHERE assigned_by = 'USER_ID_HERE';

-- Mettre à NULL les références dans user_wilayas
UPDATE user_wilayas SET assigned_by = NULL WHERE assigned_by = 'USER_ID_HERE';

-- Mettre à NULL les références dans user_regions
UPDATE user_regions SET assigned_by = NULL WHERE assigned_by = 'USER_ID_HERE';

-- Supprimer les enregistrements liés (CASCADE)
DELETE FROM login_history WHERE user_id = 'USER_ID_HERE';
DELETE FROM technician_services WHERE user_id = 'USER_ID_HERE';
DELETE FROM user_wilayas WHERE user_id = 'USER_ID_HERE';
DELETE FROM user_regions WHERE user_id = 'USER_ID_HERE';

-- Maintenant vous pouvez supprimer l'utilisateur
DELETE FROM users WHERE id = 'USER_ID_HERE';

COMMIT;
*/

