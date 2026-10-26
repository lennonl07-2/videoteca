import {body,remote,Pool} from './network.mjs';
const pool=new Pool(3);
const bravePool=new Pool(1);let braveUnavailableUntil=0,nextBraveRequest=0;
async function bravePage(url,signal){
 return bravePool.run(async()=>{
  if(Date.now()<braveUnavailableUntil)throw Error('El buscador web está limitando consultas temporalmente.');
  const delay=Math.max(0,nextBraveRequest-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));signal?.throwIfAborted();nextBraveRequest=Date.now()+1500;
  try{return await body(url,false,signal);}catch(e){if(e.message.includes('429'))braveUnavailableUntil=Date.now()+120000;throw e;}
 },signal);
}
export const sourceNames={archive:'Internet Archive',youtube:'YouTube',web:'Web abierta',drive:'Google Drive',mega:'MEGA',dailymotion:'Dailymotion',vimeo:'Vimeo',social:'Redes de video',cloud:'Otros alojamientos',catalogs:'Catálogos y sitios de series',commons:'Wikimedia',custom:'Mis sitios',link:'Enlace añadido'};
export const sourceQueries={
 web:['video','(filetype:mp4 OR filetype:webm OR filetype:mkv)','ver descargar episodios'],
 drive:['site:drive.google.com/file/d/','site:drive.google.com/drive/folders/','site:docs.google.com/file/','"drive.google.com" (pelicula OR capitulo OR mp4 OR mkv)'],
 mega:['site:mega.nz','"mega.nz" video','"mega.co.nz" capitulos'],
 dailymotion:['site:dailymotion.com/video/','site:dai.ly'],
 vimeo:['site:vimeo.com'],
 social:['site:ok.ru/video','site:vk.com/video','(site:facebook.com/watch OR site:facebook.com/reel OR site:tiktok.com)'],
 cloud:['(site:mediafire.com OR site:dropbox.com)','(site:1drv.ms OR site:onedrive.live.com)','(site:pixeldrain.com OR site:gofile.io OR site:streamtape.com)'],
 catalogs:['site:lamovie.org','site:cuevana8.plus','cuevana pelicula serie online','repelis pelicula serie online','cinecalidad pelicula','la movie pelicula serie','pelisplus pelicula serie','ver online capitulo reproductor','serie descargar mega drive'],
 streaming:['(site:streamwish.com OR site:streamhg.com)','(site:filemoon.sx OR site:filemoon.to OR site:byse.sx)','(site:vidhide.com OR site:vidhidepro.com)','site:voe.sx','(site:doodstream.com OR site:dood.watch OR site:dood.to)','site:streamtape.com','(site:netu.tv OR site:waaw.tv)','(site:mixdrop.co OR site:sendvid.com OR site:mp4upload.com)'],
 okru:['site:ok.ru/video/','site:ok.ru/videoembed/'],
};
sourceNames.streaming='Alojamientos de streaming';sourceNames.okru='OK.ru';
export function isVideoHost(value){
 try{return /(^|\.)(streamwish\.com|streamhg\.com|filemoon\.(sx|to)|byse\.sx|vidhide\.com|vidhidepro\.com|voe\.sx|doodstream\.com|dood\.(watch|to)|streamtape\.com|netu\.tv|waaw\.tv|mixdrop\.co|sendvid\.com|mp4upload\.com|ok\.ru)$/.test(new URL(value).hostname);}catch{return false;}
}
export function decode(s){return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[\da-f]+|\d+);/gi,(_,v)=>{const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v);return n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
export function parseRSS(xml,source='web'){
 return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([,s])=>{
  const get=k=>decode(s.match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`))?.[1]||'');const url=get('link');
  return {id:`${source}:${url}`,title:get('title'),description:get('description').replace(/<[^>]+>/g,''),pageUrl:url,source,language:'und'};
 }).filter(x=>/^https?:\/\//.test(x.pageUrl));
}
export function parseBrave(html,source='web'){
 const items=[];
 for(const m of html.matchAll(/<a\b([^>]*href="(https?:[^\"]+)"[^>]*)>([\s\S]*?)<\/a>/gi)){
  if(!/class="[^"]*\bl1\b/.test(m[1]))continue;
  const pageUrl=decode(m[2]);const titleMatch=m[3].match(/<div[^>]*class="[^"]*search-snippet-title[^>]*>([\s\S]*?)<\/div>/i);
  const title=decode((titleMatch?.[1]||'').replace(/<[^>]+>/g,''));
  if(title)items.push({id:`${source}:${pageUrl}`,title,pageUrl,source,language:'und'});
 }return items;
}
export function customDomains(raw){
 const values=String(raw||'').split(/[\s,]+/).filter(Boolean);
 if(values.length>30)throw Error('Puedes añadir hasta 30 dominios por búsqueda.');
 return [...new Set(values.map(x=>{let host;try{host=new URL(x.includes('://')?x:'https://'+x).hostname;}catch{throw Error('Dominio inválido.');}if(!/^[a-z\d.-]+\.[a-z]{2,}$/i.test(host))throw Error('Dominio inválido.');return host;}))];
}
export function relevantSource(item,source){
 const text=`${item.pageUrl} ${item.title} ${item.description||''}`;
 if(source==='streaming')return isVideoHost(item.pageUrl);
 if(source==='okru')return /^https?:\/\/(?:[^/]+\.)?ok\.ru\/(?:video|videoembed)\//i.test(item.pageUrl);
 const patterns={drive:/(drive\.google|docs\.google|google drive)/i,mega:/(mega\.nz|mega\.co\.nz|\bmega\b)/i,vimeo:/vimeo/i,social:/(ok\.ru|vk\.com|facebook|tiktok)/i,cloud:/(mediafire|dropbox|onedrive|1drv\.ms|pixeldrain|gofile|streamtape)/i};
 return !patterns[source]||patterns[source].test(text);
}
export async function discover(q,page,source,signal,domains=''){
 const suffixes=source==='custom'?customDomains(domains).map(d=>'site:'+d):sourceQueries[source];
 if(!suffixes?.length)throw Error('Añade al menos un dominio para buscar en Mis sitios.');
 let successes=0;const errors=[];
 const batches=await Promise.all(suffixes.map(suffix=>pool.run(async()=>{
  const term=`${q} ${suffix}`;
  try{
   if(process.env.BRAVE_SEARCH_API_KEY){
    const res=await remote('https://api.search.brave.com/res/v1/web/search?'+new URLSearchParams({q:term,count:'15',offset:String(Math.min(page-1,9)),safesearch:'off'}),{'X-Subscription-Token':process.env.BRAVE_SEARCH_API_KEY},0,signal);
    let raw='';for await(const c of res)raw+=c;const d=JSON.parse(raw);successes++;
    return(d.web?.results||[]).map(x=>({id:`${source}:${x.url}`,title:x.title,description:x.description,pageUrl:x.url,source,language:'und'})).filter(x=>relevantSource(x,source));
   }
   let brave=[];
   try{const html=await bravePage('https://search.brave.com/search?'+new URLSearchParams({q:term,source:'web',offset:String(page-1),safesearch:'off'}),signal);brave=parseBrave(html,source).filter(x=>relevantSource(x,source));}catch(e){if(signal?.aborted)throw e;errors.push(e.message);}
   if(brave.length){successes++;return brave;}
   const xml=await body('https://www.bing.com/search?'+new URLSearchParams({q:term,format:'rss',first:String((page-1)*10+1),adlt:'off'}),false,signal);successes++;
   const items=parseRSS(xml,source).filter(x=>relevantSource(x,source));
   // Bing RSS can silently drop site: constraints. Do not report unrelated
   // domains as if they were results from a selected platform.
   const sites=[...suffix.matchAll(/site:([a-z0-9.-]+)/gi)].map(m=>m[1]);
   return sites.length?items.filter(x=>sites.some(site=>{const host=new URL(x.pageUrl).hostname;return host===site||host.endsWith('.'+site);})):items;
  }catch(e){if(signal?.aborted)throw e;errors.push(e.message);return [];}
 },signal)));
 if(!successes)throw Error(errors[0]||'No se pudo consultar el buscador.');
 const items=[...new Map(batches.flat().map(x=>[x.pageUrl,x])).values()];
 return {items,more:items.length>0&&page<(process.env.BRAVE_SEARCH_API_KEY?10:50),queries:suffixes.length,warning:errors.length?'Buscador principal limitado o no disponible; se usó la alternativa. La cobertura puede ser menor.':undefined};
}
export async function dailymotion(q,page,signal){
 const d=await body('https://api.dailymotion.com/videos?'+new URLSearchParams({search:q,fields:'id,title,language,thumbnail_360_url,duration',limit:'16',page:String(page),family_filter:'false'}),true,signal);
 if(d.error)throw Error(d.error.message||'Dailymotion no respondió.');
 return {items:(d.list||[]).map(x=>({id:'dm:'+x.id,title:x.title,source:'dailymotion',language:x.language||'und',thumbnail:x.thumbnail_360_url,duration:x.duration,pageUrl:'https://www.dailymotion.com/video/'+x.id})),more:!!d.has_more,total:d.total};
}

export function pageLinks(html,base){
 // Parse ordinary attributes plus common JSON player configurations, without executing scripts.
 const text=decode(html).replace(/\\u002[fF]/g,'/').replace(/\\\//g,'/').replace(/\\u0026/g,'&').replace(/\\u003[dD]/g,'=');
 const media=new Set(),embeds=new Set(),links=new Set();
 const add=(set,value)=>{try{const u=new URL(value,base);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)set.add(u.href);}catch{}};
 for(const m of text.matchAll(/(?:https?:\/\/|\/\/)[^\s"'<>\\]+/g)){
  const url=m[0];if(/\.(mp4|webm|m3u8|ogv|m4v|mov|mkv)(?:[?#]|$)/i.test(url))add(media,url);
  else if(isVideoHost(url.startsWith('//')?'https:'+url:url))add(links,url);
  else if(/(?:mega\.(?:nz|co\.nz)\/(?:file|folder|#!|#F!)|drive\.google\.com\/(?:file|drive\/folders)|docs\.google\.com\/file)/i.test(url))add(links,url);
 }
 for(const m of text.matchAll(/<(?:video|source)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi))add(media,m[1]);
 for(const m of text.matchAll(/<(?:iframe|embed)\b[^>]*?\b(?:src|data-src)\s*=\s*["']([^"']+)["']/gi))add(embeds,m[1]);
 for(const m of text.matchAll(/\bdata-tr\s*=\s*["'](https?:[^"']+)["']/gi))add(embeds,m[1]);
 for(const m of text.matchAll(/(?:["'](?:file|src|contentUrl|embedUrl|url)["']\s*:\s*|(?:href|data-video|data-src|src)\s*=\s*)["']([^"']+)["']/gi)){
  if(/\.(mp4|webm|m3u8|ogv|m4v|mov|mkv)(?:[?#]|$)/i.test(m[1]))add(media,m[1]);
  if(/(?:mega\.(?:nz|co\.nz)|drive\.google\.com|dailymotion\.com\/video|vimeo\.com\/\d|streamtape\.|ok\.ru\/video)/i.test(m[1]))add(links,m[1]);
 }
 for(const m of text.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)){
  try{const u=new URL(m[1],base);if(u.hostname===new URL(base).hostname&&/\/(?:ver|watch|pelicula|peliculas|movie|movies|episodio|episodios|episode|episodes|capitulo|capitulos)\//i.test(u.pathname))add(links,u.href);}catch{}
 }
 return {media:[...media].slice(0,80),embeds:[...embeds].slice(0,8),links:[...links].slice(0,20)};
}
export function driveEntries(html){
 const raw=html.match(/window\[['"]_DRIVE_ivd['"]\]\s*=\s*'((?:\\.|[^'])*)'/)?.[1];if(!raw)return [];
 let data;try{data=JSON.parse(raw.replace(/\\x([a-f\d]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))).replace(/\\'/g,"'"));}catch{return [];}
 const out=[];const visit=value=>{
  if(!Array.isArray(value))return;
  if(typeof value[0]==='string'&&/^[\w-]{20,}$/.test(value[0])&&typeof value[2]==='string'&&typeof value[3]==='string'&&(value[3].startsWith('video/')||value[3]==='application/vnd.google-apps.folder'))out.push({id:value[0],name:value[2],folder:value[3]==='application/vnd.google-apps.folder'});
  else for(const child of value)visit(child);
 };visit(data);return [...new Map(out.map(x=>[x.id,x])).values()];
}
