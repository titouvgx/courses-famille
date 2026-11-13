// Vérifie un ou plusieurs fichiers de recettes : 
//   node --experimental-strip-types scripts/recettes/verifier.ts supabase/recettes/*.json
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { valider, type FichierRecettes } from './format.ts'

let total = 0
for (const f of process.argv.slice(2)) {
  const errs = valider(JSON.parse(readFileSync(f, 'utf8')) as FichierRecettes, basename(f))
  total += errs.length
  console.log(errs.length ? errs.join('\n') : `${basename(f)} : OK`)
}
process.exit(total ? 1 : 0)
