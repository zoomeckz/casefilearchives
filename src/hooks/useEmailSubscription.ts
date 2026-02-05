 import { useState, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import type { AuthUser } from './useAuth';
 
 export interface EmailSubscription {
   newChapters: boolean;
 }
 
 export function useEmailSubscription(user: AuthUser | null) {
   const [subscription, setSubscription] = useState<EmailSubscription | null>(null);
   const [loading, setLoading] = useState(false);
 
   // Fetch subscription when user changes
   useEffect(() => {
     if (!user) {
       setSubscription(null);
       return;
     }
 
     const fetchSubscription = async () => {
       setLoading(true);
       const { data, error } = await supabase
         .from('email_subscriptions')
         .select('new_chapters')
         .eq('user_id', user.id)
         .maybeSingle();
 
       if (!error && data) {
         setSubscription({ newChapters: data.new_chapters });
       } else {
         setSubscription(null);
       }
       setLoading(false);
     };
 
     fetchSubscription();
   }, [user?.id]);
 
   const subscribe = useCallback(async () => {
     if (!user) return;
     
     setLoading(true);
     const { error } = await supabase
       .from('email_subscriptions')
       .upsert({
         user_id: user.id,
         email: user.email,
         new_chapters: true,
       }, {
         onConflict: 'user_id'
       });
 
     if (!error) {
       setSubscription({ newChapters: true });
     }
     setLoading(false);
   }, [user?.id, user?.email]);
 
   const unsubscribe = useCallback(async () => {
     if (!user) return;
     
     setLoading(true);
     const { error } = await supabase
       .from('email_subscriptions')
       .update({ new_chapters: false })
       .eq('user_id', user.id);
 
     if (!error) {
       setSubscription({ newChapters: false });
     }
     setLoading(false);
   }, [user?.id]);
 
   const toggleSubscription = useCallback(async () => {
     if (subscription?.newChapters) {
       await unsubscribe();
     } else {
       await subscribe();
     }
   }, [subscription, subscribe, unsubscribe]);
 
   return {
     subscription,
     loading,
     subscribe,
     unsubscribe,
     toggleSubscription,
     isSubscribed: subscription?.newChapters ?? false,
   };
 }