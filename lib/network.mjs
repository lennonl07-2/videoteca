import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { lookup } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';

export function publicIP(ip) {
  if(net.isIP(ip)!==4)return false;
  const [a,b]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)));
}
export async function address(raw) {
  const u=new URL(raw);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||(u.port&&!['80','443'].includes(u.port)))throw Error('Se requiere una URL pública HTTP/HTTPS.');
  const ips=await lookup(u.hostname,{all:true,family:4});
  if(!ips.length||ips.some(x=>!publicIP(x.address)))throw Error('No se permite acceder a redes privadas.');
  return {url:u,ip:ips[0]};
}
const agentOptions={keepAlive:true,maxSockets:12,maxFreeSockets:6,timeout:25000};
const agents={'http:':new http.Agent(agentOptions),'https:':new https.Agent(agentOptions)};
export async function remote(raw,headers={},redirects=0,signal) {
  signal?.throwIfAborted();const {url:u,ip}=await address(raw);
  const res=await new Promise((resolve,reject)=>{
    const req=(u.protocol==='https:'?https:http).get(u,{agent:agents[u.protocol],signal,headers:{'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36','Accept-Encoding':'identity',...headers},lookup:(_h,opts,cb)=>cb(null,opts.all?[ip]:ip.address,4)},resolve);
    req.setTimeout(20000,()=>req.destroy(Error('La fuente tardó demasiado.')));req.on('error',reject);
  });
  res.finalUrl=u.href;
  if([301,302,303,307,308].includes(res.statusCode)){
    res.resume();if(redirects>=6)throw Error('Demasiadas redirecciones.');
    const next=new URL(res.headers.location,u);const nextHeaders={...headers};
    if(next.origin!==u.origin){delete nextHeaders.Cookie;delete nextHeaders.Authorization;}
    return remote(next.href,nextHeaders,redirects+1,signal);
  }
  if(res.statusCode>=400){res.resume();throw Error(`La fuente respondió HTTP ${res.statusCode}.`);}
  return res;
}
export async function body(url,json=true,signal){
 const res=await remote(url,{},0,signal);let size=0;const chunks=[];
 for await(const c of res){size+=c.length;if(size>12e6){res.destroy();throw Error('Respuesta demasiado grande.');}chunks.push(c);}
 const s=Buffer.concat(chunks).toString();return json?JSON.parse(s):s;
}
export class Pool {
 constructor(limit){this.limit=limit;this.active=0;this.queue=[];}
 async run(fn,signal){
  signal?.throwIfAborted();
  await new Promise((resolve,reject)=>{
   const enter=()=>{signal?.removeEventListener('abort',abort);this.active++;resolve();};
   const abort=()=>{const i=this.queue.indexOf(enter);if(i>=0)this.queue.splice(i,1);reject(signal.reason);};
   if(this.active<this.limit)enter();else {this.queue.push(enter);signal?.addEventListener('abort',abort,{once:true});}
  });
  try{signal?.throwIfAborted();return await fn();}finally{this.active--;this.queue.shift()?.();}
 }
}

// yt-dlp's generic extractor follows embedded links. Validate every outgoing
// connection through this authenticated loopback proxy, including redirects.
let proxyPromise;
export function extractionProxy(){
 if(proxyPromise)return proxyPromise;
 proxyPromise=new Promise((resolve,reject)=>{
  const secret=randomBytes(24).toString('hex'),auth='Basic '+Buffer.from('videoteca:'+secret).toString('base64');
  const proxy=http.createServer(async(req,res)=>{
   if(req.headers['proxy-authorization']!==auth){res.writeHead(407).end();return;}
   try{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
    const headers={...req.headers};for(const h of ['host','connection','proxy-authorization'])delete headers[h];
    const upstream=await remote(req.url,headers);res.writeHead(upstream.statusCode,upstream.headers);upstream.on('error',()=>res.destroy());res.on('close',()=>upstream.destroy());upstream.pipe(res);
   }catch{res.writeHead(502).end();}
  });
  proxy.on('connect',async(req,socket,head)=>{
   if(req.headers['proxy-authorization']!==auth){socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');return;}
   try{
    const {url,ip}=await address('https://'+req.url);
    const upstream=net.connect({host:ip.address,port:Number(url.port)||443});
    upstream.setTimeout(65000,()=>upstream.destroy());socket.setTimeout(65000,()=>socket.destroy());
    upstream.on('connect',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
    upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
   }catch{socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');}
  });
  proxy.on('error',reject);proxy.listen(0,'127.0.0.1',()=>{proxy.unref();resolve(`http://videoteca:${secret}@127.0.0.1:${proxy.address().port}`);});
 });return proxyPromise;
}
