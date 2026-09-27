// Exact process identity checks for the attended Windows operator. The only
// termination target is the recorded Node worker (PID, start time, path, command).
import {spawn} from 'node:child_process';
import {privateEnvironment} from './private-recovery-files.mjs';
import assert from 'node:assert/strict';
const script=`$ErrorActionPreference='Stop'; $v=[Console]::In.ReadToEnd()|ConvertFrom-Json;
$p=Get-Process -Id $v.pid -ErrorAction SilentlyContinue;
if($null -eq $p){[Console]::Out.Write('{"running":false}');exit 0}
$w=Get-CimInstance Win32_Process -Filter ('ProcessId='+$v.pid);
if($null -eq $w -or $p.HasExited){[Console]::Out.Write('{"running":false}');exit 0}
$identity=[ordered]@{pid=$p.Id;start=$p.StartTime.ToUniversalTime().ToString('o');path=$p.Path;command=$w.CommandLine};
if($v.expected){foreach($k in @('pid','start','path','command')){if($identity[$k] -cne $v.expected.$k){throw 'Process identity mismatch'}}}
if($v.stop){if(-not $v.expected){throw 'Expected identity required'};Stop-Process -InputObject $p -Force;$p.WaitForExit();[Console]::Out.Write('{"running":false}');exit 0}
[Console]::Out.Write((@{running=$true;identity=$identity}|ConvertTo-Json -Compress));`;
export async function inspectLiveProcess(pid,{expected,stop=false,signal}={}) {
  assert(Number.isInteger(pid)&&pid>0);assert(!stop||expected);
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(Error('process_inspection_aborted'));return;}
    const child=spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:privateEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',failed=false;
    const abort=()=>{failed=true;child.kill();};const timer=setTimeout(abort,7000);
    signal?.addEventListener('abort',abort,{once:true});
    child.on('error',()=>{failed=true;});child.stdin.on('error',()=>{failed=true;});child.stderr.resume();
    child.stdout.on('data',b=>{stdout+=b;if(stdout.length>32768)abort();});
    child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);try{assert(!failed&&code===0,'process_identity_check_failed');resolve(JSON.parse(stdout));}catch(error){reject(error);}});
    child.stdin.end(JSON.stringify({pid,expected,stop}));
  });
}
