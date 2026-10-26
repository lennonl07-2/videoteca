import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
export { publicIP, remote } from "./lib/network.mjs";
import { remote, body, address } from "./lib/network.mjs";
import {yt,ytdlp,language,resolveItem,ticketHeaders} from './lib/extract.mjs';
export {language} from './lib/extract.mjs';
export {extractPage} from './lib/extract.mjs';
import {discover,sourceNames,sourceQueries,dailymotion} from './lib/discovery.mjs';
import {cuevana,lamovie,okru} from './lib/direct-sources.mjs';
Object.assign(sourceNames,{cuevana:'Cuevana · búsqueda directa',lamovie:'LaMovie · búsqueda directa',okru:'OK.ru · búsqueda directa'});
import {streamMega} from './lib/mega.mjs';
import {rewriteManifest} from './lib/hls.mjs';
import {spawn} from 'node:child_process';
import {transcode} from './lib/transcode.mjs';
async function archive(q,page,signal) {
  const params=new URLSearchParams({q:`(${q.replace(/[+!(){}\[\]^"~?:\\/]/g,' ')}) AND mediatype:movies`,'fl[]':'identifier,title,language',rows:'16',page:String(page),output:'json'});
  const data=await body(`https://archive.org/advancedsearch.php?${params}`,true,signal);
  return {items:data.response.docs.map(d=>({id:`ia:${d.identifier}`,key:d.identifier,title:d.title||d.identifier,source:'archive',language:language(d.language),thumbnail:`https://archive.org/services/img/${encodeURIComponent(d.identifier)}`,pageUrl:`https://archive.org/details/${encodeURIComponent(d.identifier)}`})),more:page*16<data.response.numFound,total:data.response.numFound};
}
async function commons(q,page,signal) {
  const params=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:`${q} filetype:video`,gsrnamespace:'6',gsrlimit:'16',gsroffset:String((page-1)*16),prop:'videoinfo',viprop:'url|size|mime',viurlwidth:'400'});
  const data=await body(`https://commons.wikimedia.org/w/api.php?${params}`,true,signal);
  if(data.error) throw Error(data.error.info);
  return {items:Object.values(data.query?.pages||{}).map(d=>({id:`wm:${d.pageid}`,title:d.title.replace(/^File:/,''),source:'commons',language:'und',pageUrl:d.videoinfo?.[0]?.descriptionurl,files:(d.videoinfo||[]).filter(f=>f.mime?.startsWith('video/')).map(f=>({url:f.url,name:d.title.slice(5),size:f.size,format:new URL(f.url).pathname.split('.').pop()}))})).filter(d=>d.files.length),more:!!data.continue};
}
async function youtube(q,page,signal) {
  const end=page*12;
  const d=await yt(['--flat-playlist','--dump-single-json','--playlist-start',String(end-11),'--playlist-end',String(end),'--',`ytsearch${end}:${q}`],signal);
  const items=(d.entries||[]).filter(x=>x.id).map(d=>({id:`yt:${d.id}`,key:d.id,title:d.title,source:'youtube',language:language(d.language),duration:d.duration,thumbnail:d.thumbnails?.at(-1)?.url,pageUrl:`https://www.youtube.com/watch?v=${encodeURIComponent(d.id)}`}));
  return {items,more:items.length===12};
}
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const cache=new Map();
const searchCache=new Map();
let activeDownloads=0;
export const server=http.createServer(async(req,res)=>{
  const controller=new AbortController();res.on('close',()=>{if(!res.writableFinished)controller.abort();});const signal=controller.signal;
  try {
    const host=req.headers.host||'';
    if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))return json(res,403,{error:'Solo acceso local.'});
    if(req.headers.origin && req.headers.origin!==`http://${host}`)return json(res,403,{error:'Origen no permitido.'});
    const u=new URL(req.url,`http://${host}`);
    if(req.method!=='GET')return json(res,405,{error:'Método no permitido.'});
    if(u.pathname==='/api/status')return json(res,200,{version:2,youtube:existsSync(ytdlp),web:process.env.BRAVE_SEARCH_API_KEY?'Brave Search API':'Brave Search + Bing RSS',sources:sourceNames});
    if(u.pathname==='/api/search') {
      const q=(u.searchParams.get('q')||'').trim(), source=u.searchParams.get('source'), page=Number(u.searchParams.get('page')||1);
      if(!q||q.length>200||!Number.isInteger(page)||page<1||page>50)return json(res,400,{error:'Búsqueda o página inválida.'});
      const providers={archive,commons,youtube,dailymotion,cuevana,lamovie,okru};if(!Object.hasOwn(providers,source)&&!Object.hasOwn(sourceQueries,source)&&source!=='custom')return json(res,400,{error:'Fuente inválida.'});
      const cacheKey=u.searchParams.toString(),cached=searchCache.get(cacheKey);if(cached&&cached.until>Date.now())return json(res,200,cached.data);
      const data=providers[source]?await providers[source](q,page,signal):await discover(q,page,source,signal,u.searchParams.get('domains'));
      if(searchCache.size>300)searchCache.clear();searchCache.set(cacheKey,{data,until:Date.now()+120000});return json(res,200,data);
    }
    if(u.pathname==='/api/resolve') {
      const raw=u.searchParams.get('item');if(!raw||raw.length>20000)return json(res,400,{error:'Resultado inválido.'});
      const item=JSON.parse(raw), key=JSON.stringify(item);const found=cache.get(key);
      if(found&&found.expires>Date.now())return json(res,200,{files:found.files});
      const files=await resolveItem(item,signal);if(cache.size>300)cache.clear();cache.set(key,{files,expires:Date.now()+120000});
      return json(res,200,{files});
    }
    if(u.pathname==='/api/mega'){await streamMega(req,res,u);return;}
    if(u.pathname==='/api/transcode'){await transcode(req,res,u,host);return;}
    if(u.pathname==='/api/hls-download'){
      if(activeDownloads>=2)return json(res,429,{error:'Ya hay dos descargas de streaming en curso.'});
      const target=u.searchParams.get('url');await address(target);
      const input=`http://${host}/api/media?`+new URLSearchParams({url:target,hls:'1',ticket:u.searchParams.get('ticket')||''});
      const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-protocol_whitelist','http,https,tcp,tls,crypto','-allowed_extensions','ALL','-allowed_segment_extensions','ALL','-extension_picky','0','-i',input,'-c','copy','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1'],{stdio:['ignore','pipe','pipe']});activeDownloads++;
      let started=false,done=false;const finish=()=>{if(!done){done=true;activeDownloads--;}};
      const timer=setTimeout(()=>child.kill('SIGTERM'),4*3600000);timer.unref();
      child.stderr.resume();res.on('close',()=>child.kill('SIGTERM'));child.on('error',()=>{finish();if(!res.headersSent)json(res,502,{error:'No se pudo iniciar FFmpeg.'});});
      child.stdout.on('data',chunk=>{if(!started){started=true;res.writeHead(200,{'Content-Type':'video/mp4','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent((u.searchParams.get('name')||'video').replace(/\.(m3u8|hls)$/i,'')+'.mp4')}`});}if(!res.write(chunk)){child.stdout.pause();res.once('drain',()=>child.stdout.resume());}});
      child.on('close',code=>{clearTimeout(timer);finish();if(code===0&&started)res.end();else if(!res.headersSent)json(res,502,{error:'No se pudo convertir este streaming en archivo MP4.'});else res.destroy();});return;
    }
    if(u.pathname==='/api/media') {
      const sourceHeaders=ticketHeaders(u.searchParams.get('ticket'));
      const remoteRes=await remote(u.searchParams.get('url'),{...sourceHeaders,...(req.headers.range?{Range:req.headers.range}:{})},0,signal);
      const contentType=remoteRes.headers['content-type']||'application/octet-stream';
      const isManifest=/mpegurl/i.test(contentType)||/\.m3u8(?:[?#]|$)/i.test(remoteRes.finalUrl||'');
      if(isManifest){
        let text='';for await(const c of remoteRes){text+=c;if(text.length>2e6){remoteRes.destroy();throw Error('Manifiesto demasiado grande.');}}
        const manifest=rewriteManifest(text,remoteRes.finalUrl||u.searchParams.get('url'),url=>`http://${host}/api/media?`+new URLSearchParams({url,hls:'1',ticket:u.searchParams.get('ticket')||''}));
        res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'}).end(manifest);return;
      }
      if(/text\/|application\/(json|xml|javascript)/i.test(contentType)){remoteRes.destroy();throw Error('La fuente devolvió una página en lugar del archivo.');}
      const ext=(u.searchParams.get('name')||'').split('.').pop().toLowerCase();
      const mime=/application\/octet-stream/i.test(contentType)?({mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',ogv:'video/ogg'}[ext]||contentType):contentType;
      const headers={'Content-Type':mime,'Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=300'};
      for(const k of ['content-length','content-range','accept-ranges'])if(remoteRes.headers[k])headers[k]=remoteRes.headers[k];
      if(u.searchParams.has('download'))headers['Content-Disposition']=`attachment; filename*=UTF-8''${encodeURIComponent((u.searchParams.get('name')||'video.mp4').replace(/[\r\n]/g,''))}`;
      res.writeHead(remoteRes.statusCode,headers);remoteRes.on('error',()=>res.destroy());res.on('close',()=>remoteRes.destroy());remoteRes.pipe(res);return;
    }
    const names={'/':'index.html','/app.js':'app.js','/matching.js':'matching.js','/playback.js':'playback.js','/languages.js':'languages.js','/style.css':'style.css','/hls.js':'../node_modules/hls.js/dist/hls.min.js'};
    if(!Object.hasOwn(names,u.pathname))return json(res,404,{error:'No encontrado.'});
    const name=names[u.pathname];res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript':'text/css','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(await readFile(path.join(root,'public',name)));
  }catch(e){if(res.destroyed)return;if(res.headersSent)res.destroy();else json(res,502,{error:e.killed?'La fuente tardó demasiado.':String(e.message).slice(0,600)});}
});
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT)||4317,'127.0.0.1',()=>console.log('Videoteca en http://localhost:'+(process.env.PORT||4317)));
