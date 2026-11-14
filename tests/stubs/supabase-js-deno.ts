// Remplace « npm:@supabase/supabase-js@2 » (spécificateur Deno) dans les tests Node :
// la fonction serveur ne s'en sert que sous Deno, jamais dans les tests.
export function createClient(): never {
  throw new Error('createClient indisponible dans les tests')
}
