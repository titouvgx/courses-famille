// Pour la vérification des types côté Node (tsc) : le spécificateur Deno
// « npm:@supabase/supabase-js@2 » a les types du paquet installé.
declare module 'npm:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}
