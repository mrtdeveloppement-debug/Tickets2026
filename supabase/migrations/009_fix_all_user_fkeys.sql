-- =====================================================
-- Migration 009: Fix all remaining user foreign key constraints
-- =====================================================
-- This migration fixes all foreign key constraints that reference users
-- to allow user deletion without errors

-- 1. Fix assigned_by constraints in technician_services
-- =====================================================
ALTER TABLE technician_services 
  DROP CONSTRAINT IF EXISTS technician_services_assigned_by_fkey;

ALTER TABLE technician_services 
  ADD CONSTRAINT technician_services_assigned_by_fkey 
  FOREIGN KEY (assigned_by) 
  REFERENCES users(id) 
  ON DELETE SET NULL;

-- 2. Fix assigned_by constraints in user_wilayas
-- =====================================================
ALTER TABLE user_wilayas 
  DROP CONSTRAINT IF EXISTS user_wilayas_assigned_by_fkey;

ALTER TABLE user_wilayas 
  ADD CONSTRAINT user_wilayas_assigned_by_fkey 
  FOREIGN KEY (assigned_by) 
  REFERENCES users(id) 
  ON DELETE SET NULL;

-- 3. Fix assigned_by constraints in user_regions
-- =====================================================
ALTER TABLE user_regions 
  DROP CONSTRAINT IF EXISTS user_regions_assigned_by_fkey;

ALTER TABLE user_regions 
  ADD CONSTRAINT user_regions_assigned_by_fkey 
  FOREIGN KEY (assigned_by) 
  REFERENCES users(id) 
  ON DELETE SET NULL;

-- 4. Verify all constraints are properly set
-- =====================================================
-- This query will show all foreign key constraints referencing users
-- Run this to verify:
/*
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE ccu.table_name = 'users'
ORDER BY tc.table_name, kcu.column_name;
*/

