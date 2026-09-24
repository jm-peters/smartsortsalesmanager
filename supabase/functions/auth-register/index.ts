// Supabase Edge Function: auth-register
// Registers a new shop & owner profile with phone and 4-digit PIN authentication

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
    const { shop_name, owner_name, phone, pin, till_number } = await req.json();

    if (!shop_name || !owner_name || !phone || !pin) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const shopId = `shop-${crypto.randomUUID().slice(0, 8)}`;
    const userId = `user-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const paidUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Insert Shop
    const { error: shopErr } = await supabase.from("shops").insert({
      id: shopId,
      shop_name,
      owner_name,
      phone,
      till_number: till_number || "542190",
      plan_code: "daily_30",
      plan_name: "Daily Access Plan (KES 30/day)",
      plan_amount_kes: 30.00,
      plan_status: "active",
      subscription_paid_until: paidUntil,
      created_at: now,
      updated_at: now,
    });

    if (shopErr) throw shopErr;

    // Hash PIN (SHA-256 for Edge runtime)
    const pinBuffer = new TextEncoder().encode(pin + phone);
    const hashBuffer = await crypto.subtle.digest("SHA-256", pinBuffer);
    const pinHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Insert User
    const { error: userErr } = await supabase.from("users").insert({
      id: userId,
      shop_id: shopId,
      name: owner_name,
      username: `user_${phone.slice(-6)}`,
      phone,
      role: "owner",
      pin_hash: pinHash,
      onboarding_step: "contact",
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    if (userErr) throw userErr;

    return new Response(
      JSON.stringify({
        shopId,
        session: {
          accessToken: `sb-token-${crypto.randomUUID()}`,
          refreshToken: `sb-refresh-${crypto.randomUUID()}`,
          expiresAt: Date.now() + 86400000 * 30,
          userId,
          shopId,
          role: "owner",
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
