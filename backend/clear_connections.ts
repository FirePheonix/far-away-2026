import { supabaseAdmin } from "./src/config/supabase.js";

async function clearConnections() {
  console.log("Clearing invalid Google connections...");
  const { data: tokens } = await supabaseAdmin.from("google_tokens").select("id");
  if (tokens?.length) {
    await supabaseAdmin.from("google_tokens").delete().in("id", tokens.map(t => t.id));
  }
  
  const { data: connections } = await supabaseAdmin.from("google_connections").select("id");
  if (connections?.length) {
    await supabaseAdmin.from("google_connections").delete().in("id", connections.map(c => c.id));
  }
  
  console.log("Successfully wiped all stored Google tokens! You can now safely reconnect via the dashboard.");
}

clearConnections();
