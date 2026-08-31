function requireEnvironmentVariable(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getSupabaseConfig() {
  return {
    publishableKey: requireEnvironmentVariable(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    url: requireEnvironmentVariable(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
  };
}
