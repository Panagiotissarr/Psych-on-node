import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

function run(cmd) {
  console.log(`> ${cmd}`);
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return output.trim();
  } catch (err) {
    const stderr = err.stderr || '';
    const stdout = err.stdout || '';
    const msg = stderr || stdout || err.message;
    console.error(msg);
    return null;
  }
}

function extractId(output, pattern) {
  const match = output.match(pattern);
  return match ? match[1] : null;
}

function patchToml(toml, dbId, kvId) {
  let content = toml;
  if (dbId) content = content.replace('YOUR_D1_DATABASE_ID', dbId);
  if (kvId) content = content.replace('YOUR_KV_NAMESPACE_ID', kvId);
  return content;
}

export async function setup() {
  console.log('=== Setting up Cloudflare resources ===\n');

  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error('ERROR: CLOUDFLARE_API_TOKEN env var is not set.');
    console.error('Create a token at: https://dash.cloudflare.com/profile/api-tokens');
    console.error('Required permissions: Workers Scripts (Edit), D1 (Edit), KV Storage (Edit), R2 Storage (Edit)');
    process.exit(1);
  }

  const tomlPath = 'wrangler.toml';
  let toml = readFileSync(tomlPath, 'utf8');

  if (!toml.includes('YOUR_D1_DATABASE_ID')) {
    console.log('Resources already configured in wrangler.toml');
    return;
  }

  // Create D1
  console.log('Creating D1 database...');
  const d1Out = run('wrangler d1 create funkin-online-db');
  if (d1Out) {
    console.log(d1Out);
    const dbId = extractId(d1Out, /database_id\s*=\s*"([^"]+)"/);
    if (dbId) {
      console.log(`\nD1 database_id: ${dbId}`);
      toml = patchToml(toml, dbId, null);
    } else {
      console.error('Failed to extract D1 database ID from output');
    }
  }

  // Create KV
  console.log('\nCreating KV namespace...');
  const kvOut = run('wrangler kv namespace create COOLDOWNS');
  if (kvOut) {
    console.log(kvOut);
    const kvId = extractId(kvOut, /id\s*=\s*"([^"]+)"/);
    if (kvId) {
      console.log(`\nKV namespace id: ${kvId}`);
      toml = patchToml(toml, null, kvId);
    } else {
      console.error('Failed to extract KV namespace ID from output');
    }
  }

  // Create R2
  console.log('\nCreating R2 bucket...');
  const r2Out = run('wrangler r2 bucket create funkin-online-files');
  if (r2Out) console.log(r2Out);

  // Write updated toml
  writeFileSync(tomlPath, toml);
  console.log('\n=== wrangler.toml updated ===');
}

export async function deploy() {
  console.log('=== Deploying to Cloudflare Workers ===\n');

  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error('ERROR: CLOUDFLARE_API_TOKEN env var is not set.');
    console.error('Create a token at: https://dash.cloudflare.com/profile/api-tokens');
    console.error('Required permissions: Workers Scripts (Edit), D1 (Edit), KV Storage (Edit), R2 Storage (Edit)');
    process.exit(1);
  }

  const tomlPath = 'wrangler.toml';
  let toml = readFileSync(tomlPath, 'utf8');

  // If resources not set up yet, do setup first
  if (toml.includes('YOUR_D1_DATABASE_ID')) {
    console.log('Resources not set up yet, running setup first...\n');
    await setup();
    toml = readFileSync(tomlPath, 'utf8');
    if (toml.includes('YOUR_D1_DATABASE_ID')) {
      console.error('\nSetup failed. Check CLOUDFLARE_API_TOKEN and try again.');
      process.exit(1);
    }
  }

  // Apply migrations
  console.log('\nApplying database migrations...');
  const migOut = run('wrangler d1 execute funkin-online-db --file=./migrations/0001_initial.sql --remote');
  if (migOut) console.log(migOut);

  // Deploy
  console.log('\nDeploying worker...');
  const result = run('wrangler deploy');
  if (result) console.log(result);

  console.log('\n=== Deployment complete ===');
}
