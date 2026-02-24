require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const res = await supabase.from('bot_pair_codes').upsert({ bot_wallet: 'TESTING_SCHEMA', code: 'TEST', bot_name: 'TEST', expires_at: new Date().toISOString(), used: false, private_key: 'test_pk' }).select();
  console.log('Insert Result Error:', res.error);
}
run();
