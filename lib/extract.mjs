import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {body,remote,Pool,extractionProxy,address} from './network.mjs';
import {pageLinks,driveEntries} from './discovery.mjs';
import {okVideoFiles} from './direct-sources.mjs';
import {megaFiles} from './mega.mjs';
const exec=promisify(execFile),pool=new Pool(3);
export const ytdlp=process.env.YTDLP_PATH||fileURLToPath(new URL(process.platform==='win32'?'../.venv-win/Scripts/yt-dlp.exe':'../.venv/bin/yt-dlp',import.meta.url));
export const videoExt=/\.(mp4|webm|ogv|m4v|mov|mkv|avi|mpg|mpeg)$/i;
import {language} from '../public/languages.js';
export {language};
export async function yt(args,signal){
 if(!existsSync(ytdlp))throw Error('Falta instalar yt-dlp.');
 return pool.run(async()=>{
  const proxy=await extractionProxy();
  try{const {stdout}=await exec(ytdlp,['--ignore-config','--no-warnings','--js-runtimes',`node:${process.execPath}`,'--proxy',proxy,'--socket-timeout','12','--retries','0','--extractor-retries','0',...args],{timeout:45000,maxBuffer:24e6,signal});return JSON.parse(stdout);}
  catch(e){if(signal?.aborted)throw signal.reason;const reason=String(e.stderr||'').split('\n').find(s=>s.startsWith('ERROR:'));throw Error(e.killed?'La extracción tardó demasiado.':reason?.replace(/https?:\/\/[^\s]+/g,'[enlace]').slice(0,240)||'No se pudo extraer el video de esta fuente.');}
 },signal);
}
const tickets=new Map();
function ticketFor(headers={}){
 const clean={};for(const k of ['Referer','User-Agent','Origin'])if(headers[k]&&!/[\r\n]/.test(headers[k]))clean[k]=headers[k];
 if(!Object.keys(clean).length)return undefined;
 if(tickets.size>3000)tickets.clear();const id=randomUUID();tickets.set(id,{headers:clean,until:Date.now()+3600000});return id;
}
export function ticketHeaders(id){const t=tickets.get(id);return t&&t.until>Date.now()?t.headers:{};}
function formats(data){
 const out=[];
 for(const d of data.entries||[data]){
  if(!d||d.has_drm)continue;
  for(const f of d.formats||[d]){
   if(f.has_drm||!/^https?:\/\//.test(f.url||'')||f.vcodec==='none')continue;
   const hls=/m3u8/.test(f.protocol||'')||/\.m3u8(?:[?#]|$)/i.test(f.url);
   if(!hls&&f.acodec==='none')continue;
   if(!hls&&f.protocol&&!/^https?$/.test(f.protocol))continue;
   const ext=hls?'hls':f.ext||'mp4';if(!hls&&!videoExt.test('file.'+ext))continue;
   const title=d.title||d.id||'Video',base=title.replace(/\.(mp4|webm|m4v|mkv|mov|m3u8)$/i,'');
   out.push({url:f.url,name:`${base}.${hls?'m3u8':ext}`,title:d.title,format:ext,height:f.height,fps:f.fps,duration:Number(d.duration)||undefined,size:f.filesize||f.filesize_approx||0,sizeApprox:!f.filesize&&!!f.filesize_approx,language:language(f.language||d.language),transport:hls?'hls':'http',ticket:ticketFor(f.http_headers||d.http_headers),family:d.id||d.webpage_url||d.title,formatId:f.format_id});
  }
 }
 return [...new Map(out.map(f=>[f.url,f])).values()];
}
async function extractWithYT(url,signal){await address(url);return formats(await yt(['--no-playlist','--dump-single-json','--',url],signal));}
export async function extractPage(url,signal,context={seen:new Set(),remaining:12},depth=0){
 signal?.throwIfAborted();if(depth>2||context.remaining<=0||context.seen.has(url))return [];
 context.remaining--;context.seen.add(url);const u=new URL(url);
 if(/(^|\.)ok\.ru$/.test(u.hostname)&&/^\/video(?:embed)?\/\d+/.test(u.pathname)){
  const files=okVideoFiles(await body(url,false,signal));
  if(files.length)return files.map(f=>({...f,ticket:ticketFor({Referer:url})}));
  return extractWithYT(url,signal);
 }
 if(['mega.nz','mega.co.nz','www.mega.nz'].includes(u.hostname))return megaFiles(url,signal);
 if(u.hostname==='drive.google.com'&&u.pathname.includes('/folders/')){
  const entries=driveEntries(await body(url,false,signal)),files=[];
  for(const entry of entries){if(context.remaining<=0)break;const link=`https://drive.google.com/${entry.folder?'drive/folders/':'file/d/'}${entry.id}`;try{files.push(...await extractPage(link,signal,context,depth+1));}catch(e){if(signal?.aborted)throw e;}}
  return files;
 }
 if(videoExt.test(u.pathname)||/\.m3u8$/i.test(u.pathname)){
  const r=await remote(url,{Range:'bytes=0-1023'},0,signal);const type=r.headers['content-type']||'';r.destroy();if(type.includes('text/html'))throw Error('La URL devuelve una página, no un video.');
  const hls=/\.m3u8$/i.test(u.pathname),size=hls?0:Number(r.headers['content-range']?.match(/\/(\d+)$/)?.[1]||(r.statusCode===200?r.headers['content-length']:0))||0;return [{url,name:decodeURIComponent(u.pathname.split('/').pop()),size,format:hls?'hls':u.pathname.split('.').pop().toLowerCase(),transport:hls?'hls':'http'}];
 }
 if(/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|dai\.ly|drive\.google\.com|docs\.google\.com|ok\.ru|vk\.com|facebook\.com|tiktok\.com|streamtape\.com)$/.test(u.hostname))return extractWithYT(url,signal);
 let html='',htmlError;try{html=await body(url,false,signal);}catch(e){htmlError=e;}
 const found=pageLinks(html,url);const files=found.media.map(link=>{const u=new URL(link),hls=/\.m3u8(?:[?#]|$)/i.test(link);return {url:link,name:decodeURIComponent(u.pathname.split('/').pop()||'Video'),format:hls?'hls':u.pathname.split('.').pop(),transport:hls?'hls':'http',ticket:ticketFor({Referer:url})};});
 for(const link of [...found.embeds,...found.links]){
  try{files.push(...await extractPage(link,signal,context,depth+1));}catch(e){if(signal?.aborted)throw e;}
 }
 if(!files.length){try{files.push(...await extractWithYT(url,signal));}catch(e){if(signal?.aborted)throw e;if(htmlError)throw htmlError;throw e;}}
 return [...new Map(files.map(f=>[`${f.url}:${f.node||''}`,f])).values()];
}
export async function resolveItem(item,signal){
 if(item.source==='lamovie'){
  if(!/^\d+$/.test(item.key))throw Error('Identificador de LaMovie inválido.');
  const data=await body('https://lamovie.org/wp-api/v1/player?'+new URLSearchParams({postId:item.key,demo:'0'}),true,signal);
  if(data.error)throw Error(data.message||'LaMovie no ofrece un reproductor público.');
  const embeds=(data.data?.embeds||[]).filter(x=>/^https?:\/\//.test(x.url)).slice(0,4);
  const batches=await Promise.allSettled(embeds.map(async embed=>{
   const timeout=AbortSignal.timeout(25000),child=signal?AbortSignal.any([signal,timeout]):timeout;
   const files=await extractPage(embed.url,child);
   return files.map(f=>({...f,title:item.title,duration:f.duration||item.duration,language:language(embed.lang)!=='und'?language(embed.lang):f.language}));
  }));
  signal?.throwIfAborted();return batches.flatMap(x=>x.status==='fulfilled'?x.value:[]);
 }
 if(item.source==='archive'){
  if(!/^[a-zA-Z0-9_.-]+$/.test(item.key))throw Error('Identificador inválido.');
  const d=await body(`https://archive.org/metadata/${encodeURIComponent(item.key)}`,true,signal);const byName=new Map((d.files||[]).map(f=>[f.name,f]));
  const family=f=>{const seen=new Set();while(f.original&&byName.has(f.original)&&!seen.has(f.name)){seen.add(f.name);f=byName.get(f.original);}return f.name.replace(/\.ia(?=\.)/i,'');};
  return(d.files||[]).filter(f=>videoExt.test(f.name)&&!f.private).map(f=>({url:`https://archive.org/download/${encodeURIComponent(item.key)}/${f.name.split('/').map(encodeURIComponent).join('/')}`,name:f.name,size:Number(f.size)||0,duration:Number(f.length)||undefined,format:f.name.split('.').pop().toLowerCase(),language:language(d.metadata?.language),height:Number(f.height)||undefined,fps:Number(f.fps)||undefined,family:family(f)})).sort((a,b)=>(a.size||Infinity)-(b.size||Infinity));
 }
 if(item.source==='youtube'){
  if(!/^[\w-]{11}$/.test(item.key))throw Error('Identificador inválido.');return extractWithYT('https://www.youtube.com/watch?v='+item.key,signal);
 }
 if(item.source==='commons')return item.files||[];
 return extractPage(item.pageUrl,signal);
}
