// Supabase Edge Function: Safaricom Daraja M-Pesa STK Push
// Triggers an instant prompt on the customer/duka owner's phone for KES 30/day subscription

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, amount = 30, days = 1, shopId } = await req.json();

    if (!phone || !shopId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: phone, shopId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone to 254XXXXXXXXX
    const cleanDigits = phone.replace(/\D/g, "");
    const formattedPhone = cleanDigits.startsWith("0")
      ? `254${cleanDigits.slice(1)}`
      : cleanDigits.startsWith("254")
      ? cleanDigits
      : `254${cleanDigits}`;

    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
    const passkey = Deno.env.get("MPESA_PASSKEY");
    const shortcode = Deno.env.get("MPESA_BUSINESS_SHORTCODE") || "174379";
    const callbackUrl = Deno.env.get("MPESA_CALLBACK_URL");

    // If Daraja credentials are not yet configured in Supabase Secrets, return simulated success
    if (!consumerKey || !consumerSecret || !passkey) {
      return new Response(
        JSON.stringify({
          success: true,
          mode: "simulation",
          message: `Simulated STK Push sent to ${formattedPhone} for KES ${amount}. Enter your PIN to complete.`,
          CheckoutRequestID: `sim-checkout-${Date.now()}`,
          MerchantRequestID: `sim-merchant-${Date.now()}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get OAuth Token from Safaricom Daraja
    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenResp = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );
    const { access_token } = await tokenResp.json();

    // 2. Generate Password & Timestamp
    const date = new Date();
    const timestamp = date.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const password = btoa(`${shortcode}${passkey}${timestamp}`);

    // 3. Initiate STK Push
    const stkResp = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: Math.round(amount),
          PartyA: formattedPhone,
          PartyB: shortcode,
          PhoneNumber: formattedPhone,
          CallBackURL: callbackUrl || "https://your-project.supabase.co/functions/v1/mpesa-callback",
          AccountReference: `DUKA-${shopId.slice(0, 8)}`,
          TransactionDesc: `SmartSort ${days} Day Duka Access`,
        }),
      }
    );

    const stkData = await stkResp.json();

    return new Response(JSON.stringify(stkData), {
      status: stkResp.ok ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
