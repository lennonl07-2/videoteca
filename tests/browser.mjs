import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
const profile=await mkdtemp(tmpdir()+'/videoteca-check-');
const browser=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try{
 let port;for(let i=0;i<80;i++){try{port=(await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0];break;}catch{}await pause(100);}assert.ok(port);
 const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);let id=0;const callbacks=new Map(),errors=[];
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const c=callbacks.get(m.id);callbacks.delete(m.id);m.error?c.reject(Error(m.error.message)):c.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;callbacks.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>(await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true})).result.value;
 await call('Runtime.enable');await call('Page.enable');await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:'http://localhost:4317'});await pause(1500);
 await evaluate(`document.querySelectorAll('input[name=source]').forEach(e=>e.checked=e.value==='archive');document.querySelector('#query').value='backyardigans';document.querySelector('#search').requestSubmit()`);
 for(let i=0;i<90;i++){if(await evaluate(`document.querySelector('#stop').hidden && document.querySelectorAll('.card').length>0`))break;await pause(1000);}
 const count=await evaluate(`document.querySelectorAll('.card').length`);assert.ok(count>0,'real search finds files');
 assert.equal(await evaluate(`[...document.querySelectorAll('.card')].every(e=>e.textContent.toLowerCase().includes('backyardigans'))`),true);
 await evaluate(`window.firstCard=document.querySelector('.card');document.querySelector('#language').dispatchEvent(new Event('change'))`);assert.equal(await evaluate(`window.firstCard===document.querySelector('.card')`),true,'existing cards are not recreated');
 await evaluate(`document.querySelector('.save').click();document.querySelector('#savedTab').click()`);assert.equal(await evaluate(`document.querySelectorAll('.card').length`),1);
 await call('Page.reload');await pause(1000);await evaluate(`document.querySelector('#savedTab').click()`);assert.equal(await evaluate(`document.querySelectorAll('.card').length`),1);
 await evaluate(`document.querySelector('.actions button').click()`);await pause(1000);assert.equal(await evaluate(`document.querySelector('#player').open`),true);
 for(let i=0;i<30;i++){if(await evaluate(`document.querySelector('#video').readyState>=2`))break;await pause(1000);}
 assert.equal(await evaluate(`document.querySelector('#video').readyState>=2`),true,'real video loads playable frames');
 assert.equal(await evaluate(`document.querySelector('#video').playbackRate`),1);
 const timing=await evaluate(`new Promise(resolve=>{const v=document.querySelector('#video');const t=v.currentTime,start=performance.now();setTimeout(()=>resolve({ratio:(v.currentTime-t)/((performance.now()-start)/1000),quality:v.getVideoPlaybackQuality().droppedVideoFrames}),3000)})`);
 console.log('Playback measurement',timing);assert.ok(timing.ratio>.85&&timing.ratio<1.15,'normal playback tracks real time');
 await evaluate(`document.querySelector('#speed').value='1.5';document.querySelector('#speed').dispatchEvent(new Event('change'))`);assert.equal(await evaluate(`document.querySelector('#video').playbackRate`),1.5);
 const fast=await evaluate(`new Promise(resolve=>{const v=document.querySelector('#video'),t=v.currentTime,start=performance.now();setTimeout(()=>resolve((v.currentTime-t)/((performance.now()-start)/1000)),2500)})`);assert.ok(fast>1.3&&fast<1.7);
 await evaluate(`document.querySelector('#closePlayer').click()`);
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate(`document.documentElement.scrollWidth<=390`),true);
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(new URL('../preview.png',import.meta.url),Buffer.from(shot.data,'base64'));
 await evaluate(`document.querySelector('#resultsTab').click();document.querySelector('.linkImport').open=true;document.querySelector('#importUrl').value='https://www.dailymotion.com/video/x5ecz5w';document.querySelector('#importForm').requestSubmit()`);
 for(let i=0;i<65;i++){if(await evaluate(`!document.querySelector('#importForm button').disabled`))break;await pause(1000);}
 assert.ok(await evaluate(`document.querySelectorAll('.card').length>0`),'import extracts HLS files');
 await evaluate(`document.querySelector('.actions button').click()`);
 for(let i=0;i<45;i++){if(await evaluate(`document.querySelector('#video').readyState>=2`))break;await pause(1000);}
 assert.equal(await evaluate(`document.querySelector('#video').readyState>=2`),true,'HLS loads actual video frames');
 assert.equal(await evaluate(`document.querySelector('#download').hidden`),true,'streaming UI does not offer a download');
 assert.equal(await evaluate(`document.querySelector('#direct').textContent`),'Ver en otra pestaña ↗');
 await evaluate(`document.querySelector('#closePlayer').click()`);
 assert.deepEqual(errors,[]);console.log(`PASS: ${count} real files; stable DOM; save persistence; mobile; normal speed ${timing.ratio.toFixed(2)}x (${timing.quality} dropped frames); fast ${fast.toFixed(2)}x; live HLS playback; no JS exceptions.`);
}finally{socket?.close();browser.kill('SIGTERM');await pause(500);await rm(profile,{recursive:true,force:true});}
