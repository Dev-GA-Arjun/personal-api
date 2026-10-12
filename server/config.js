import 'dotenv/config';

// Fail fast: better to crash at startup than to run half-configured.
const required = ['API_TOKEN', 'VAULT_PATH'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const defaultAllowedHosts = ['127.0.0.1', 'localhost', '::1'];
const allowedHosts = (process.env.ALLOWED_HOSTS || defaultAllowedHosts.join(','))
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT) || 3737,
  apiToken: process.env.API_TOKEN,
  vaultPath: process.env.VAULT_PATH,
  allowedHosts,
  // Used from Block 5 onward. Optional for now.
  omnirouteUrl: process.env.OMNIROUTE_URL || 'http://localhost:20128/v1',
  omnirouteKey: process.env.OMNIROUTE_KEY || '',
};