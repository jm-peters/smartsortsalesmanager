// Supabase Edge Function: Safaricom M-Pesa Webhook Callback
// Receives transaction confirmation, updates shop's subscription_paid_until and records payment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

serve(async (req) => {
  try {
    const payload = await req.json();
    const callbackData = payload?.Body?.stkCallback;

    if (!callbackData) {
      return new Response("Invalid payload", { status: 400 });
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = callbackData;

    // Successful payment ResultCode === 0
    if (ResultCode === 0 && CallbackMetadata?.Item) {
      let amount = 30;
      let mpesaReceiptNumber = "";
      let transactionDate = "";
      let phoneNumber = "";

      for (const item of CallbackMetadata.Item) {
        if (item.Name === "Amount") amount = item.Value;
        if (item.Name === "MpesaReceiptNumber") mpesaReceiptNumber = item.Value;
        if (item.Name === "TransactionDate") transactionDate = String(item.Value);
        if (item.Name === "PhoneNumber") phoneNumber = String(item.Value);
      }

      // Initialize Supabase Admin Client
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Days purchased = Math.round(amount / 30) (minimum 1 day)
      const days = Math.max(1, Math.round(amount / 30));

      // Calculate new subscription date
      const validUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      // Find subscription or shop by matching phone or request id
      const { data: shops } = await supabase
        .from("shops")
        .select("id, subscription_paid_until")
        .or(`phone.ilike.%${phoneNumber.slice(-9)}%`)
        .limit(1);

      if (shops && shops.length > 0) {
        const shop = shops[0];
        const currentValid = shop.subscription_paid_until
          ? new Date(shop.subscription_paid_until).getTime()
          : Date.now();
        const base = currentValid > Date.now() ? currentValid : Date.now();
        const newExpiry = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();

        // 1. Update shop subscription
        await supabase
          .from("shops")
          .update({
            plan_status: "active",
            subscription_paid_until: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", shop.id);

        // 2. Insert subscription payment record
        await supabase.from("subscription_payments").insert({
          id: `pay-${crypto.randomUUID().slice(0, 8)}`,
          shop_id: shop.id,
          days,
          amount_kes: amount,
          payment_method: "mpesa_stk",
          transaction_code: mpesaReceiptNumber,
          phone: phoneNumber,
          checkout_request_id: CheckoutRequestID,
          merchant_request_id: MerchantRequestID,
          valid_until: newExpiry,
          status: "completed",
        });
      }
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
