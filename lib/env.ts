// Server-side env access. Next.js loads .env.local automatically for `dev` and `build`.
// Never log the values.

const SERVER_VARS = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'] as const;
type ServerVar = (typeof SERVER_VARS)[number] | 'ANTHROPIC_API_KEY' | 'LOB_API_KEY';

export function requireEnv(name: ServerVar): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

/** Names of required vars that are missing (never their values). */
export function missingEnv(): string[] {
  return SERVER_VARS.filter((name) => !process.env[name]);
}
