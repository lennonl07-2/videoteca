import {body} from './network.mjs';
import {decode} from './discovery.mjs';
import {containsAll} from '../public/matching.js';

export function parseSearchLinks(html,base,source,query){
 const items=new Map();
 for(const m of html.matchAll(/<a\b([^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi)){
  try{
   const url=new URL(decode(m[2]),base);
   if(url.origin!==new URL(base).origin||!/^\/(?:video\/\d+|pelicula\/|serie\/)/.test(url.pathname))continue;
   url.search='';url.hash='';
   const title=decode(m[3].match(/\balt="([^"]+)"/)?.[1]||m[3].replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
   if(!containsAll(query,title,''))continue;
   const thumbnail=m[3].match(/<img[^>]*\bsrc="([^"]+)"/)?.[1];
   if(!items.has(url.href))items.set(url.href,{id:`${source}:${url.href}`,source,pageUrl:url.href,title,language:'und',...(thumbnail?{thumbnail:new URL(decode(thumbnail),base).href}:{})});
  }catch{}
 }
 return [...items.values()];
}
export async function cuevana(q,page,signal){
 if(page>1)return {items:[],more:false};
 const url='https://www.cuevana8.plus/search?'+new URLSearchParams({q});
 return {items:parseSearchLinks(await body(url,false,signal),url,'cuevana',q),more:false};
}
export function lamovieItems(data,q){
 const paths={movies:'peliculas',tvshows:'series',animes:'animes',novels:'novelas',episodes:'episodio'};
 return (data.data?.posts||[]).filter(x=>paths[x.type]&&x.slug&&containsAll(q,x.title,'')).map(x=>({
  id:`lamovie:${x._id}`,source:'lamovie',key:String(x._id),title:decode(x.title),pageUrl:`https://lamovie.org/${paths[x.type]}/${encodeURIComponent(x.slug)}`,
  thumbnail:x.images?.poster?'https://lamovie.org/wp-content/uploads'+x.images.poster:undefined,duration:Number(x.runtime)*60||undefined,language:'und'
 }));
}
export async function lamovie(q,page,signal){
 if(page>1)return {items:[],more:false};
 const data=await body('https://lamovie.org/wp-api/v1/search?'+new URLSearchParams({postType:'any',q,postsPerPage:'60'}),true,signal);
 if(data.error)throw Error(data.message||'LaMovie no respondió.');
 return {items:lamovieItems(data,q),more:false};
}
export async function okru(q,page,signal){
 // The public route returns a bounded first page. Do not pretend query-string
 // pagination works: OK silently returns its homepage for unsupported routes.
 if(page>1)return {items:[],more:false};
 const terms=[q,...(!/latino|español|castellano/i.test(q)?[q+' latino']:[])];
 const batches=await Promise.allSettled(terms.map(async term=>{
  const url='https://ok.ru/video/search/'+encodeURIComponent(term).replace(/%20/g,'+');
  return parseSearchLinks(await body(url,false,signal),url,'okru',q);
 }));
 signal?.throwIfAborted();
 if(batches.every(x=>x.status==='rejected'))throw batches[0].reason;
 return {items:[...new Map(batches.flatMap(x=>x.status==='fulfilled'?x.value:[]).map(x=>[x.pageUrl,x])).values()],more:false,warning:batches.some(x=>x.status==='rejected')?'Una consulta de OK.ru falló; se muestran los resultados disponibles.':undefined};
}

export function okVideoFiles(html){
 for(const m of html.matchAll(/data-options="([^"]+)"/g)){
  try{
   const options=JSON.parse(decode(m[1]));let data=options.flashvars?.metadata;
   if(typeof data==='string')data=JSON.parse(data);
   if(!data?.movie||data.movie.status&&data.movie.status!=='OK')continue;
   const movie=data.movie,heights={mobile:144,lowest:240,low:360,sd:480,hd:720,full:1080,quad:1440,ultra:2160};
   return (data.videos||[]).filter(v=>!v.disallowed&&/^https?:\/\//.test(v.url)).map(v=>({url:v.url,title:movie.title,name:movie.title.replace(/\.mp4$/i,'')+'.mp4',duration:Number(movie.duration)||undefined,format:'mp4',transport:'http',height:heights[v.name],formatId:v.name,family:movie.id,language:'und'}));
  }catch{}
 }
 return [];
}
