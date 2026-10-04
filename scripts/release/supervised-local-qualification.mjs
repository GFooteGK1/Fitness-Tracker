/** Current-source local checks only. No credentials, hosted target, git mutation or activation. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { buildSupervisedReleaseInventory, verifyInventory } from './supervised-release-inventory.mjs'

if (process.argv.length !== 2) throw Error('Fixed current-repository local checks only')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sha = value => createHash('sha256').update(value).digest('hex')
for (const file of ['.env','.env.local','.env.production','.env.production.local','.env.test','.env.test.local'])
  if (fs.existsSync(path.join(root,file))) throw Error('Automatic environment file denied')
const inventory = buildSupervisedReleaseInventory()
if (inventory.branch !== 'codex/programming-quality' || inventory.globalNumericalPolicy !== false) throw Error('Expected branch and disabled global policy required')
const directory = path.join(root,'output/app-quality-release/supervised-local-checks-'+inventory.id)
fs.mkdirSync(directory) // Exclusive; failed attempts are never restarted.
const saveFile = (name,value) => fs.writeFileSync(path.join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'})
saveFile('inventory.json',inventory)
function inputs() {
  const names = execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean)
  const roots = ['app/','test/','scripts/','docs/','public/','supabase/','.github/']
  const configs = new Set(['package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','vitest.config.ts','playwright.config.ts','tailwind.config.ts','postcss.config.mjs','.eslintrc.json','.eslintrc.js','.eslintrc.cjs'])
  return [...new Set(names)].filter(name=>roots.some(prefix=>name.startsWith(prefix))||configs.has(name)).sort().map(name=>{
    if (name.includes('\\') || name.startsWith('../') || path.isAbsolute(name)) throw Error('Unexpected source path')
    let cursor=root
    for (const part of name.split('/')) { cursor=path.join(cursor,part); if(fs.lstatSync(cursor).isSymbolicLink()) throw Error('Source link denied') }
    const bytes=fs.readFileSync(cursor);return {path:name,bytes:bytes.length,sha256:sha(bytes)}
  })
}
const baseline=inputs();saveFile('source-inputs.json',baseline)
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key)))
Object.assign(env,{CI:'true',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'ci-placeholder-key',COACH_SUPERVISED_PROGRAMMING_ENABLED:'false'})
const receipt={schemaVersion:1,id:inventory.id,status:'prepared',createdAt:new Date().toISOString(),checkpoint:inventory.checkpoint,
  branch:inventory.branch,inventorySha256:sha(fs.readFileSync(path.join(directory,'inventory.json'))),sourceInputsSha256:sha(fs.readFileSync(path.join(directory,'source-inputs.json'))),
  operatorSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),commands:[],globalNumericalPolicy:false,
  scope:'Current worktree local qualification only; not exact release-commit CI, hosted execution or coaching suitability.',
  testExclusion:'output/** contains retained generated runtime copies; maintained app/test/script suites remain included.',
  credentials:'Child environment contains placeholders and system runtime paths only; no retained fixture opt-in flags.'}
const save=()=>fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n')
save()
const checks=[
  ['tests','test',['node_modules/vitest/vitest.mjs','run','--exclude','output/**','--maxWorkers','4','--reporter','json','--outputFile',path.join(directory,'tests.json')]],
  ['typecheck','test',['node_modules/typescript/bin/tsc','--noEmit','--pretty','false','--incremental','false']],
  ['lint','production',['node_modules/next/dist/bin/next','lint']],
  ['build','production',['node_modules/next/dist/bin/next','build']],
]
try {
  for(const [name,nodeEnv,args] of checks){
    const entry={name,args,nodeEnv,startedAt:new Date().toISOString(),disposition:'pending'};receipt.commands.push(entry);receipt.status='running';save()
    const stdout=fs.openSync(path.join(directory,name+'.stdout.log'),'wx'),stderr=fs.openSync(path.join(directory,name+'.stderr.log'),'wx')
    try { entry.exitCode=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,env:{...env,NODE_ENV:nodeEnv},stdio:['ignore',stdout,stderr]})
      entry.pid=child.pid;save();child.once('error',reject);child.once('close',resolve)
    }) } finally {fs.closeSync(stdout);fs.closeSync(stderr)}
    entry.finishedAt=new Date().toISOString();entry.disposition='process_exited';save()
    if(entry.exitCode!==0)throw Error(name+' failed; inspect original logs before another attempt')
    if(name==='tests'){
      const result=JSON.parse(fs.readFileSync(path.join(directory,'tests.json'),'utf8'))
      receipt.tests={passed:result.numPassedTests,failed:result.numFailedTests,pending:result.numPendingTests,total:result.numTotalTests,
        suitesPassed:result.numPassedTestSuites,suitesFailed:result.numFailedTestSuites,success:result.success}
      if(result.success!==true || result.numFailedTests!==0)throw Error('Test report does not confirm success')
      save()
    }
    console.log(JSON.stringify({id:inventory.id,check:name,exitCode:entry.exitCode,...(name==='tests'?{tests:receipt.tests}:{})}))
  }
  if(JSON.stringify(inputs())!==JSON.stringify(baseline))throw Error('Source inputs changed during qualification')
  receipt.sourceInputsUnchanged=true;receipt.inventoryReadback=verifyInventory(root,inventory);receipt.status='passed';receipt.finishedAt=new Date().toISOString();save()
  console.log(JSON.stringify({id:inventory.id,status:receipt.status,checks:receipt.commands.length,sourceInputs:baseline.length,inventoryFiles:inventory.files.length,receipt:path.join(directory,'receipt.json')}))
}catch(error){receipt.status='inspect_required';receipt.failure=error instanceof Error?error.message:'Unknown qualification failure';save();throw error}
