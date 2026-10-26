import test from 'node:test';
import assert from 'node:assert/strict';
import {pageLinks,parseRSS,parseBrave,customDomains,sourceQueries,driveEntries,relevantSource} from '../lib/discovery.mjs';
import {rewriteManifest} from '../lib/hls.mjs';
import {choosePlayback,rangeOf} from '../public/playback.js';
import {validateMega} from '../lib/mega.mjs';
import {Pool} from '../lib/network.mjs';
import {containsExcluded,compareResults,durationOf,durationLabel} from '../public/matching.js';
test('Exclusiones por cualquier palabra, tildes, mayúsculas y nombre',()=>{
 assert.equal(containsExcluded('TRÁILER, resumen; corto','Película','trailer.mp4'),true);
 assert.equal(containsExcluded('trailer resumen','RESÚMEN del episodio'),true);
 assert.equal(containsExcluded('trailer resumen','Película completa'),false);
 assert.equal(containsExcluded(' , ; ','Película completa'),false);
});
test('Ordena duración y tamaño descendentes, con desempate y desconocidos al final',()=>{
 const rows=[{id:'unknown',file:{size:0}},{id:'heavy',file:{size:900,duration:50}},{id:'long',file:{size:100,duration:100}},{id:'tie',file:{size:200},item:{duration:100}},{id:'invalid',file:{size:-1,duration:Infinity}}];
 assert.deepEqual([...rows].sort((a,b)=>compareResults(a,b,'duration')).map(x=>x.id),['tie','long','heavy','unknown','invalid']);
 assert.deepEqual([...rows].sort((a,b)=>compareResults(a,b,'size')).map(x=>x.id),['heavy','tie','long','unknown','invalid']);
 assert.equal(durationOf({file:{duration:0},item:{duration:120}}),120);
 assert.equal(durationLabel(3661),'1 h 1 min');assert.equal(durationLabel(61),'1:01 min');
});
test('Descubre alojamientos en JSON y páginas de episodios sin seguir anuncios',()=>{
 const links=pageLinks('<script>{"url":"https://voe.sx/e/123","player":"https://filemoon.sx/e/abc"}</script><a href="/episodio/2">Ver</a><a href="https://ads.example/episodio/x">Ad</a>','https://catalog.example/serie/1');
 assert.ok(links.links.includes('https://voe.sx/e/123'));assert.ok(links.links.includes('https://filemoon.sx/e/abc'));assert.ok(links.links.includes('https://catalog.example/episodio/2'));assert.ok(!links.links.some(x=>x.includes('ads.example')));
 assert.ok(sourceQueries.catalogs.includes('site:lamovie.org'));assert.ok(sourceQueries.catalogs.includes('site:cuevana8.plus'));assert.ok(sourceQueries.streaming.length>=7);assert.ok(sourceQueries.drive.some(x=>x.includes('/drive/folders/')));
 assert.equal(relevantSource({pageUrl:'https://voe.sx.evil.example/e/x'},'streaming'),false);
});
test('Extrae JSON, reproductores incrustados y enlaces de nube sin ejecutar scripts',()=>{
 const html=`<iframe src="/player/1"></iframe><script>{"file":"https:\\/\\/cdn.example.com\\/show.m3u8?x=1&amp;y=2"}</script><a href="https://mega.nz/file/abc#key">Descargar</a><a href="https://drive.google.com/file/d/123/view">Drive</a><source src="/episode.mp4">`;
 const d=pageLinks(html,'https://example.com/series/');assert.ok(d.media.includes('https://cdn.example.com/show.m3u8?x=1&y=2'));assert.ok(d.media.includes('https://example.com/episode.mp4'));assert.deepEqual(d.embeds,['https://example.com/player/1']);assert.equal(d.links.length,2);
});
test('RSS conserva claves MEGA, entidades y títulos CDATA',()=>{
 const items=parseRSS('<item><title><![CDATA[Uno &amp; dos]]></title><link>https://mega.nz/file/abc#key</link></item>','mega');assert.equal(items[0].title,'Uno & dos');assert.equal(items[0].pageUrl,'https://mega.nz/file/abc#key');
});
test('Búsqueda ampliada y dominios propios',()=>{
 for(const source of ['drive','mega','catalogs','dailymotion','vimeo','cloud','social'])assert.ok(sourceQueries[source].length);
 assert.deepEqual(customDomains('https://video.example.com/path, example.org'),['video.example.com','example.org']);assert.throws(()=>customDomains('http://localhost'));assert.throws(()=>customDomains('file:///etc/passwd'));
 assert.equal(relevantSource({pageUrl:'https://www.youtube.com/watch?v=x',title:'Backyardigans'},'drive'),false);
 assert.equal(relevantSource({pageUrl:'https://example.org/serie',title:'Backyardigans',description:'Descarga en Google Drive'},'drive'),true);
});
test('Brave y carpetas Drive extraen únicamente resultados y archivos adecuados',()=>{
 const html='<a href="https://drive.google.com/file/d/123" class="foo l1"><div class="title search-snippet-title">Video &amp; prueba</div></a><a href="https://ads.example/">Ad</a>';
 assert.equal(parseBrave(html,'drive')[0].title,'Video & prueba');assert.equal(parseBrave(html).length,1);
 const data=[[['abcdefghijklmnopqrstuv',[],'Episode.mp4','video/mp4'],['abcdefghijk987654321000',[],'Book.pdf','application/pdf']]];
 const escaped=JSON.stringify(data).replace(/"/g,'\\x22');const folder="window['_DRIVE_ivd'] = '"+escaped+"';";
 assert.deepEqual(driveEntries(folder),[{id:'abcdefghijklmnopqrstuv',name:'Episode.mp4',folder:false}]);
});
test('Manifiestos HLS reescriben listas, segmentos, audio, mapas y claves',()=>{
 const text='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/list.m3u8"\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\nseg.ts\n';
 const out=rewriteManifest(text,'https://cdn.example/video/index.m3u8',url=>'proxy?url='+encodeURIComponent(url));
 for(const path of ['audio/list.m3u8','init.mp4','key.bin','seg.ts'])assert.ok(out.includes(encodeURIComponent('https://cdn.example/video/'+path)));
 assert.throws(()=>rewriteManifest('#EXTM3U\nfile:///etc/passwd','https://example.com/',x=>x));assert.throws(()=>rewriteManifest('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="x"','https://example.com/',x=>x));
});
test('La máxima calidad nunca cambia a otro episodio',()=>{
 const original={name:'one.mp4',family:'one',size:3e9,format:'mp4',url:'a'},light={name:'one.ia.mp4',family:'one',size:5e6,format:'mp4',url:'b'},other={name:'two.mp4',family:'two',size:1e3,format:'mp4',url:'c'};
 assert.equal(choosePlayback(original,[original,light,other]),original);assert.equal(choosePlayback(original,[other]),original);
});
test('Rangos de streaming: seek, sufijos y errores',()=>{
 assert.deepEqual(rangeOf('bytes=50-99',100),{start:50,end:99,partial:true});assert.deepEqual(rangeOf('bytes=-10',100),{start:90,end:99,partial:true});assert.equal(rangeOf('bytes=100-',100),null);assert.equal(rangeOf('bytes=40-30',100),null);assert.equal(rangeOf('bytes=0-1,4-5',100),null);
});
test('MEGA exige un enlace público con clave y valida el dominio',()=>{
 assert.equal(validateMega('https://mega.nz/file/abcd#key'),'https://mega.nz/file/abcd#key');assert.throws(()=>validateMega('https://mega.nz/file/abcd'));assert.throws(()=>validateMega('https://mega.nz.evil.example/file/a#b'));
});
test('Cola limita procesos y cancela trabajos que todavía esperan',async()=>{
 const pool=new Pool(1);let release;const first=pool.run(()=>new Promise(r=>release=r));await Promise.resolve();const c=new AbortController();const second=pool.run(()=>assert.fail('no debe ejecutarse'),c.signal);const rejected=assert.rejects(second);c.abort();await rejected;release();await first;assert.equal(pool.active,0);
});
