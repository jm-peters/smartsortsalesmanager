// Supabase Edge Function: auth-login
// Authenticates shop owner/attendant by phone and PIN

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, pin } = await req.json();

    if (!phone || !pin) {
      return new Response(
        JSON.stringify({ error: "Missing phone or pin" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Hash entered PIN with phone salt
    const pinBuffer = new TextEncoder().encode(pin + phone);
    const hashBuffer = await crypto.subtle.digest("SHA-256", pinBuffer);
    const pinHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { data: user, error } = await supabase
      .from("users")
      .select("id, shop_id, name, role, pin_hash, is_active")
      .eq("phone", phone)
      .eq("pin_hash", pinHash)
      .maybeSingle();

    if (error || !user) {
      return new Response(
        JSON.stringify({ error: "Nambari ya simu au PIN si sahihi." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!user.is_active) {
      return new Response(
        JSON.stringify({ error: "Akaunti hii imefungwa. Wasiliana na mwenye duka." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        shopId: user.shop_id,
        session: {
          accessToken: `sb-token-${crypto.randomUUID()}`,
          refreshToken: `sb-refresh-${crypto.randomUUID()}`,
          expiresAt: Date.now() + 86400000 * 30,
          userId: user.id,
          shopId: user.shop_id,
          role: user.role,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
