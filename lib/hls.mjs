export function rewriteManifest(text,base,wrap){
 if(!text.trimStart().startsWith('#EXTM3U'))throw Error('La fuente no devolvió un manifiesto HLS.');
 if(/#EXT-X-SESSION-KEY|KEYFORMAT="(?!identity")|METHOD=SAMPLE-AES/i.test(text))throw Error('Este streaming usa protección no compatible.');
 const url=value=>{const u=new URL(value,base);if(!['https:','http:'].includes(u.protocol))throw Error('Protocolo de fragmento no permitido.');return wrap(u.href);};
 return text.split(/\r?\n/).map(line=>{
  if(!line.trim())return line;
  if(line.startsWith('#'))return line.replace(/URI="([^"]+)"/g,(_,v)=>`URI="${url(v)}"`);
  return url(line.trim());
 }).join('\n');
}
