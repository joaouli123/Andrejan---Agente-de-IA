
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cvrvpgzxbigulabwgoac.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2cnZwZ3p4YmlndWxhYndnb2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTg4MzcsImV4cCI6MjA4NTg5NDgzN30.cdOs5jCtIMgBY0hLzt8YtvS3Mtcp3yO52DdfbfcPxRQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
