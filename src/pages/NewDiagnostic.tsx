import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2 } from "lucide-react";

export default function NewDiagnostic() {
  const [vin, setVin] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [engineCode, setEngineCode] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [dtcCodes, setDtcCodes] = useState("");
  const [testsAlreadyDone, setTestsAlreadyDone] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newImages = Array.from(e.target.files);
      setImages((prev) => [...prev, ...newImages]);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // 1. Créer ou récupérer le véhicule
      let vehicleId: string;
      const { data: existingVehicle } = await supabase
        .from("vehicles")
        .select("id")
        .eq("vin", vin)
        .single();

      if (existingVehicle) {
        vehicleId = existingVehicle.id;
      } else {
        const { data: newVehicle, error: vehicleError } = await supabase
          .from("vehicles")
          .insert({
            vin,
            make,
            model,
            year: parseInt(year),
            engine_code: engineCode,
          })
          .select("id")
          .single();

        if (vehicleError) throw vehicleError;
        vehicleId = newVehicle.id;
      }

      // 2. Upload des images
      const imageUrls: string[] = [];
      for (const image of images) {
        const fileName = `${user.id}/${Date.now()}-${image.name}`;
        const { error: uploadError } = await supabase.storage
          .from("diagnostic-images")
          .upload(fileName, image);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("diagnostic-images")
          .getPublicUrl(fileName);

        imageUrls.push(publicUrl);
      }

      // 3. Parser les codes défaut
      const parsedDtcCodes = dtcCodes
        .split("\n")
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split("-");
          return {
            code: parts[0].trim(),
            description: parts[1]?.trim() || "",
          };
        });

      // 4. Parser les symptômes
      const parsedSymptoms = symptoms
        .split("\n")
        .filter(line => line.trim());

      // 5. Parser les tests
      const parsedTests = testsAlreadyDone
        .split("\n")
        .filter(line => line.trim());

      // 6. Créer la session de diagnostic
      const inputData = {
        problemes_client: parsedSymptoms,
        codes_defaut: parsedDtcCodes,
        tests_deja_faits: parsedTests,
        images_urls: imageUrls,
      };

      const { data: session, error: sessionError } = await supabase
        .from("diagnostic_sessions")
        .insert({
          vehicle_id: vehicleId,
          user_id: user.id,
          status: "ouvert",
          input_data: inputData,
        })
        .select("id")
        .single();

      if (sessionError) throw sessionError;

      // 7. Appeler l'IA pour l'analyse
      toast({
        title: "Analyse en cours",
        description: "L'IA analyse les données du diagnostic...",
      });

      const { error: functionError } = await supabase.functions.invoke("analyze-diagnostic", {
        body: {
          sessionId: session.id,
          vehicleData: {
            make,
            model,
            year: parseInt(year),
            engine_code: engineCode,
          },
          symptoms: parsedSymptoms,
          dtcCodes: parsedDtcCodes,
          testsAlreadyDone: parsedTests,
          imageUrls,
        },
      });

      if (functionError) throw functionError;

      toast({
        title: "Diagnostic créé",
        description: "L'analyse IA est terminée !",
      });

      navigate(`/diagnostic/${session.id}`);
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Nouveau diagnostic</h1>
          <p className="text-muted-foreground mt-2">
            Remplissez les informations pour lancer l'analyse IA
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informations du véhicule</CardTitle>
              <CardDescription>Détails techniques du véhicule à diagnostiquer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vin">VIN (Numéro de chassis) *</Label>
                <Input
                  id="vin"
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                  placeholder="Ex: WDB1234567890"
                  required
                  maxLength={17}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="make">Marque *</Label>
                  <Input
                    id="make"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    placeholder="Ex: Renault"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">Modèle *</Label>
                  <Input
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Ex: Clio IV"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="year">Année *</Label>
                  <Input
                    id="year"
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="Ex: 2018"
                    required
                    min="1900"
                    max={new Date().getFullYear()}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="engineCode">Code moteur</Label>
                  <Input
                    id="engineCode"
                    value={engineCode}
                    onChange={(e) => setEngineCode(e.target.value)}
                    placeholder="Ex: K9K"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informations du diagnostic</CardTitle>
              <CardDescription>Symptômes, codes défaut et tests effectués</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="symptoms">Symptômes du client * (un par ligne)</Label>
                <Textarea
                  id="symptoms"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="Ex:&#10;Voyant moteur allumé&#10;Perte de puissance&#10;Fumée noire à l'échappement"
                  rows={5}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dtcCodes">Codes défaut (un par ligne, format: CODE - Description)</Label>
                <Textarea
                  id="dtcCodes"
                  value={dtcCodes}
                  onChange={(e) => setDtcCodes(e.target.value)}
                  placeholder="Ex:&#10;P0171 - Mélange trop pauvre&#10;P0300 - Ratés d'allumage"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="testsAlreadyDone">Tests déjà effectués (un par ligne)</Label>
                <Textarea
                  id="testsAlreadyDone"
                  value={testsAlreadyDone}
                  onChange={(e) => setTestsAlreadyDone(e.target.value)}
                  placeholder="Ex:&#10;Contrôle pression turbo: OK&#10;Test débitmètre: Suspect"
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Photos</CardTitle>
              <CardDescription>Ajoutez des photos pour aider l'IA dans son analyse</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="images" className="cursor-pointer">
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Cliquez pour ajouter des images
                    </p>
                  </div>
                </Label>
                <Input
                  id="images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {images.map((image, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={URL.createObjectURL(image)}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeImage(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/")}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyse en cours...
                </>
              ) : (
                "Lancer le diagnostic"
              )}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}