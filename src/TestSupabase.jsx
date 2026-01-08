import React, { useEffect } from "react";
import supabase from "./supabaseClient";

function TestSupabase() {
  useEffect(() => {
    const checkConnection = async () => {
      const { data, error } = await supabase.from("vereine").select("*").limit(1);
      if (error) {
        console.error("Fehler bei Supabase:", error.message);
      } else {
        console.log("Supabase-Verbindung erfolgreich:", data);
      }
    };

    checkConnection();
  }, []);

  return <div>Teste Supabase-Verbindung... Siehe Konsole.</div>;
}

export default TestSupabase;
