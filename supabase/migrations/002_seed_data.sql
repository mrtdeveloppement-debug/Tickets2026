-- =====================================================
-- RIMATEL SA - Seed Data
-- =====================================================

-- =====================================================
-- 1. INSERT WILAYAS
-- =====================================================
INSERT INTO wilayas (code, name_fr, name_ar, name_en) VALUES
('NKC', 'Nouakchott', 'نواكشوط', 'Nouakchott'),
('NDB', 'Nouadhibou', 'نواذيبو', 'Nouadhibou'),
('TIMBEDRA', 'Timbedra', 'تمبدغة', 'Timbedra'),
('NEMA', 'Néma', 'النعمة', 'Nema'),
('GHEROU', 'Guerou', 'كرو', 'Guerou'),
('AIOUN', 'Aïoun', 'العيون', 'Aioun'),
('OUAD_NAGUE', 'Ouad Nague', 'واد الناقة', 'Ouad Nague'),
('KIFFA', 'Kiffa', 'كيفة', 'Kiffa'),
('ALEG', 'Aleg', 'ألاك', 'Aleg'),
('TIDJIGJE', 'Tidjigje', 'تجكجة', 'Tidjigje'),
('WELATE', 'Welate', 'ولاتة', 'Welate'),
('SELIBABAI', 'Sélibabi', 'سيليبابي', 'Selibabi'),
('BOGHE', 'Boghé', 'بوكي', 'Boghe'),
('BABABE', 'Bababé', 'بابابي', 'Bababe'),
('TACHOUT', 'Tachout', 'تاشوت', 'Tachout'),
('BASSIKNOU', 'Bassiknou', 'باسكنو', 'Bassiknou');

-- =====================================================
-- 2. INSERT REGIONS (NKC only)
-- =====================================================
INSERT INTO regions (wilaya_code, name_fr, name_ar, name_en) VALUES
('NKC', 'Arafat', 'عرفات', 'Arafat'),
('NKC', 'Riyadh', 'الرياض', 'Riyadh'),
('NKC', 'Baghdad', 'بغداد', 'Baghdad'),
('NKC', 'Carrefour', 'كارفور', 'Carrefour'),
('NKC', 'Toujounine', 'توجنين', 'Toujounine'),
('NKC', 'TVZ', 'تي في زد', 'TVZ'),
('NKC', 'Sahrawi', 'الصحراوي', 'Sahrawi'),
('NKC', 'Soukouk', 'السكوك', 'Soukouk'),
('NKC', 'Capital', 'العاصمة', 'Capital'),
('NKC', 'El Mina', 'الميناء', 'El Mina'),
('NKC', 'Sebkha', 'السبخة', 'Sebkha'),
('NKC', 'Teyaret', 'تيارت', 'Teyaret'),
('NKC', 'Dar Naim', 'دار النعيم', 'Dar Naim'),
('NKC', 'Zaatar', 'الزعتر', 'Zaatar'),
('NKC', 'Ancien Aéroport', 'المطار القديم', 'Old Airport'),
('NKC', 'Ksar', 'القصر', 'Ksar'),
('NKC', 'Aghnodert', 'أغنودرت', 'Aghnodert');

-- =====================================================
-- 3. CREATE DEFAULT ADMIN USER
-- Password: admin123 (hashed with bcrypt)
-- =====================================================
INSERT INTO users (email, password_hash, full_name, role) VALUES
('admin@rimatel.mr', '$2a$10$rKvVJKhPqZXqJqYqJqYqJeO8YqYqYqYqYqYqYqYqYqYqYqYqYqYqY', 'Administrateur RIMATEL', 'admin');

-- Note: You should change this password after first login
-- The actual hash should be generated using bcrypt in your application

-- =====================================================
-- 4. SAMPLE INSTALLATION TICKETS (for demo)
-- =====================================================
INSERT INTO tickets (
  ticket_number,
  subscriber_number,
  client_name,
  phone,
  wilaya_code,
  region_id,
  subscription_type,
  problem_description,
  status,
  created_at,
  category,
  installation_status
) VALUES
('INST-0001','DAB1001','Client A','+22241000001','NKC', NULL,'SAWI','Installation SAWI - matériel prêt','en_cours', NOW() - INTERVAL '5 days','installation','matériel'),
('INST-0002','DAB1002','Client B','+22241000002','NKC', NULL,'SAWI','Installation SAWI - équipe en cours','en_cours', NOW() - INTERVAL '2 days','installation','équipe_installation'),
('INST-0003','DAB1003','Client C','+22241000003','NDB', NULL,'FTTH','Installation FTTH - optimisation en attente','en_cours', NOW() - INTERVAL '7 days','installation','optimisation'),
('INST-0004','DAB1004','Client D','+22241000004','NKC', NULL,'BLR','Installation BLR - client injoignable','en_cours', NOW() - INTERVAL '1 days','installation','injoignable'),
('INST-0005','DAB1005','Client E','+22241000005','ALEG', NULL,'LS/MPLS','Installation LS/MPLS - annulée','en_cours', NOW() - INTERVAL '3 days','installation','annulé'),
('INST-0006','DAB1006','Client F','+22241000006','NKC', NULL,'SAWI','Installation SAWI - impossible','en_cours', NOW() - INTERVAL '9 days','installation','installation_impossible'),
('INST-0007','DAB1007','Client G','+22241000007','KIFFA', NULL,'SAWI','Installation SAWI - installée','en_cours', NOW() - INTERVAL '4 days','installation','installé');

