import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Car, Calendar } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface DiagnosticSession {
  id: string;
  created_at: string;
  status: string;
  vehicles: {
    make: string;
    model: string;
    year: number;
  };
}

export default function Dashboard() {
  const [sessions, setSessions] = useState<DiagnosticSession[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user]);

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from("diagnostic_sessions")
        .select(`
          id,
          created_at,
          status,
          vehicles (
            make,
            model,
            year
          )
        `)
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSessions(data || []);
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

  const getStatusBadge = (status: string) => {
    const statusColors = {
      ouvert: "bg-info/10 text-info border-info/20",
      fermé_résolu: "bg-success/10 text-success border-success/20",
      fermé_non_résolu: "bg-warning/10 text-warning border-warning/20",
    };

    const statusLabels = {
      ouvert: "En cours",
      fermé_résolu: "Résolu",
      fermé_non_résolu: "Non résolu",
    };

    return (
      <Badge className={statusColors[status as keyof typeof statusColors]}>
        {statusLabels[status as keyof typeof statusLabels]}
      </Badge>
    );
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Tableau de bord</h1>
            <p className="text-muted-foreground mt-2">
              Gérez vos diagnostics automobiles avec l'aide de l'IA
            </p>
          </div>
          
          <Link to="/diagnostic/new">
            <Button size="lg">
              <Plus className="h-5 w-5 mr-2" />
              Nouveau diagnostic
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Chargement...</p>
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Car className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Aucun diagnostic</h3>
              <p className="text-muted-foreground mb-6">
                Commencez par créer votre premier diagnostic
              </p>
              <Link to="/diagnostic/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Créer un diagnostic
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => (
              <Link key={session.id} to={`/diagnostic/${session.id}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {session.vehicles.make} {session.vehicles.model}
                        </CardTitle>
                        <CardDescription>
                          {session.vehicles.year}
                        </CardDescription>
                      </div>
                      {getStatusBadge(session.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4 mr-2" />
                      {new Date(session.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}