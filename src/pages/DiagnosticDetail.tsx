import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, AlertCircle, Wrench, Brain, CheckCircle } from "lucide-react";

interface DiagnosticData {
  id: string;
  status: string;
  created_at: string;
  input_data: any;
  ai_analysis: any;
  mechanic_feedback: any;
  vehicles: {
    make: string;
    model: string;
    year: number;
    engine_code: string;
  };
}

export default function DiagnosticDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<DiagnosticData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  
  const [finalCause, setFinalCause] = useState("");
  const [partsReplaced, setPartsReplaced] = useState("");
  const [mechanicNotes, setMechanicNotes] = useState("");
  const [isResolved, setIsResolved] = useState(true);

  useEffect(() => {
    if (id) {
      loadDiagnostic();
    }
  }, [id]);

  const loadDiagnostic = async () => {
    try {
      const { data: diagnostic, error } = await supabase
        .from("diagnostic_sessions")
        .select(`
          id,
          status,
          created_at,
          input_data,
          ai_analysis,
          mechanic_feedback,
          vehicles (
            make,
            model,
            year,
            engine_code
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setData(diagnostic);
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingFeedback(true);

    try {
      const feedbackData = {
        vraie_panne_trouvee: finalCause,
        pieces_changees: partsReplaced.split("\n").filter(p => p.trim()),
        notes_mecanicien: mechanicNotes,
        probleme_resolu: isResolved,
      };

      const { error } = await supabase
        .from("diagnostic_sessions")
        .update({
          mechanic_feedback: feedbackData,
          status: isResolved ? "fermé_résolu" : "fermé_non_résolu",
          closed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Feedback enregistré",
        description: "Merci pour votre retour !",
      });

      loadDiagnostic();
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Diagnostic non trouvé</p>
        </div>
      </Layout>
    );
  }

  const isOpen = data.status === "ouvert";

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <div className="flex-1">
            <h1 className="text-3xl font-bold">
              {data.vehicles.make} {data.vehicles.model} ({data.vehicles.year})
            </h1>
            <p className="text-muted-foreground">
              Créé le {new Date(data.created_at).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>

          <Badge
            className={
              data.status === "ouvert"
                ? "bg-info/10 text-info border-info/20"
                : data.status === "fermé_résolu"
                ? "bg-success/10 text-success border-success/20"
                : "bg-warning/10 text-warning border-warning/20"
            }
          >
            {data.status === "ouvert"
              ? "En cours"
              : data.status === "fermé_résolu"
              ? "Résolu"
              : "Non résolu"}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Données d'entrée
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Symptômes du client :</h4>
              <ul className="list-disc list-inside space-y-1">
                {data.input_data.problemes_client?.map((symptom: string, i: number) => (
                  <li key={i} className="text-sm">{symptom}</li>
                ))}
              </ul>
            </div>

            {data.input_data.codes_defaut?.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Codes défaut :</h4>
                <div className="space-y-1">
                  {data.input_data.codes_defaut.map((dtc: any, i: number) => (
                    <p key={i} className="text-sm">
                      <span className="font-mono">{dtc.code}</span>
                      {dtc.description && ` - ${dtc.description}`}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {data.input_data.tests_deja_faits?.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Tests déjà faits :</h4>
                <ul className="list-disc list-inside space-y-1">
                  {data.input_data.tests_deja_faits.map((test: string, i: number) => (
                    <li key={i} className="text-sm">{test}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.input_data.images_urls?.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Images :</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {data.input_data.images_urls.map((url: string, i: number) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Diagnostic ${i + 1}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {data.ai_analysis && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                Analyse de l'IA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">📋 Résumé du problème :</h4>
                <p className="text-sm">{data.ai_analysis.resume_probleme}</p>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">🔍 Causes probables :</h4>
                <div className="space-y-2">
                  {data.ai_analysis.causes_probables?.map((cause: any, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5">
                        {Math.round(cause.probabilite * 100)}%
                      </Badge>
                      <p className="text-sm flex-1">{cause.cause}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">🔧 Tests à faire :</h4>
                <ol className="list-decimal list-inside space-y-1">
                  {data.ai_analysis.tests_a_faire?.map((test: string, i: number) => (
                    <li key={i} className="text-sm">{test}</li>
                  ))}
                </ol>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">🧠 Logique du diagnostic :</h4>
                <p className="text-sm">{data.ai_analysis.logique_diagnostic}</p>
              </div>

              {data.ai_analysis.attention && (
                <>
                  <Separator />
                  <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1">⚠️ Attention :</h4>
                        <p className="text-sm">{data.ai_analysis.attention}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {isOpen ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Retour du mécanicien
              </CardTitle>
              <CardDescription>
                Une fois la réparation terminée, enregistrez le résultat
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitFeedback} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="finalCause">Vraie panne trouvée *</Label>
                  <Input
                    id="finalCause"
                    value={finalCause}
                    onChange={(e) => setFinalCause(e.target.value)}
                    placeholder="Ex: Débitmètre d'air défectueux"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="partsReplaced">Pièces changées (une par ligne)</Label>
                  <Textarea
                    id="partsReplaced"
                    value={partsReplaced}
                    onChange={(e) => setPartsReplaced(e.target.value)}
                    placeholder="Ex:&#10;Débitmètre d'air&#10;Filtre à air"
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mechanicNotes">Notes complémentaires</Label>
                  <Textarea
                    id="mechanicNotes"
                    value={mechanicNotes}
                    onChange={(e) => setMechanicNotes(e.target.value)}
                    placeholder="Notes sur la réparation..."
                    rows={3}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isResolved"
                    checked={isResolved}
                    onChange={(e) => setIsResolved(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="isResolved" className="cursor-pointer">
                    Problème résolu
                  </Label>
                </div>

                <Button type="submit" disabled={submittingFeedback} className="w-full">
                  {submittingFeedback ? "Enregistrement..." : "Enregistrer le retour"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          data.mechanic_feedback && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Retour du mécanicien
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-1">Vraie panne trouvée :</h4>
                  <p className="text-sm">{data.mechanic_feedback.vraie_panne_trouvee}</p>
                </div>

                {data.mechanic_feedback.pieces_changees?.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-1">Pièces changées :</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {data.mechanic_feedback.pieces_changees.map((piece: string, i: number) => (
                        <li key={i} className="text-sm">{piece}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.mechanic_feedback.notes_mecanicien && (
                  <div>
                    <h4 className="font-semibold mb-1">Notes :</h4>
                    <p className="text-sm">{data.mechanic_feedback.notes_mecanicien}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        )}
      </div>
    </Layout>
  );
}