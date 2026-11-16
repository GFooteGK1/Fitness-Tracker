'use strict';
// Synthetic disposable-store reader only. No cloud endpoint, credentials or raw
// output. This runs AFTER the writing PGlite instance/process has closed.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
async function main() {
  if (process.env.NODE_ENV !== 'test' || process.env.SOCIUS_QWIK_DISPOSABLE !== 'true') throw new Error('Disposable reader only');
  const [mode, rootArg, owner, artifactId] = process.argv.slice(2);
  const root = fs.realpathSync(rootArg), marker = JSON.parse(fs.readFileSync(path.join(root,'fixture-marker.json'),'utf8'));
  if (marker.kind !== 'qwik-private-disposable-v1' || !['99999999-9999-4999-8999-999999999999','88888888-8888-4888-8888-888888888888'].includes(owner)
    || !['write','read'].includes(mode) || mode === 'read' && !/^[a-f0-9-]{36}$/.test(artifactId)) throw new Error('Unexpected synthetic reader identity');
  const store = fs.realpathSync(path.join(root,'store'));
  if (!store.startsWith(root + path.sep)) throw new Error('Store escaped disposable root');
  const db = new PGlite(store);
  try {
    await db.waitReady;
    await db.exec('SET ROLE qwik_private_test_executor');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[owner]);
    if (mode === 'write') {
      const source = fs.realpathSync(path.join(root,'source.bin'));
      if (!source.startsWith(root + path.sep)) throw new Error('Source escaped fixture');
      const bytes = fs.readFileSync(source);
      if (bytes.length < 2 || bytes.length > 5000000) throw new Error('Unexpected synthetic source size');
      const digest = crypto.createHash('sha256').update(bytes).digest('hex');
      const result = await db.query('SELECT qwik_private.persist_original($1::uuid,$2::text,$3::bytea,$4::text,$5::text,$6::text,$7::timestamptz,$8::bigint) receipt',
        [owner,crypto.randomUUID(),bytes,digest,'synthetic.json','finite_until',new Date(Date.now()+3600000).toISOString(),1000000]);
      const receipt = result.rows[0].receipt;
      process.stdout.write(JSON.stringify({pid:process.pid,artifactId:receipt.artifactId,sha256:receipt.sha256,byteLength:receipt.byteLength})); return;
    }
    const result = await db.query('SELECT * FROM qwik_private.read_original($1::uuid,$2::uuid)',[owner,artifactId]);
    if (result.rows.length === 0) { process.stdout.write(JSON.stringify({pid:process.pid,state:'missing_or_unauthorized'})); return; }
    const {metadata,bytes} = result.rows[0];
    if (metadata.state !== 'available') { if (bytes !== null) throw new Error('Unavailable original leaked bytes'); process.stdout.write(JSON.stringify({state:metadata.state})); return; }
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== metadata.sha256 || bytes.length !== metadata.byteLength || metadata.userId !== owner) throw new Error('Fresh stored-byte verification failed');
    process.stdout.write(JSON.stringify({pid:process.pid,state:'available',sha256:digest,byteLength:bytes.length,ownerMatches:true}));
  } finally { await db.close(); }
}
main().catch(() => { process.stderr.write('Synthetic fresh-reader failed'); process.exitCode=1; });
