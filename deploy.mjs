import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

function run(cmd) {
  console.log(`> ${cmd}`);
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (err) {
    console.error(err.stdout || err.message);
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

  const tomlPath = 'wrangler.toml';
  let toml = readFileSync(tomlPath, 'utf8');

  // Check if already set up
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
    }
  }

  // Create R2
  console.log('\nCreating R2 bucket...');
  run('wrangler r2 bucket create funkin-online-files');

  // Write updated toml
  writeFileSync(tomlPath, toml);
  console.log('\n=== wrangler.toml updated ===');
  console.log('Now run: npm run deploy');
}

export async function deploy() {
  console.log('=== Deploying to Cloudflare Workers ===\n');

  const tomlPath = 'wrangler.toml';
  const toml = readFileSync(tomlPath, 'utf8');

  // If resources not set up yet, do setup first
  if (toml.includes('YOUR_D1_DATABASE_ID')) {
    console.log('Resources not set up yet, running setup first...\n');
    await setup();
    // Re-read updated toml
    const updatedToml = readFileSync(tomlPath, 'utf8');
    if (updatedToml.includes('YOUR_D1_DATABASE_ID')) {
      console.error('Setup failed. Please run manually: npx wrangler login, then npm run setup');
      process.exit(1);
    }
  }

  // Apply migrations
  console.log('\nApplying database migrations...');
  const dbId = extractId(toml, /database_id\s*=\s*"([^"]+)"/);
  const dbName = 'funkin-online-db';
  run(`wrangler d1 execute ${dbName} --file=./migrations/0001_initial.sql --remote`);

  // Deploy
  console.log('\nDeploying worker...');
  const result = run('wrangler deploy');
  if (result) console.log(result);

  console.log('\n=== Deployment complete ===');
}
