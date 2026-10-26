import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const url='http://127.0.0.1:4317/api/status';
async function running(){
  try {return (await fetch(url,{signal:AbortSignal.timeout(1000)})).ok;} catch {return false;}
}
if(!await running()){
  const log=openSync(new URL('./videoteca.log',import.meta.url),'a');
  const child=spawn(process.execPath,['server.mjs'],{
    cwd:root,detached:true,stdio:['ignore',log,log],env:{...process.env,PORT:'4317'}
  });
  closeSync(log);
  let failed;
  child.on('error',error=>{failed=error;});
  child.unref();
  let ready=false;
  for(let i=0;i<50&&!failed;i++){
    if(await running()){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready){console.error('No se pudo iniciar Videoteca. Revisa videoteca.log.',failed?.message||'');process.exitCode=1;}
}
