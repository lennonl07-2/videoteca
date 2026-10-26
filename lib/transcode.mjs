import {spawn} from 'node:child_process';
import {address} from './network.mjs';
import {validateMega} from './mega.mjs';
let active=0;
export function transcodeArgs(input,start=0){
 return ['-hide_banner','-loglevel','error','-nostdin','-protocol_whitelist','http,https,tcp,tls,crypto','-ss',String(start),'-i',input,'-map','0:v:0','-map','0:a:0?','-sn','-dn','-c:v','libx264','-preset','veryfast','-crf','23','-threads','2','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','frag_keyframe+empty_moov+default_base_moof','-frag_duration','1000000','-f','mp4','pipe:1'];
}
export async function transcode(req,res,u,host){
 if(active>=2){res.writeHead(429).end('Ya hay dos conversiones en curso. Cierra otro reproductor.');return;}
 const target=u.searchParams.get('url'),start=Number(u.searchParams.get('start')||0),mega=u.searchParams.get('transport')==='mega';
 if(!Number.isFinite(start)||start<0||start>604800)throw Error('Posición inválida.');
 if(mega)validateMega(target);else await address(target);
 const input=`http://${host}/api/${mega?'mega':'media'}?`+new URLSearchParams({url:target,node:u.searchParams.get('node')||'',ticket:u.searchParams.get('ticket')||''});
 if(res.destroyed)return;
 const child=spawn(process.env.FFMPEG_PATH||'ffmpeg',transcodeArgs(input,start),{stdio:['ignore','pipe','pipe']});active++;
 let finished=false;
 const finish=()=>{if(!finished){finished=true;active--;clearTimeout(startup);clearTimeout(lifetime);}};
 const stop=()=>{child.kill('SIGTERM');};
 const startup=setTimeout(()=>{if(!res.headersSent){res.writeHead(504).end('La conversión no pudo comenzar.');stop();}},45000);
 const lifetime=setTimeout(stop,4*3600000);lifetime.unref();
 child.stderr.resume();res.on('close',stop);
 child.on('error',()=>{finish();if(!res.headersSent)res.writeHead(503).end('No se pudo iniciar FFmpeg. Instálalo para activar el modo compatible.');});
 child.stdout.on('data',chunk=>{
  clearTimeout(startup);if(res.destroyed)return stop();
  if(!res.headersSent)res.writeHead(200,{'Content-Type':'video/mp4','Content-Disposition':'inline','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if(!res.write(chunk)){child.stdout.pause();res.once('drain',()=>child.stdout.resume());}
 });
 child.on('close',code=>{finish();if(!res.headersSent)res.writeHead(502).end('La fuente no pudo convertirse.');else if(code===0)res.end();else res.destroy();});
}
