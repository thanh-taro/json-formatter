// Runs every code generator (MOD-Build). `--check` fails when a checked-in output is stale.
import { genCopy } from './gen-copy.mjs';
import { genHeaders } from './gen-headers.mjs';
import { genNotices } from './gen-notices.mjs';
import { genTokens } from './gen-tokens.mjs';

const check = process.argv.includes('--check');
const results = [await genTokens({ check }), genCopy({ check }), genNotices({ check }), genHeaders({ check })];
if (results.includes(false)) {
  console.error('codegen: generated files are stale');
  process.exit(1);
}
console.log(check ? 'codegen: up to date' : 'codegen: done');
