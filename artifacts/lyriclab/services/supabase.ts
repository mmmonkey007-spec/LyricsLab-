import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tnshtklviovkcboypyfj.supabase.co";
const SUPABASE_KEY = "sb_publishable_05JGPG-UpKOlo_sh3zyv8g_EG4Ew4l5";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
