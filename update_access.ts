import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const wallet = "G1NaEsx5Pg7dSmyYy6Jfraa74b7nTbmN9A9NuiK171Ma";
  
  // 1. Give has_access = true in profiles table
  const { data: profData, error: profErr } = await supabase
    .from('profiles')
    .update({ has_access: true })
    .eq('wallet_address', wallet);
    
  console.log("Profile Update:", profErr || "Success");

  // 2. Add to genesis_whitelist just in case
  const { data: genData, error: genErr } = await supabase
    .from('genesis_whitelist')
    .upsert({ wallet_address: wallet }, { onConflict: 'wallet_address' });

  console.log("Genesis Whitelist:", genErr || "Success");
}

main();
