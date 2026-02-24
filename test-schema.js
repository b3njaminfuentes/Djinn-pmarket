import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({path: '.env.local'});
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { error } = await supabase.from('bot_pair_codes').upsert({ bot_wallet: 'TESTING_SCHEMA', code: 'TEST', bot_name: 'TEST', expires_at: new Date().toISOString(), used: false, private_key: 'test_pk' }).select();
  console.log(error ? error.message : "Success");
}
run();
