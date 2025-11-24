import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Liste des origines autorisées
const ALLOWED_ORIGINS = [
  'https://lovable.dev',
  'https://lovable.app',
  /https:\/\/.*\.lovable\.dev$/,  // Tous les sous-domaines lovable.dev
  /https:\/\/.*\.lovable\.app$/,  // Tous les sous-domaines lovable.app
];

// Ajouter les origines custom depuis les variables d'environnement
const customOrigin = Deno.env.get('ALLOWED_ORIGIN');
if (customOrigin) {
  ALLOWED_ORIGINS.push(customOrigin);
}

/**
 * Vérifie si une origine est autorisée
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;

  return ALLOWED_ORIGINS.some(allowed => {
    if (typeof allowed === 'string') {
      return origin === allowed;
    }
    // Si c'est une RegExp
    return allowed.test(origin);
  });
}

/**
 * Génère les headers CORS appropriés basés sur l'origine de la requête
 */
function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400', // 24 heures
  };

  // Si l'origine est autorisée, on l'ajoute au header
  if (isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin!;
  }

  return headers;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Vérifier que l'origine est autorisée pour les requêtes non-OPTIONS
  if (!isOriginAllowed(origin)) {
    return new Response(
      JSON.stringify({ error: 'Origin not allowed' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const { sessionId, vehicleData, symptoms, dtcCodes, testsAlreadyDone, imageUrls } = await req.json();

    console.log("Analyse démarrée pour session:", sessionId);

    // Vérifier l'authentification JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Créer un client Supabase avec le JWT de l'utilisateur pour vérifier la propriété
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Vérifier que l'utilisateur est propriétaire de la session
    const { data: session, error: sessionError } = await supabaseClient
      .from('diagnostic_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      console.error('Session not found or access denied');
      return new Response(
        JSON.stringify({ error: 'Session not found or access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier que l'utilisateur actuel est bien le propriétaire
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user || user.id !== session.user_id) {
      console.error('User is not the owner of this session');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: You do not own this session' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY non configurée');
    }

    // Construction du prompt système en français
    const systemPrompt = `Rôle :
Tu es un assistant IA professionnel pour les mécaniciens auto. Ton but est d'aider à trouver les pannes le plus vite possible, sans changer des pièces pour rien.

Principes de base :
1. Ton objectif est de trouver la bonne panne avec logique.
2. Tu utilises un français simple, direct et facile à comprendre. Utilise des phrases courtes. Évite les mots compliqués.
3. Tu dois analyser les images fournies et les utiliser comme des indices clés. Relie ce que tu vois sur les photos avec les codes défaut et les symptômes.
4. Tu ne proposes jamais de solution interdite par la loi (enlever EGR, FAP, etc.).
5. Tu expliques toujours pourquoi tu proposes un test.
6. Tu classes tes idées de la plus probable à la moins probable.
7. Tu termines toujours ta réponse par :
   🔧 "Tests à faire"
   🧠 "Logique du diagnostic" (résumé simple)
   ⚠️ "Attention" (s'il y a un risque pour le moteur)

Tu dois répondre UNIQUEMENT avec un objet JSON valide, sans aucun autre texte avant ou après.
Structure du JSON :
{
  "resume_probleme": "Description claire et simple du problème probable",
  "causes_probables": [
    {"cause": "Description de la cause 1", "probabilite": 0.75},
    {"cause": "Description de la cause 2", "probabilite": 0.55}
  ],
  "tests_a_faire": [
    "Test concret 1",
    "Test concret 2"
  ],
  "logique_diagnostic": "Résumé simple de ton raisonnement",
  "attention": "S'il y a un risque pour le moteur ou la sécurité"
}`;

    // Construction du contenu utilisateur
    const userContent: any[] = [
      {
        type: "text",
        text: `Données d'entrée pour le diagnostic :
- Véhicule : ${vehicleData.make} ${vehicleData.model} ${vehicleData.year}, Moteur: ${vehicleData.engine_description || vehicleData.engine_code || 'Non spécifié'}
- Symptômes client : ${symptoms.join(', ')}
- Codes défaut : ${dtcCodes.map((dtc: any) => `${dtc.code} - ${dtc.description || ''}`).join(', ')}
- Tests déjà faits : ${testsAlreadyDone.length > 0 ? testsAlreadyDone.join(', ') : 'Aucun'}

Analyse les images fournies et donne ton diagnostic.`
      }
    ];

    // Ajout des images au contenu
    if (imageUrls && imageUrls.length > 0) {
      for (const imageUrl of imageUrls) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: imageUrl
          }
        });
      }
    }

    // Appel à l'IA Lovable avec Gemini 2.5 Pro (multimodal)
    console.log("Appel à l'IA Lovable...");
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status);
      
      if (aiResponse.status === 429) {
        throw new Error('Trop de requêtes. Veuillez réessayer dans quelques instants.');
      }
      if (aiResponse.status === 402) {
        throw new Error('Crédit insuffisant pour l\'IA. Veuillez contacter l\'administrateur.');
      }
      
      throw new Error(`Erreur API IA: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("Réponse IA reçue");
    
    const aiContent = aiData.choices[0].message.content;
    
    // Parser le JSON de la réponse IA
    let aiAnalysis;
    try {
      // Nettoyer le contenu si nécessaire (enlever les backticks, etc.)
      const cleanContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      aiAnalysis = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('AI JSON parsing failed');
      // Fallback: créer une structure de base
      aiAnalysis = {
        resume_probleme: "Erreur lors de l'analyse de la réponse de l'IA",
        causes_probables: [],
        tests_a_faire: [],
        logique_diagnostic: aiContent,
        attention: ""
      };
    }

    // Mise à jour de la session dans la base de données
    // Utilisation de SERVICE_ROLE_KEY pour bypass RLS car on a déjà vérifié la propriété ci-dessus
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: updateError } = await supabaseAdmin
      .from('diagnostic_sessions')
      .update({ ai_analysis: aiAnalysis })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Database update failed');
      throw updateError;
    }

    console.log("Session mise à jour avec succès");

    return new Response(
      JSON.stringify({ success: true, analysis: aiAnalysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge function error occurred');
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});