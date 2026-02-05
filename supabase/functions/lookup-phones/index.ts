 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
 };
 
 // Extract place ID from Google Maps URL
 function extractPlaceId(googleMapsUrl: string): { type: 'cid' | 'ftid' | null; value: string | null } {
   if (!googleMapsUrl) return { type: null, value: null };
   
   try {
     const url = new URL(googleMapsUrl);
     
     // Check for CID format: https://maps.google.com/?cid=XXXX
     const cid = url.searchParams.get('cid');
     if (cid) {
       return { type: 'cid', value: cid };
     }
     
     // Check for ftid in data parameter (embedded in URL)
     const ftid = url.searchParams.get('ftid');
     if (ftid) {
       return { type: 'ftid', value: ftid };
     }
     
     return { type: null, value: null };
   } catch {
     return { type: null, value: null };
   }
 }
 
 // Search for place by name and get phone number
 async function lookupPhoneByName(
   businessName: string,
   address: string | null,
   apiKey: string
 ): Promise<string | null> {
   try {
     // Use Find Place API to search by name
     const query = address ? `${businessName} ${address}` : businessName;
     const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${apiKey}`;
     
     const findRes = await fetch(findUrl);
     const findData = await findRes.json();
     
     if (findData.status !== 'OK' || !findData.candidates?.[0]?.place_id) {
       console.log(`No place found for: ${businessName}`);
       return null;
     }
     
     const placeId = findData.candidates[0].place_id;
     
     // Get phone number from place details
     const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=international_phone_number,formatted_phone_number&key=${apiKey}`;
     const detailsRes = await fetch(detailsUrl);
     const detailsData = await detailsRes.json();
     
     if (detailsData.status !== 'OK' || !detailsData.result) {
       return null;
     }
     
     return detailsData.result.international_phone_number || 
            detailsData.result.formatted_phone_number || 
            null;
   } catch (error) {
     console.error(`Error looking up phone for ${businessName}:`, error);
     return null;
   }
 }
 
 serve(async (req) => {
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const authHeader = req.headers.get('Authorization');
     if (!authHeader) {
       return new Response(
         JSON.stringify({ error: 'Unauthorized' }),
         { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // Initialize Supabase client
     const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
     const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
     const supabase = createClient(supabaseUrl, supabaseServiceKey);
 
     // Verify user token
     const token = authHeader.replace('Bearer ', '');
     const { data: { user }, error: authError } = await supabase.auth.getUser(token);
     
     if (authError || !user) {
       return new Response(
         JSON.stringify({ error: 'Invalid token' }),
         { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
     if (!GOOGLE_MAPS_API_KEY) {
       return new Response(
         JSON.stringify({ error: 'Service not configured' }),
         { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     const { leadIds } = await req.json();
     
     if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
       return new Response(
         JSON.stringify({ error: 'Lead IDs required' }),
         { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     // Limit to 50 leads at a time to avoid timeouts
     const limitedIds = leadIds.slice(0, 50);
 
     // Fetch leads that need phone lookup
     const { data: leads, error: fetchError } = await supabase
       .from('outreach_leads')
       .select('id, business_name, address, google_maps_url')
       .in('id', limitedIds)
       .eq('user_id', user.id)
       .is('phone', null);
 
     if (fetchError) {
       console.error('Error fetching leads:', fetchError);
       return new Response(
         JSON.stringify({ error: 'Failed to fetch leads' }),
         { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     if (!leads || leads.length === 0) {
       return new Response(
         JSON.stringify({ updated: 0, message: 'No leads need phone lookup' }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       );
     }
 
     console.log(`Looking up phones for ${leads.length} leads`);
 
     // Process leads in batches to avoid API rate limits
     const results: { id: string; phone: string | null }[] = [];
     
     for (const lead of leads) {
       const phone = await lookupPhoneByName(
         lead.business_name,
         lead.address,
         GOOGLE_MAPS_API_KEY
       );
       
       results.push({ id: lead.id, phone });
       
       // Small delay to avoid hitting rate limits
       await new Promise(resolve => setTimeout(resolve, 200));
     }
 
     // Update leads with found phone numbers
     let updatedCount = 0;
     for (const result of results) {
       if (result.phone) {
         const { error: updateError } = await supabase
           .from('outreach_leads')
           .update({ phone: result.phone })
           .eq('id', result.id)
           .eq('user_id', user.id);
 
         if (!updateError) {
           updatedCount++;
         }
       }
     }
 
     console.log(`Updated ${updatedCount} leads with phone numbers`);
 
     return new Response(
       JSON.stringify({ 
         updated: updatedCount, 
         total: leads.length,
         results: results.map(r => ({ id: r.id, found: !!r.phone }))
       }),
       { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
 
   } catch (error) {
     console.error('Phone lookup error:', error);
     return new Response(
       JSON.stringify({ error: 'An error occurred during phone lookup' }),
       { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
     );
   }
 });