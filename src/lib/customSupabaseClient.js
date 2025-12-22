import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://twpdebifihzlgbmfwfcr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3cGRlYmlmaWh6bGdibWZ3ZmNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNzI2ODIsImV4cCI6MjA4MTg0ODY4Mn0.sY4iYD6P1zEoy7EZwGfXPZ7HKeDcXjbdXEjuAXC6AB0';

const customSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export default customSupabaseClient;

export { 
    customSupabaseClient,
    customSupabaseClient as supabase,
};
