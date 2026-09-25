 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
 const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers":
     "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
 };
 
 interface NotificationRequest {
   chapterId: string;
   chapterTitle: string;
   chapterNumber: number;
 }
 
const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is an authenticated admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check admin role using service role client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { chapterId, chapterTitle, chapterNumber }: NotificationRequest = await req.json();
 
     // Get all subscribed users
     const { data: subscribers, error: fetchError } = await supabase
       .from("email_subscriptions")
       .select("email")
       .eq("new_chapters", true);
 
     if (fetchError) {
       throw new Error(`Failed to fetch subscribers: ${fetchError.message}`);
     }
 
     if (!subscribers || subscribers.length === 0) {
       return new Response(
         JSON.stringify({ message: "No subscribers to notify", count: 0 }),
         {
           status: 200,
           headers: { "Content-Type": "application/json", ...corsHeaders },
         }
       );
     }
 
     // Get the site URL from env or use default
     const siteUrl = Deno.env.get("SITE_URL") || "https://www.thecasefiles.org";
 
     // Send emails to all subscribers
     const emailPromises = subscribers.map((subscriber) =>
       resend.emails.send({
          from: "Case File <noreply@resend.dev>",
         to: [subscriber.email],
          subject: `New Story: ${chapterTitle}`,
         html: `
           <!DOCTYPE html>
           <html>
           <head>
             <meta charset="utf-8">
             <meta name="viewport" content="width=device-width, initial-scale=1.0">
           </head>
           <body style="font-family: Georgia, serif; background-color: #1c1917; color: #d6d3d1; padding: 40px 20px; margin: 0;">
             <div style="max-width: 600px; margin: 0 auto;">
                <h1 style="color: #fef3c7; font-size: 28px; margin-bottom: 8px;">New Case Available</h1>
                <p style="color: #78716c; margin-bottom: 24px;">A new standalone story has been published</p>
               
               <div style="background-color: #292524; border: 1px solid #44403c; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                 <h2 style="color: #fef3c7; font-size: 24px; margin: 0 0 8px 0;">${chapterTitle}</h2>
                  <p style="color: #a8a29e; margin: 0;">A new Case File story awaits you.</p>
               </div>
               
               <a href="${siteUrl}" style="display: inline-block; background-color: #0284c7; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
                 Read Now
               </a>
               
               <p style="color: #57534e; font-size: 12px; margin-top: 32px;">
                  You're receiving this because you subscribed to story notifications from Case File.
                 <br>
                 To unsubscribe, visit your profile settings.
               </p>
             </div>
           </body>
           </html>
         `,
       })
     );
 
     const results = await Promise.allSettled(emailPromises);
     const successCount = results.filter((r) => r.status === "fulfilled").length;
     const failedCount = results.filter((r) => r.status === "rejected").length;
 
     console.log(`Sent ${successCount} emails, ${failedCount} failed`);
 
     return new Response(
       JSON.stringify({
         message: "Notifications sent",
         successCount,
         failedCount,
         totalSubscribers: subscribers.length,
       }),
       {
         status: 200,
         headers: { "Content-Type": "application/json", ...corsHeaders },
       }
     );
   } catch (error: any) {
     console.error("Error in send-chapter-notification function:", error);
     return new Response(
       JSON.stringify({ error: error.message }),
       {
         status: 500,
         headers: { "Content-Type": "application/json", ...corsHeaders },
       }
     );
   }
 };
 
 serve(handler);