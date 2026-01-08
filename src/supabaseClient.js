import { createClient } from "@supabase/supabase-js";

// Deine Daten hier eintragen
const supabaseUrl = "https://uxnjerfvinamdrjlzxub.supabase.co"; // <- DEINE URL aus Supabase/API
const supabaseAnonKey = "sb_publishable_aMzGyD87iysoojWcBp0NdQ_qGyBCk-B"; // <- DEIN Public (anon) API Key

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
