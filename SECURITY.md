# Sécurité

## 🔒 Politique de sécurité

Ce document décrit les vulnérabilités connues et les mesures de sécurité du projet MecaMind Diagnose.

## 📋 Vulnérabilités connues

### Vulnérabilités npm acceptées (Dev uniquement)

Les vulnérabilités suivantes sont présentes dans les dépendances de développement mais n'affectent **pas la production** :

#### 1. esbuild <=0.24.2 (Moderate - CVSS 5.3)
- **CVE**: GHSA-67mh-4wv8-2f99
- **Impact**: Le dev server peut recevoir des requêtes non autorisées depuis des sites malveillants
- **Environnement affecté**: Développement uniquement
- **Raison de l'acceptation**:
  - N'affecte pas le build de production
  - Nécessite upgrade vers Vite 7 (breaking change majeur)
  - Risque limité (nécessite accès au localhost du développeur)
- **Action prévue**: Upgrade vers Vite 7 lors d'une future migration majeure

#### 2. vite 5.x (Moderate)
- **Dépendance**: Affecté par la vulnérabilité esbuild ci-dessus
- **Impact**: Identique à esbuild
- **Environnement affecté**: Développement uniquement
- **Action prévue**: Upgrade vers Vite 7.x lors d'une future migration

### Recommandations pour les développeurs

Si vous développez localement :
- ✅ N'exposez jamais votre dev server (`localhost:5173`) publiquement
- ✅ Utilisez un pare-feu local
- ✅ Ne visitez pas de sites non fiables pendant le développement

## 🛡️ Mesures de sécurité implémentées

### Variables d'environnement
- ✅ `.env` ajouté au `.gitignore`
- ✅ Clés API non commitées dans Git
- ✅ `.env.example` fourni comme modèle
- ✅ Configuration via Loveable Secrets pour la production

### Authentification
- ✅ Gestion d'authentification via Supabase
- ✅ Routes protégées avec `ProtectedRoute`
- ✅ Messages d'erreur sécurisés (pas d'exposition de détails techniques)

### Base de données
- ✅ Row Level Security (RLS) configuré sur Supabase
- ✅ Séparation anon key (frontend) / service role key (backend)

## 📝 TODO Sécurité

Corrections en cours :
- [ ] Restriction CORS dans Edge Function
- [ ] Validation et limites sur les uploads de fichiers
- [ ] Validation des inputs avec Zod
- [ ] Gestion des transactions avec rollback
- [ ] Correction des fuites mémoire (URL.revokeObjectURL)

## 🚨 Signaler une vulnérabilité

Si vous découvrez une vulnérabilité de sécurité, veuillez :
1. **NE PAS** créer une issue publique
2. Contacter le propriétaire du projet en privé
3. Fournir une description détaillée de la vulnérabilité

Nous nous engageons à répondre sous 48h.

---

**Dernière mise à jour** : 2025-11-24
