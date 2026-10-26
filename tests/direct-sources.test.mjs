import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSearchLinks,lamovieItems,okVideoFiles} from '../lib/direct-sources.mjs';
test('Búsquedas directas conservan títulos, eliminan repetidos y rechazan enlaces ajenos',()=>{
 const html='<a href="/video/123?x=1"><img alt="Shrek Latino" src="/poster.jpg"></a><a href="/video/123">Shrek Latino</a><a href="https://ads.example/video/12">Shrek</a><a href="/video/14">Otro título</a>';
 const rows=parseSearchLinks(html,'https://ok.ru/video/search/shrek','okru','shrek');assert.equal(rows.length,1);assert.equal(rows[0].pageUrl,'https://ok.ru/video/123');assert.equal(rows[0].thumbnail,'https://ok.ru/poster.jpg');
 assert.equal(parseSearchLinks('<a href="/pelicula/808/shrek"><span>Shrek</span></a>','https://www.cuevana8.plus/search?q=shrek','cuevana','shrek')[0].title,'Shrek');
});
test('LaMovie convierte el catálogo público en páginas con duración en segundos',()=>{
 const items=lamovieItems({data:{posts:[{_id:1,title:'Shrek (2001)',type:'movies',slug:'shrek-2001',runtime:'90',images:{poster:'/thumbs/a.webp'}},{title:'Otro',type:'movies',slug:'otro'}]}},'shrek');
 assert.equal(items.length,1);assert.equal(items[0].duration,5400);assert.equal(items[0].pageUrl,'https://lamovie.org/peliculas/shrek-2001');
});
test('OK.ru admite metadatos como objeto o texto y omite videos bloqueados',()=>{
 const data={movie:{id:'123',title:'Shrek.mp4',duration:'5405',status:'OK'},videos:[{name:'hd',url:'https://cdn.example/video'},{name:'full',url:'https://cdn.example/no',disallowed:true}]};
 const html=metadata=>'<div data-options="'+JSON.stringify({flashvars:{metadata}}).replace(/"/g,'&quot;')+'"></div>';
 for(const metadata of [data,JSON.stringify(data)]){const files=okVideoFiles(html(metadata));assert.equal(files.length,1);assert.equal(files[0].duration,5405);assert.equal(files[0].height,720);assert.equal(files[0].name,'Shrek.mp4');}
 assert.deepEqual(okVideoFiles(html({...data,movie:{...data.movie,status:'BLOCKED'}})),[]);
});
