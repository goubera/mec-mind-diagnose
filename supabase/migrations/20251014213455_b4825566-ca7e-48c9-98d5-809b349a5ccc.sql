-- Création du type enum pour les rôles
CREATE TYPE public.app_role AS ENUM ('mechanic', 'admin');

-- Table des profils utilisateurs (mécaniciens)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role app_role DEFAULT 'mechanic' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies pour profiles
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Table des véhicules
CREATE TABLE public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vin VARCHAR(17) UNIQUE NOT NULL,
    make VARCHAR(50),
    model VARCHAR(50),
    year INT,
    engine_code VARCHAR(50),
    engine_description VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- RLS policies pour vehicles (tous les mécaniciens authentifiés peuvent voir/créer des véhicules)
CREATE POLICY "Authenticated users can view vehicles"
    ON public.vehicles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can create vehicles"
    ON public.vehicles FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Table des sessions de diagnostic
CREATE TABLE public.diagnostic_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.vehicles(id) NOT NULL,
    user_id UUID REFERENCES public.profiles(id) NOT NULL,
    status VARCHAR(50) DEFAULT 'ouvert' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    closed_at TIMESTAMPTZ,
    input_data JSONB,
    ai_analysis JSONB,
    mechanic_feedback JSONB
);

ALTER TABLE public.diagnostic_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies pour diagnostic_sessions
CREATE POLICY "Users can view their own sessions"
    ON public.diagnostic_sessions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sessions"
    ON public.diagnostic_sessions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
    ON public.diagnostic_sessions FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

-- Fonction pour créer automatiquement un profil lors de l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Mécanicien'),
        NEW.email
    );
    RETURN NEW;
END;
$$;

-- Trigger pour créer le profil automatiquement
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Création du bucket de stockage pour les images
INSERT INTO storage.buckets (id, name, public)
VALUES ('diagnostic-images', 'diagnostic-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies pour le storage
CREATE POLICY "Authenticated users can upload images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'diagnostic-images');

CREATE POLICY "Anyone can view images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'diagnostic-images');