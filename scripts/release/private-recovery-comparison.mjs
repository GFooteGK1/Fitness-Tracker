// Logical archive comparison only. This does not establish runtime compatibility.
// Preserve both raw catalogs; callers seal this result with the private evidence.
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sections = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(key => !equal(a[key], b[key]));
const tablePrivileges = ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'];
const checkNames = new Set([
  'public.measurement_imports.measurement_imports_raw_artifact_contract_check',
  'public.workout_efforts.workout_efforts_rir_check',
  'public.workout_efforts.workout_efforts_rpe_check',
]);

function ownerDefault(table) {
  if (!['r', 'p'].includes(table.kind) || table.aclNull !== false || !Array.isArray(table.acl)) return false;
  const expected = tablePrivileges.map(privilege => ({ grantor: table.owner, grantee: table.owner, privilege, grantable: false }));
  // No PUBLIC, delegated grantor, grant option, missing privilege or extra property.
  return table.acl.length === expected.length && expected.every(entry => table.acl.some(actual =>
    Object.keys(actual).length === 4 && Object.entries(entry).every(([key, value]) => actual[key] === value)));
}

function logicalColumns(columns) {
  if (!Array.isArray(columns)) return null;
  const tables = new Map();
  const result = [];
  for (const column of columns) {
    const key = JSON.stringify([column.schema, column.table]);
    const prior = tables.get(key) ?? { position: 0, ordinal: 0, names: new Set() };
    if (!Number.isInteger(column.position) || column.position <= prior.position || prior.names.has(column.name)) return null;
    prior.position = column.position; prior.ordinal++; prior.names.add(column.name); tables.set(key, prior);
    result.push({ ...column, position: prior.ordinal });
  }
  return result;
}

function tokens(definition) {
  if (typeof definition !== 'string' || definition.length > 8192) return null;
  // Deliberately not a general SQL lexer: unsupported syntax remains unequal.
  const result = [], pattern = /\s+|'(?:''|[^'])*'|"(?:""|[^"])*"|[A-Za-z_][A-Za-z_0-9$]*|\d+(?:\.\d+)?|::|>=|<=|<>|!=|\|\||~~|[(),.+=*\/%<>-]/gy;
  let offset = 0;
  while (offset < definition.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(definition);
    if (!match || result.length > 1024) return null;
    offset = pattern.lastIndex;
    if (!/^\s+$/.test(match[0])) result.push(match[0]);
  }
  return result;
}

function unwrap(input) {
  let value = input;
  while (value[0] === '(' && value.at(-1) === ')') {
    let depth = 0, whole = true;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '(') depth++;
      if (value[i] === ')') depth--;
      if (depth < 0 || (depth === 0 && i < value.length - 1)) { whole = false; break; }
    }
    if (!whole || depth !== 0) break;
    value = value.slice(1, -1);
  }
  return value;
}

function booleanTree(input, depth = 0) {
  if (depth > 32 || !input.length) return null;
  const value = unwrap(input);
  const ands = [], ors = [];
  let nesting = 0, between = false;
  for (let i = 0; i < value.length; i++) {
    const token = value[i];
    if (token === '(') nesting++;
    else if (token === ')') nesting--;
    if (nesting < 0) return null;
    if (nesting !== 0) continue;
    if (['CASE', 'SELECT', 'EXISTS'].includes(token)) return null;
    if (token === 'BETWEEN') { if (between) return null; between = true; }
    else if (token === 'AND') { if (between) between = false; else ands.push(i); }
    else if (token === 'OR') ors.push(i);
  }
  if (nesting !== 0 || between) return null;
  const cuts = ors.length ? ors : ands;
  if (!cuts.length) return { atom: value };
  const operation = ors.length ? 'OR' : 'AND', parts = [];
  let start = 0;
  for (const end of [...cuts, value.length]) {
    const child = booleanTree(value.slice(start, end), depth + 1);
    if (!child) return null;
    // Only AND is associative here. Never flatten/reorder OR or any operands.
    if (operation === 'AND' && child.operation === 'AND') parts.push(...child.parts);
    else parts.push(child);
    start = end + 1;
  }
  return { operation, parts };
}

export function equivalentCheckAndGrouping(left, right) {
  const a = tokens(left), b = tokens(right);
  if (!a || !b || a[0] !== 'CHECK' || b[0] !== 'CHECK') return false;
  // pg_get_constraintdef emits CHECK (expression); reject trailing modifiers.
  if (a[1] !== '(' || b[1] !== '(' || unwrap(a.slice(1)).length === a.length - 1 || unwrap(b.slice(1)).length === b.length - 1) return false;
  const treeA = booleanTree(a.slice(1)), treeB = booleanTree(b.slice(1));
  return treeA !== null && treeB !== null && equal(treeA, treeB);
}

export function compareRecoveryCatalog(source, restored) {
  const expected = structuredClone(source), actual = structuredClone(restored);
  const rawDifferingSections = sections(source, restored), equivalences = [];
  const normalized = ['database name', 'NOLOGIN roles except local bootstrap socket operator'];
  for (const role of expected.roles) role.login = role.name === source.bootstrapRole;
  actual.database.name = expected.database.name;
  if (!equal(expected.columns, actual.columns)) {
    const left = logicalColumns(expected.columns), right = logicalColumns(actual.columns);
    if (left && right && equal(left, right)) {
      expected.columns = left; actual.columns = right;
      normalized.push('surviving column logical order; all other column properties exact');
      equivalences.push({ section: 'columns', rule: 'logical-surviving-order' });
    }
  }
  for (let i = 0; i < (expected.relations?.length ?? 0); i++) {
    const left = expected.relations[i], right = actual.relations?.[i];
    if (!right || left.schema !== right.schema || left.name !== right.name || left.kind !== right.kind || left.owner !== right.owner) continue;
    const absent = table => table.aclNull === true && table.acl === null;
    if ((absent(left) && ownerDefault(right)) || (absent(right) && ownerDefault(left))) {
      left.aclNull = right.aclNull = true; left.acl = right.acl = null;
      equivalences.push({ section: 'relations', rule: 'table-owner-default-acl', schema: left.schema, name: left.name });
    }
  }
  if (equivalences.some(item => item.rule === 'table-owner-default-acl')) normalized.push('table NULL ACL equals exact PostgreSQL 17 owner defaults only');
  for (let i = 0; i < (expected.constraints?.length ?? 0); i++) {
    const left = expected.constraints[i], right = actual.constraints?.[i];
    if (!right || left.kind !== 'c' || right.kind !== 'c' || left.schema !== right.schema || left.table !== right.table || left.name !== right.name || !checkNames.has(`${left.schema}.${left.table}.${left.name}`) || left.definition === right.definition) continue;
    if (equivalentCheckAndGrouping(left.definition, right.definition)) {
      right.definition = left.definition;
      equivalences.push({ section: 'constraints', rule: 'ordered-associative-and', schema: left.schema, table: left.table, name: left.name });
    }
  }
  if (equivalences.some(item => item.rule === 'ordered-associative-and')) normalized.push('allowlisted CHECK associative AND grouping; ordered operands, casts and operators preserved');
  const differingSections = sections(expected, actual);
  return { matched: differingSections.length === 0, differingSections, rawMatched: rawDifferingSections.length === 0, rawDifferingSections, normalized, equivalences };
}
