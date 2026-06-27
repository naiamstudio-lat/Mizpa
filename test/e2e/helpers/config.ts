import fs from 'fs';
import path from 'path';

function parseEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return {};

  const values: Record<string, string> = {};
  const content = fs.readFileSync(filePath, 'utf-8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, , key, rawValue] = match;
    let value = rawValue.trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadEnv() {
  const root = process.cwd();
  const files = ['.env', '.env.development'];
  const merged: Record<string, string> = {};

  for (const file of files) {
    const filePath = path.join(root, file);
    Object.assign(merged, parseEnvFile(filePath));
  }

  return { ...merged, ...process.env };
}

const env = loadEnv();

export function getBaseUrl() {
  const configured = env.BASE_URL || env.VITE_BASE_URL || env.VITE_APP_URL || env.APP_URL || 'http://localhost:5173';
  return configured.replace(/\/$/, '');
}

export function getTestUser() {
  return {
    email: env.TEST_USER_EMAIL || env.VITE_TEST_USER_EMAIL || 'test@mizpa.dev',
    password: env.TEST_USER_PASSWORD || env.VITE_TEST_USER_PASSWORD || 'Test123456',
  };
}
