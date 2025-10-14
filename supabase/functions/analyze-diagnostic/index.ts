import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, vehicleData, symptoms, dtcCodes, testsAlreadyDone, imageUrls } = await req.json();
    
    console.log("Analyse démarrée pour session:", sessionId);

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
      console.error('Erreur API IA:', aiResponse.status, errorText);
      
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
      console.error('Erreur parsing JSON IA:', parseError);
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: updateError } = await supabase
      .from('diagnostic_sessions')
      .update({ ai_analysis: aiAnalysis })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Erreur mise à jour session:', updateError);
      throw updateError;
    }

    console.log("Session mise à jour avec succès");

    return new Response(
      JSON.stringify({ success: true, analysis: aiAnalysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erreur dans analyze-diagnostic:', error);
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