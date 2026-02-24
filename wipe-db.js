const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function wipe() {
  console.log('Wiping database...');
  
  // Wipe bots
  const { error: e1 } = await supabase.from('bots').delete().neq('id', 'uuid-not-matching');
  console.log('Bots cleared:', e1 ? e1.message : 'OK');

  // Wipe referrals
  const { error: e3 } = await supabase.from('referrals').delete().neq('referrer_id', 'none');
  console.log('Referrals cleared:', e3 ? e3.message : 'OK');

  // Wipe profiles
  const { error: e2 } = await supabase.from('profiles').delete().neq('id', 'uuid-not-matching');
  console.log('Profiles cleared:', e2 ? e2.message : 'OK');

  // Reset stats
  const { error: e4 } = await supabase.from('system_stats').update({
    total_users: 0,
    founders_count: 0,
    referral_access_count: 0,
    waitlist_count: 0
  }).eq('id', 'main');
  console.log('Stats reset:', e4 ? e4.message : 'OK');

  console.log('Done!');
}

wipe();
