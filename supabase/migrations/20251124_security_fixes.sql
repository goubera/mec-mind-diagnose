-- Migration de sécurité : Correction des vulnérabilités RLS
-- Date: 2025-11-24
-- Description: Correction des 4 vulnérabilités critiques identifiées

-- =============================================================================
-- 1. CORRECTION ESCALADE DE PRIVILÈGES
-- =============================================================================
-- Problème: Les utilisateurs peuvent modifier leur propre rôle
-- Solution: Créer une policy qui exclut le champ 'role' des mises à jour utilisateur

-- Supprimer l'ancienne policy trop permissive
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Créer une nouvelle policy qui empêche la modification du rôle
CREATE POLICY "Users can update their own profile (except role)"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND (
            -- Vérifier que le rôle n'a pas changé
            role = (SELECT role FROM public.profiles WHERE id = auth.uid())
        )
    );

-- Créer une policy admin-only pour modifier les rôles
CREATE POLICY "Only admins can update roles"
    ON public.profiles FOR UPDATE
    USING (
        auth.uid() IN (
            SELECT id FROM public.profiles WHERE role = 'admin'
        )
    );

-- =============================================================================
-- 2. SÉCURISATION DU STORAGE BUCKET
-- =============================================================================
-- Problème: Bucket public, images visibles par tous
-- Solution: Rendre le bucket privé et ajouter RLS stricte

-- Mettre à jour le bucket pour le rendre privé
UPDATE storage.buckets
SET public = false
WHERE id = 'diagnostic-images';

-- Supprimer l'ancienne policy trop permissive
DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;

-- Nouvelle policy: Seuls les utilisateurs authentifiés qui ont créé une session
-- avec ces images peuvent les voir
CREATE POLICY "Users can view their own diagnostic images"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'diagnostic-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Policy pour supprimer ses propres images (pour le rollback)
CREATE POLICY "Users can delete their own images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'diagnostic-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- =============================================================================
-- 3. RESTRICTION ACCÈS VÉHICULES
-- =============================================================================
-- Problème: Tous les utilisateurs voient tous les véhicules (y compris VINs)
-- Solution: Restreindre aux véhicules liés aux sessions de l'utilisateur

-- Supprimer l'ancienne policy trop permissive
DROP POLICY IF EXISTS "Authenticated users can view vehicles" ON public.vehicles;

-- Nouvelle policy: Les utilisateurs ne voient que les véhicules liés à leurs sessions
CREATE POLICY "Users can view vehicles from their sessions"
    ON public.vehicles FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT vehicle_id
            FROM public.diagnostic_sessions
            WHERE user_id = auth.uid()
        )
    );

-- =============================================================================
-- 4. AJOUT INDEX POUR PERFORMANCES
-- =============================================================================
-- Les nouvelles policies font des sous-requêtes, ajoutons des index

CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_user_vehicle
    ON public.diagnostic_sessions(user_id, vehicle_id);

CREATE INDEX IF NOT EXISTS idx_profiles_role
    ON public.profiles(role);

-- =============================================================================
-- COMMENTAIRES ET DOCUMENTATION
-- =============================================================================

COMMENT ON POLICY "Users can update their own profile (except role)" ON public.profiles IS
'Permet aux utilisateurs de modifier leur profil mais empêche la modification du rôle pour éviter l''escalade de privilèges';

COMMENT ON POLICY "Only admins can update roles" ON public.profiles IS
'Seuls les administrateurs peuvent modifier les rôles des utilisateurs';

COMMENT ON POLICY "Users can view their own diagnostic images" ON storage.objects IS
'Les images de diagnostic sont privées et accessibles uniquement par l''utilisateur qui les a uploadées';

COMMENT ON POLICY "Users can view vehicles from their sessions" ON public.vehicles IS
'Les utilisateurs ne peuvent voir que les véhicules associés à leurs propres sessions de diagnostic pour protéger les VINs';
