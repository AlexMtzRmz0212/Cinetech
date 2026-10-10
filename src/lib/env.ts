export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const optional = (name: string): string | undefined => process.env[name] || undefined;
