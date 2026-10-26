import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const profile=await mkdtemp(tmpdir()+'/videoteca-filters-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
 let port;for(let i=0;i<80;i++){try{port=(await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0];break;}catch{}await pause(100);}assert.ok(port,'Chrome started');
 const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);let id=0;const callbacks=new Map(),errors=[];
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const c=callbacks.get(m.id);callbacks.delete(m.id);m.error?c.reject(Error(m.error.message)):c.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;callbacks.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
 await call('Runtime.enable');await call('Page.enable');await call('Page.navigate',{url:'http://localhost:4317'});await pause(1000);
 await evaluate(`localStorage.setItem('videoteca.saved',JSON.stringify([
 {title:'Largo',source:'link',language:'es',file:{name:'largo.mp4',url:'https://example.com/largo.mp4',duration:7000,size:100}},
 {title:'Pesado',source:'link',language:'es',file:{name:'pesado.mp4',url:'https://example.com/pesado.mp4',duration:100,size:900}},
 {title:'TRÁILER',source:'link',language:'es',file:{name:'trailer.mp4',url:'https://example.com/trailer.mp4',duration:10,size:50}},
 {title:'Sin datos',source:'link',language:'und',file:{name:'unknown.mp4',url:'https://example.com/unknown.mp4'}}]))`);
 await call('Page.reload');await pause(700);await evaluate(`document.querySelector('#savedTab').click()`);
 const titles=()=>evaluate(`[...document.querySelectorAll('.card h3')].map(x=>x.textContent)`);
 assert.deepEqual(await titles(),['Largo','Pesado','TRÁILER','Sin datos']);
 await evaluate(`window.originalCard=document.querySelector('.card');document.querySelector('#sort').value='size';document.querySelector('#sort').dispatchEvent(new Event('change'))`);
 assert.deepEqual(await titles(),['Pesado','Largo','TRÁILER','Sin datos']);
 assert.equal(await evaluate(`window.originalCard===document.querySelectorAll('.card')[1]`),true);
 await evaluate(`document.querySelector('#exclude').value='trailer';document.querySelector('#exclude').dispatchEvent(new Event('input'))`);
 assert.deepEqual(await titles(),['Pesado','Largo','Sin datos']);
 await call('Page.reload');await pause(700);await evaluate(`document.querySelector('#savedTab').click()`);
 assert.deepEqual(await titles(),['Pesado','Largo','Sin datos']);
 assert.equal(await evaluate(`document.querySelector('input[value="streaming"]').checked&&document.querySelector('input[value="okru"]').checked`),true);
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate(`document.documentElement.scrollWidth<=390`),true,'mobile layout');
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await evaluate(`window.actualFetch=window.fetch;window.fetch=async(url,options)=>{
  if(String(url).startsWith('/api/search'))return new Response(JSON.stringify({items:[{source:'cuevana',title:'Shrek',pageUrl:'https://example.com/shrek'}],more:false}));
  if(String(url).startsWith('/api/resolve')){await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,1800);options?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(options.signal.reason)},{once:true})});return new Response(JSON.stringify({files:[]}));}
  return window.actualFetch(url,options);
 };document.querySelector('#exclude').value='';document.querySelectorAll('input[name=source]').forEach(e=>e.checked=e.value==='cuevana');document.querySelector('#query').value='shrek';document.querySelector('#search').requestSubmit()`);
 await pause(300);assert.equal(await evaluate(`document.querySelector('#progress').dataset.state`),'running');assert.deepEqual(await titles(),['Shrek'],'show discovered pages before extraction finishes');
 assert.equal(await evaluate(`document.querySelector('#searchProgress').value<100`),true);
 await pause(2200);assert.equal(await evaluate(`document.querySelector('#progress').dataset.state`),'done');assert.equal(await evaluate(`document.querySelector('#searchProgress').value`),100);assert.match(await evaluate(`document.querySelector('#progressTitle').textContent`),/terminada/);
 assert.equal(await evaluate(`document.querySelector('.actions a').textContent`),'Ver en sitio ↗');
 await evaluate(`document.querySelector('#search').requestSubmit()`);await pause(200);await evaluate(`document.querySelector('#stop').click()`);await pause(300);
 assert.equal(await evaluate(`document.querySelector('#progress').dataset.state`),'stopped');assert.equal(await evaluate(`document.querySelector('#searchProgress').value<100`),true);
 await evaluate(`window.fetch=async(url,options)=>String(url).startsWith('/api/search')?new Response(JSON.stringify({warning:'Aviso de prueba',more:false,items:Array.from({length:125},(_,i)=>({title:'Shrek '+i,source:'cuevana',pageUrl:'https://example.com/shrek/'+i,files:[{name:'Shrek '+i+'.mp4',url:'https://example.com/'+i+'.mp4',family:String(i),height:1080}]}))})):window.actualFetch(url,options);document.querySelector('#search').requestSubmit()`);
 await pause(500);assert.equal(await evaluate(`document.querySelectorAll('.card').length`),120);assert.match(await evaluate(`document.querySelector('#showMore').textContent`),/Ver todo/);
 await evaluate(`document.querySelector('#showMore').click()`);assert.equal(await evaluate(`document.querySelectorAll('.card').length`),125);
 assert.equal(await evaluate(`document.querySelector('#searchLog').open`),false);assert.equal(await evaluate(`document.querySelector('#notice').textContent`),'');
 await evaluate(`window.fetch=window.actualFetch`);
 if(process.argv.includes('--live')){
  await evaluate(`document.querySelectorAll('input[name=source]').forEach(e=>e.checked=e.value==='okru');document.querySelector('#search').requestSubmit()`);
  for(let i=0;i<160;i++){if(await evaluate(`document.querySelector('#progress').dataset.state==='done'`))break;await pause(1000);}
  assert.equal(await evaluate(`document.querySelector('#progress').dataset.state`),'done');
  assert.equal(await evaluate(`[...document.querySelectorAll('.card')].some(c=>c.dataset.key.includes('7480296802832')&&!c.querySelector('.extractionState'))`),true,'the exact user video is discovered and extracted');
  const sources=await evaluate(`Promise.all(['cuevana','lamovie'].map(async source=>{const d=await(await fetch('/api/search?q=shrek&source='+source)).json();return {source,count:d.items.length,found:d.items.some(x=>/^(Shrek|Shrek \\(2001\\))$/.test(x.title))}}))`);
  assert.ok(sources.every(x=>x.found),JSON.stringify(sources));console.log('Live catalogs',sources);
  await evaluate(`document.querySelectorAll('.card').forEach(c=>{if(c.dataset.key.includes('7480296802832')&&!c.querySelector('.extractionState')&&!document.querySelector('#player').open)c.querySelector('.actions button').click()})`);
  for(let i=0;i<40;i++){if(await evaluate(`document.querySelector('#video').readyState>=2`))break;await pause(1000);}
  assert.equal(await evaluate(`document.querySelector('#video').readyState>=2`),true,'exact OK.ru video loads actual frames');
  console.log('Live OK.ru playback',await evaluate(`({duration:document.querySelector('#video').duration,readyState:document.querySelector('#video').readyState})`));
  assert.equal(await evaluate(`[...document.querySelectorAll('.card')].filter(c=>c.dataset.key.includes('7480296802832')&&!c.querySelector('.extractionState')).length`),1,'quality variants share one card');
  assert.match(await evaluate(`document.querySelector('#quality').selectedOptions[0].textContent`),/1080p/);
  await evaluate(`document.querySelector('#playerMode').value='compatible';document.querySelector('#playerMode').dispatchEvent(new Event('change'))`);
  for(let i=0;i<55;i++){if(await evaluate(`document.querySelector('#video').readyState>=2`))break;await pause(1000);}
  assert.equal(await evaluate(`document.querySelector('#video').readyState>=2`),true,'compatible conversion streams actual frames');
  assert.equal(await evaluate(`document.querySelector('#video').currentSrc.includes('/api/transcode?')`),true);
  await evaluate(`document.querySelector('#timeline').value=120;document.querySelector('#timeline').dispatchEvent(new Event('change'))`);
  for(let i=0;i<55;i++){if(await evaluate(`document.querySelector('#video').readyState>=2`))break;await pause(1000);}
  assert.equal(await evaluate(`document.querySelector('#video').readyState>=2`),true,'conversion resumes after seek');
  assert.equal(await evaluate(`new URL(document.querySelector('#video').currentSrc).searchParams.get('start')`),'120');
  await evaluate(`window.openedWatch='';window.open=url=>{window.openedWatch=url};document.querySelector('#direct').click()`);
  assert.match(await evaluate(`window.openedWatch`),/^\/\?watch=/,'new tab links to a player, not media download');
  console.log('PASS: single card, maximum quality, compatible streaming, seek at 120 s, player-only new tab.');
  await evaluate(`document.querySelector('#closePlayer').click()`);
 }
 assert.deepEqual(errors,[]);console.log('PASS: sorting, exclusion, persistence, mobile, progress start/finish/cancel, immediate page results; no JS errors.');
}finally{socket?.close();browser.kill('SIGTERM');await pause(500);await rm(profile,{recursive:true,force:true});}
