#!/usr/bin/env node
/**
 * Resolve `vault://` references in a deployment env file from Cerulean Vault.
 *
 * Cerulean Vault (HashiCorp Vault, KV v2) is the estate's secret store, so a
 * value in this deployment's files may be a reference instead of a literal:
 *
 *     OMNIROUTE_API_KEY=vault://cerulean/openmaic#OMNIROUTE_API_KEY
 *
 * References are resolved *here*, on the host, before the stack starts — not by
 * the containers, because the images that need them (oauth2-proxy, SearXNG)
 * have no Vault client and should not hold a token. The written file is mode
 * 600 and gitignored; the template beside it is committed and carries no
 * secret.
 *
 * Usage:
 *     node scripts/vault-env.mjs --in .env.classroom-secrets.example \
 *         --out .env.classroom-secrets
 *
 * Environment:
 *     VAULT_ADDR          base URL, e.g. http://192.168.1.71:8200
 *     VAULT_TOKEN         this product's path-scoped token, or
 *     VAULT_TOKEN_FILE    a file holding it (the Vault CLI's own order)
 *     VAULT_PREFIX        KV v2 mount point (Cerulean default: cerulean)
 *     VAULT_SKIP_VERIFY   "1" to accept a self-signed certificate
 *
 * The token is the `openmaic` one Cerulean mints at
 * /data/vault/token/openmaic.token on the platform host; it can read and write
 * cerulean/openmaic and nothing else. Keep a copy at
 * /etc/classroom/vault.token (mode 600) and point VAULT_TOKEN_FILE at it.
 *
 * Lines without a reference pass through unchanged, comments and blanks are
 * kept, and any reference that cannot be resolved — missing Vault address or
 * token, absent path, absent key, empty value — fails the run rather than
 * writing a placeholder. Values are never printed: only key names.
 *
 * Exit codes: 0 resolved (or nothing to resolve), 1 error, 2 bad usage.
 */

import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const REF_PREFIX = 'vault://';
const DEFAULT_STORE = 'cerulean';
const TIMEOUT_MS = 15_000;

/** `vault://<mount>/<path>#<key>` → its parts, or null when not a reference. */
export function parseReference(value) {
  if (typeof value !== 'string' || !value.startsWith(REF_PREFIX)) return null;
  const rest = value.slice(REF_PREFIX.length);
  const hash = rest.indexOf('#');
  if (hash === -1) return null;
  const location = rest.slice(0, hash);
  const key = rest.slice(hash + 1).trim();
  const slash = location.indexOf('/');
  if (slash === -1) return null;
  const mount = location.slice(0, slash).trim();
  const path = location.slice(slash + 1).replace(/^\/+|\/+$/g, '').trim();
  if (!mount || !path || !key) return null;
  return { mount, path, key };
}

function configFromEnv(env = process.env) {
  const token = (env.VAULT_TOKEN || '').trim() || readTokenFile(env.VAULT_TOKEN_FILE);
  const cfg = {
    addr: (env.VAULT_ADDR || '').replace(/\/+$/, ''),
    token,
    store: env.VAULT_PREFIX || DEFAULT_STORE,
    skipVerify: env.VAULT_SKIP_VERIFY === '1',
  };
  cfg.enabled = Boolean(cfg.addr && cfg.token);
  return cfg;
}

function readTokenFile(path) {
  if (!path) return '';
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}

/** GET one KV v2 secret: /v1/<mount>/data/<path> → data.data. */
function readSecret(cfg, { mount, path }, cache) {
  const id = `${mount}/${path}`;
  if (cache.has(id)) return Promise.resolve(cache.get(id));

  const url = new URL(`${cfg.addr}/v1/${mount}/data/${path}`);
  const secure = url.protocol === 'https:';
  const options = {
    method: 'GET',
    timeout: TIMEOUT_MS,
    headers: { 'X-Vault-Token': cfg.token, Accept: 'application/json' },
  };
  if (secure && cfg.skipVerify) options.rejectUnauthorized = false;

  return new Promise((resolve, reject) => {
    const request = (secure ? https : http).request(url, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          body = { errors: text.slice(0, 200) };
        }
        if (res.statusCode === 404) {
          reject(new Error(`vault: ${id} is not in ${cfg.addr}`));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`vault: reading ${id} failed (HTTP ${res.statusCode})`));
          return;
        }
        const outer = body && body.data;
        if (!outer || typeof outer.data !== 'object' || outer.data === null) {
          reject(new Error(`vault: ${mount}/ is not answering as KV v2 (no data.data nesting)`));
          return;
        }
        cache.set(id, outer.data);
        resolve(outer.data);
      });
    });
    request.on('timeout', () => request.destroy(new Error(`vault: timed out after ${TIMEOUT_MS}ms`)));
    request.on('error', reject);
    request.end();
  });
}

/** Quote a value for a dotenv file: single line, wrapped in double quotes. */
function encode(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

async function main(argv = process.argv.slice(2)) {
  let input;
  let output;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--in') input = argv[++i];
    else if (argv[i] === '--out') output = argv[++i];
    else {
      console.error('usage: node scripts/vault-env.mjs --in <template> --out <file>');
      process.exit(2);
    }
  }
  if (!input || !output) {
    console.error('usage: node scripts/vault-env.mjs --in <template> --out <file>');
    process.exit(2);
  }

  const lines = readFileSync(input, 'utf8').split('\n');
  const references = [];
  for (const line of lines) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match) continue;
    const parsed = parseReference(match[2].trim());
    if (parsed) references.push({ name: match[1], parsed });
  }

  const cfg = configFromEnv();
  if (references.length && !cfg.enabled) {
    throw new Error(
      `values reference Vault but VAULT_ADDR and VAULT_TOKEN (or VAULT_TOKEN_FILE) are not both set: ${references
        .map((reference) => reference.name)
        .join(', ')}`,
    );
  }

  const cache = new Map();
  const resolved = new Map();
  for (const { name, parsed } of references) {
    const secret = await readSecret(cfg, parsed, cache);
    const value = secret[parsed.key];
    if (value === undefined) {
      throw new Error(
        `vault: ${parsed.mount}/${parsed.path} has no key ${parsed.key} (present: ${Object.keys(secret)
          .sort()
          .join(', ')})`,
      );
    }
    if (typeof value !== 'string' || !value) {
      throw new Error(`vault: ${parsed.mount}/${parsed.path}#${parsed.key} is empty`);
    }
    resolved.set(name, value);
  }

  const written = lines.map((line) => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match || !resolved.has(match[1])) return line;
    return `${match[1]}=${encode(resolved.get(match[1]))}`;
  });

  writeFileSync(output, `${written.join('\n').replace(/\n*$/, '')}\n`, { mode: 0o600 });
  chmodSync(output, 0o600);

  if (resolved.size) {
    console.error(
      `[vault] resolved ${resolved.size} secret(s) from ${cfg.store} into ${output}: ${[...resolved.keys()]
        .sort()
        .join(', ')}`,
    );
  } else {
    console.error(`[vault] ${input} holds no references — ${output} copied unchanged`);
  }
}

main().catch((error) => {
  console.error(`[vault] ${error.message}`);
  process.exit(1);
});
