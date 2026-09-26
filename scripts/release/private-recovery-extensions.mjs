// Exact ownership repair supported by retained source metadata and synthetic PG17.6
// replay. Local isolated restore only; never changes a production role or catalog.
const supported = [
  { name: 'pg_stat_statements', version: '1.11', functions: 3 },
  { name: 'pgcrypto', version: '1.3', functions: 36 },
  { name: 'uuid-ossp', version: '1.1', functions: 10 },
];

export function extensionPrecreationPlan(catalog) {
  if (catalog?.bootstrapRole !== 'supabase_admin' || !Array.isArray(catalog.extensions)
    || !Array.isArray(catalog.functions) || !Array.isArray(catalog.relations)
    || !Array.isArray(catalog.roles) || !Array.isArray(catalog.schemas)) {
    throw Error('Unsupported extension ownership catalog');
  }
  const owner = catalog.roles.filter(role => role.name === 'postgres');
  if (owner.length !== 1 || owner[0].super !== false || owner[0].createDb !== true || owner[0].bypassRls !== true
    || catalog.schemas.filter(schema => schema.name === 'extensions').length !== 1
    || catalog.extensions.length !== 5 || new Set(catalog.extensions.map(extension => extension.name)).size !== 5) {
    throw Error('Unsupported extension owner or schema');
  }
  for (const expected of supported) {
    const extensions = catalog.extensions.filter(extension => extension.name === expected.name);
    const functions = catalog.functions.filter(member => member.extension === expected.name);
    const relations = catalog.relations.filter(member => member.extension === expected.name);
    if (extensions.length !== 1 || extensions[0].version !== expected.version
      || extensions[0].schema !== 'extensions' || extensions[0].owner !== 'postgres'
      || functions.length !== expected.functions || functions.some(member => member.owner !== 'postgres')
      || relations.length !== (expected.name === 'pg_stat_statements' ? 2 : 0)
      || relations.some(member => member.owner !== 'postgres')) {
      throw Error('Extension member ownership does not match reviewed source shape');
    }
  }
  for (const extension of catalog.extensions) {
    if (!supported.some(expected => expected.name === extension.name)
      && !((extension.name === 'plpgsql' && extension.version === '1.0' && extension.schema === 'pg_catalog')
        || (extension.name === 'supabase_vault' && extension.version === '0.3.1' && extension.schema === 'vault'))) {
      throw Error('Unreviewed extension in ownership plan');
    }
    if (!supported.some(expected => expected.name === extension.name) && extension.owner !== catalog.bootstrapRole) {
      throw Error('Unsupported remaining extension owner');
    }
  }
  // These identifiers and versions are a static allowlist, never source SQL.
  const installs = supported.map(extension => `CREATE EXTENSION "${extension.name}" WITH SCHEMA "extensions" VERSION '${extension.version}';`);
  return {
    schema: 'extensions', owner: 'postgres', extensions: supported.map(({ name, version }) => ({ name, version })),
    sql: ['BEGIN;', 'ALTER ROLE "postgres" SUPERUSER;', 'SET LOCAL ROLE "postgres";', ...installs,
      'RESET ROLE;', 'ALTER ROLE "postgres" NOSUPERUSER;', 'COMMIT;'].join('\n'),
  };
}

// Replay the archive's own schema definition/owner first. The subsequent restore
// still executes every other TOC entry, including extension creation IF NOT EXISTS,
// ACLs, comments, data and post-data. Never rewrite archive SQL or strip privileges.
export function splitExtensionSchemaToc(toc) {
  if (typeof toc !== 'string') throw Error('Invalid archive TOC');
  const lines = toc.split(/\r?\n/);
  const entries = lines.filter(line => /^\d+;/.test(line));
  const ids = entries.map(line => line.match(/^\d+/)[0]);
  if (!entries.length || new Set(ids).size !== ids.length) throw Error('Malformed or duplicate archive TOC entries');
  const schema = entries.filter(line => /^\d+; \d+ \d+ SCHEMA - extensions /.test(line));
  if (schema.length !== 1) throw Error('Expected exactly one extensions schema TOC entry');
  const remaining = lines.filter(line => line !== schema[0]);
  if (remaining.filter(line => /^\d+;/.test(line)).length !== entries.length - 1) throw Error('Archive TOC coverage mismatch');
  return { schemaList: `${schema[0]}\n`, remainingList: `${remaining.join('\n')}\n`,
    schemaEntryId: schema[0].match(/^\d+/)[0], totalEntries: entries.length, remainingEntries: entries.length - 1 };
}
