import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSourceLocale,RECOVERY_LOCALE_SQL,requireMatchingRecoveryLocale} from './private-recovery-locale.mjs';
const valid={database:'postgres',role:'postgres',login:'cli_login_postgres',versionNum:'170006',readOnly:'on',isolation:'repeatable read',rowSecurity:'off',statementTimeoutMs:120000,lockTimeoutMs:5000,encoding:'UTF8',provider:'i',locale:'en-US',collate:'en_US.UTF-8',ctype:'en_US.UTF-8',recordedVersion:'153.120',actualVersion:'153.120'};
test('locale metadata accepts the complete bounded source contract',()=>assert.equal(validateSourceLocale(valid).passed,true));
test('locale metadata fails closed on missing or unsafe session fields',()=>{for(const key of Object.keys(valid)){assert.equal(validateSourceLocale({...valid,[key]:null}).passed,false,key);}assert.equal(validateSourceLocale({...valid,readOnly:'off'}).passed,false);assert.equal(validateSourceLocale({...valid,actualVersion:''}).passed,false);});
test('locale SQL stays on qualified catalog sources',()=>{assert.match(RECOVERY_LOCALE_SQL,/pg_catalog\.pg_database_collation_actual_version\(d\.oid\)/);assert.doesNotMatch(RECOVERY_LOCALE_SQL,/\b(public|auth|storage)\./i);assert.equal(RECOVERY_LOCALE_SQL.split(';').filter(x=>x.trim()).length,1);});

const captured={collationProvider:'i',locale:'en-US',collate:'en_US.UTF-8',ctype:'en_US.UTF-8',encoding:'UTF8',collationVersion:'153.120'};
test('restore locale requires exact captured identity and actual versions',()=>{assert.equal(requireMatchingRecoveryLocale(captured,valid,valid).matched,true);for(const key of ['provider','locale','collate','ctype','encoding','recordedVersion','actualVersion']){assert.throws(()=>requireMatchingRecoveryLocale(captured,{...valid,[key]:'different'},valid),key);assert.throws(()=>requireMatchingRecoveryLocale(captured,valid,{...valid,[key]:'different'}),key);}});
test('stale recorded-version metadata is not silently qualified',()=>assert.throws(()=>requireMatchingRecoveryLocale(captured,{...valid,actualVersion:'153.121'},{...valid,actualVersion:'153.121'})));
