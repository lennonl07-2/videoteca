import {File,API} from 'megajs';
import {rangeOf} from '../public/playback.js';
const loaded=new Map();
const video=/\.(mp4|webm|m4v|mov|mkv|avi|ogv|mpg|mpeg)$/i;
export function validateMega(raw){
 const u=new URL(raw);if(!['mega.nz','mega.co.nz','www.mega.nz'].includes(u.hostname)||u.protocol!=='https:')throw Error('Enlace MEGA inválido.');
 if(!u.hash)throw Error('El enlace de MEGA necesita su clave pública (la parte después de #).');
 return u.href;
}
async function load(raw,signal){
 const url=validateMega(raw);const previous=loaded.get(url);if(previous&&previous.until>Date.now())return previous.file;
 const api=new API({keepalive:false,fetch:(url,opts={})=>{
  const u=new URL(url);
  if(!/^https:$/.test(u.protocol)||!/(^|\.)(mega\.nz|mega\.co\.nz|mega\.io|mega-cdn\.net)$/.test(u.hostname))throw Error('Servidor de MEGA inesperado.');
  return fetch(url,{...opts,redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(25000),...(opts.signal?[opts.signal]:[])])});
 }});
 const root=File.fromURL(url,{api});let timer;
 const file=await Promise.race([root.loadAttributes(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('MEGA tardó demasiado.')),30000);timer.unref();})]).finally(()=>clearTimeout(timer));
 signal?.throwIfAborted();if(loaded.size>100)loaded.clear();loaded.set(url,{file,until:Date.now()+300000});return file;
}
function flatten(file){return file.directory?(file.children||[]).flatMap(flatten):[file];}
export async function megaFiles(url,signal){
 const root=await load(url,signal);
 return flatten(root).filter(f=>video.test(f.name||'')).slice(0,1500).map(f=>({url,transport:'mega',node:f.nodeId||'',name:f.name,title:f.name,size:f.size,format:f.name.split('.').pop().toLowerCase(),language:'und',family:f.nodeId||url}));
}
export async function streamMega(req,res,u){
 const root=await load(u.searchParams.get('url'));const file=flatten(root).find(f=>(f.nodeId||'')===(u.searchParams.get('node')||''));
 if(!file||!video.test(file.name||''))throw Error('No se encontró el video en el enlace de MEGA.');
 const range=rangeOf(req.headers.range,file.size);
 if(!range){res.writeHead(416,{'Content-Range':`bytes */${file.size}`}).end();return;}
 const headers={'Content-Type':file.name.toLowerCase().endsWith('.webm')?'video/webm':file.name.toLowerCase().endsWith('.mp4')?'video/mp4':'application/octet-stream','Content-Length':range.end-range.start+1,'Accept-Ranges':'bytes','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'};
 if(range.partial)headers['Content-Range']=`bytes ${range.start}-${range.end}/${file.size}`;
 if(u.searchParams.has('download'))headers['Content-Disposition']=`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`;
 // MEGAJS treats end=0 as "to end"; request at least two bytes then truncate.
 const stream=file.download({start:range.start,end:Math.max(1,range.end),maxConnections:4,forceHttps:true});
 let sent=0,started=false;const limit=range.end-range.start+1;
 stream.on('error',()=>{if(!started)res.writeHead(502).end('MEGA no permitió descargar el archivo.');else res.destroy();});
 res.on('close',()=>stream.destroy());
 stream.on('data',chunk=>{
  if(!started){res.writeHead(range.partial?206:200,headers);started=true;}
  const part=chunk.subarray(0,limit-sent);sent+=part.length;if(!res.write(part)){stream.pause();res.once('drain',()=>stream.resume());}
  if(sent>=limit){stream.destroy();res.end();}
 });stream.on('end',()=>{if(started)res.end();else res.writeHead(502).end('MEGA devolvió un archivo vacío.');});
}
