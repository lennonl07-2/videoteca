import {containsAll,containsExcluded,compareResults,durationOf,durationLabel} from './matching.js';
import {choosePlayback,family,groupRows,compareQuality} from './playback.js';
import {declaredLanguage,languageRank,matchesLanguage} from './languages.js';
const $=s=>document.querySelector(s),names={archive:'Internet Archive',commons:'Wikimedia',youtube:'YouTube',web:'Web abierta',drive:'Google Drive',mega:'MEGA',dailymotion:'Dailymotion',vimeo:'Vimeo',social:'Redes de video',cloud:'Otros alojamientos',catalogs:'Catálogos y series',custom:'Mis sitios',link:'Enlace añadido'},langs={es:'Español',en:'Inglés',pt:'Portugués',fr:'Francés',und:'Sin identificar'};
let results=[],saved=[],tab='results',run=0,controller,query='',pages={},hasMore={},busy=false,displayLimit=120,paintPending=false;
names.streaming='Alojamientos de streaming';names.okru='OK.ru';names.cuevana='Cuevana · directa';names.lamovie='LaMovie · directa';
for(const source of ['cuevana','lamovie','okru','streaming']){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name='source';input.value=source;input.checked=true;label.append(input,document.createTextNode(' '+names[source]));$('#sourceFilters').append(label);}
const progressBar=node('progress');progressBar.id='searchProgress';progressBar.max=100;progressBar.value=0;progressBar.setAttribute('aria-label','Avance de la búsqueda');
const progressDetail=node('p');progressDetail.id='progressDetail';$('#progress').insertBefore(progressBar,$('#sourcesStatus'));$('#progress').insertBefore(progressDetail,$('#sourcesStatus'));
Object.assign(langs,{'es-419':'Español latino','es-ES':'Castellano'});
$('#language').replaceChildren(...[['all','Todos · español primero'],['es','Español · todas las variantes'],['es-419','Español latino'],['es-ES','Castellano'],['und','Sin identificar'],['en','Inglés'],['pt','Portugués'],['fr','Francés']].map(([value,label])=>{const o=node('option',label);o.value=value;return o;}));
const searchLog=node('details');searchLog.id='searchLog';searchLog.hidden=true;searchLog.append(node('summary','Detalles de las fuentes'),node('pre'));$('#notice').after(searchLog);
const cards=new Map(),resultKeys=new Set(),seenPages=new Set();
try{saved=JSON.parse(localStorage.getItem('videoteca.saved')||'[]');if(!Array.isArray(saved))saved=[];}catch{}
function node(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;}
async function api(url,signal){const timeout=AbortSignal.timeout(60000);let r;try{r=await fetch(url,{signal:signal?AbortSignal.any([signal,timeout]):timeout});}catch(e){if(e instanceof TypeError)throw Error('No se pudo conectar con Videoteca. Abre «Abrir Videoteca.command» y vuelve a intentarlo.');throw e;}const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo consultar la fuente.');return d;}
const size=n=>n?n>=1e9?(n/1e9).toFixed(1)+' GB':(n/1e6).toFixed(1)+' MB':'Tamaño no informado';
const key=r=>`${r.item?.pageUrl||r.item?.id||r.source}:${r.file.node||r.file.name}:${r.file.formatId||r.file.height||''}:${r.file.language||''}`;
function media(r,download=false){const f=r.file,p=new URLSearchParams({url:f.url,name:f.name,...(f.ticket?{ticket:f.ticket}:{}),...(f.node?{node:f.node}:{}),...(download?{download:'1'}:{})});return `/api/${f.transport==='mega'?'mega':download&&(f.transport==='hls'||f.format==='hls')?'hls-download':'media'}?${p}`;}
function save(r){const i=saved.findIndex(x=>key(x)===key(r));if(i>=0)saved.splice(i,1);else saved.push(r);try{localStorage.setItem('videoteca.saved',JSON.stringify(saved));}catch{$('#notice').textContent='No se pudo guardar en este navegador. Exporta los enlaces para conservarlos.';}render();}
function visible(){const lang=$('#language').value;return groupRows((tab==='saved'?saved:results).map(r=>({...r,language:declaredLanguage(r.language,`${r.title} ${r.file.name}`)}))).filter(r=>!containsExcluded($('#exclude').value,r.title,r.item?.title,r.file.name)&&(matchesLanguage(lang,r.language)||(lang!=='und'&&$('#unknown').checked&&r.language==='und'))).sort((a,b)=>languageRank(a.language)-languageRank(b.language)||compareResults(a,b,$('#sort').value));}
function scheduleRender(){if(paintPending)return;paintPending=true;requestAnimationFrame(()=>{paintPending=false;render();});}
function cardFor(r){
 const k=key(r);if(cards.has(k))return cards.get(k);const card=node('article',null,'card');card.dataset.key=k;
 const preview=node('div',null,'preview');preview.append(node('span','▷'));if(r.thumbnail){const img=node('img');img.src=r.thumbnail;img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();preview.append(img);}preview.append(node('span',names[r.source]||r.source,'sourceBadge'));
 const content=node('div',null,'cardBody');content.append(node('h3',r.title),node('p',r.file.name,'filename'),node('div',`${langs[r.language]||langs.und} · ${(r.file.format||'VIDEO').toUpperCase()}${r.file.height?' · '+r.file.height+'p':''} · ${size(r.file.size)}${r.file.sizeApprox?' aprox.':''} · ${durationLabel(durationOf(r))}`,'meta'));
 const actions=node('div',null,'actions'),play=node('button','▷ Reproducir'),download=node('a','↓','button'),bookmark=node('button','+ Guardar','save');
 if(r.file.transport==='page'){
  const link=node('a','Ver en sitio ↗','button');link.href=r.item.pageUrl;link.target='_blank';link.rel='noopener noreferrer';
  const state=node('p',r.state||'Página encontrada · video sin extraer','extractionState');
  play.textContent='Extraer video';play.onclick=()=>openPlayer(r);bookmark.onclick=()=>save(r);actions.append(link,play,bookmark);content.append(state,actions);card.append(preview,content);cards.set(k,card);return card;
 }
 play.onclick=()=>openPlayer(r);bookmark.onclick=()=>save(r);actions.append(play,bookmark);content.append(actions);card.append(preview,content);cards.set(k,card);return card;
}
function render(){
 $('#count').textContent=results.length;$('#savedCount').textContent=saved.length;$('#resultsTab').classList.toggle('selected',tab==='results');$('#savedTab').classList.toggle('selected',tab==='saved');
 const all=visible(),rows=all.slice(0,displayLimit),wanted=new Set(rows.map(key));
 for(const child of [...$('#grid').children])if(!wanted.has(child.dataset.key))child.remove();
 const grid=$('#grid');for(const [i,r] of rows.entries()){const card=cardFor(r);card.querySelector('.save').textContent=saved.some(x=>key(x)===key(r))?'✓ Guardado':'+ Guardar';if(grid.children[i]!==card)grid.insertBefore(card,grid.children[i]||null);}$('#empty').hidden=rows.length>0;
 $('#count').textContent=tab==='results'?all.length:groupRows(results).length;$('#savedCount').textContent=groupRows(saved).length;
 $('#empty h2').textContent=busy?'Buscando archivos de video…':tab==='saved'?'Los videos que elijas se guardarán aquí':query?'No hay archivos que coincidan todavía':'Tu próxima colección empieza aquí';
 $('#empty p').textContent=query?'Puedes ampliar las rondas, añadir sitios o ajustar el idioma y las palabras excluidas. Los archivos deben contener todas las palabras de búsqueda en el título y nombre.':'Busca por palabras o pega un enlace público para extraer los archivos de video.';
 $('#example').hidden=!!query||tab==='saved';$('#more').hidden=busy||tab==='saved'||!Object.values(hasMore).some(Boolean);$('#showMore').hidden=all.length<=displayLimit;$('#showMore').textContent=`Ver todo (${all.length})`;
}
let hls=null,playerRun=0,playerRow=null,variants=[],fallback=false,playController=null,diagnostics=null,converted=false,offset=0;
$('#download').hidden=true;$('#direct').textContent='Ver en otra pestaña ↗';
const controls=$('.playbackControls'),mode=node('select');mode.id='playerMode';mode.setAttribute('aria-label','Modo de reproducción');for(const [value,label]of [['auto','Reproducción automática'],['compatible','Modo compatible']]){const o=node('option',label);o.value=value;mode.append(o);}controls.append(mode);
const hlsQuality=node('select');hlsQuality.id='hlsQuality';hlsQuality.hidden=true;hlsQuality.setAttribute('aria-label','Calidad del streaming');controls.append(hlsQuality);hlsQuality.onchange=()=>{if(hls)hls.currentLevel=Number(hlsQuality.value);};
for(const [label,action]of [['−10 s',()=>seekPlayback(playPosition()-10)],['+10 s',()=>seekPlayback(playPosition()+10)],['Pantalla completa',()=>$('#video').requestFullscreen?.().catch(()=>{})],['Ventana flotante',()=>$('#video').requestPictureInPicture?.().catch(()=>{})]]){const b=node('button',label,'quiet');b.type='button';b.onclick=action;controls.append(b);}
const timeline=node('input');timeline.id='timeline';timeline.type='range';timeline.min=0;timeline.step=1;timeline.value=0;timeline.setAttribute('aria-label','Posición del video');controls.append(timeline);timeline.onchange=()=>seekPlayback(Number(timeline.value));
const playPosition=()=>offset+($('#video').currentTime||0);
function seekPlayback(position){const f=variants[Number($('#quality').value)];if(!f)return;const duration=f.duration||playerRow.item?.duration||0;position=Math.max(0,duration?Math.min(position,duration-1):position);if(converted)startVideo(f,position,true);else $('#video').currentTime=position;}
mode.onchange=()=>{const f=variants[Number($('#quality').value)];if(f)startVideo(f,playPosition(),mode.value==='compatible');};
$('#video').addEventListener('timeupdate',()=>{const duration=variants[Number($('#quality').value)]?.duration||playerRow?.item?.duration||$('#video').duration;timeline.hidden=!Number.isFinite(duration)||duration<=0;if(!timeline.hidden){timeline.max=duration;timeline.value=playPosition();}});
$('#direct').onclick=e=>{e.preventDefault();if(!playerRow)return;const id=crypto.randomUUID();try{localStorage.setItem('videoteca.watch.'+id,JSON.stringify({row:playerRow,until:Date.now()+3600000}));window.open('/?watch='+id,'_blank','noopener');}catch{$('#playerError').textContent='No se pudo abrir otra pestaña. Usa este reproductor.';}};
function destroyPlayback(){hls?.destroy();hls=null;clearInterval(diagnostics);$('#video').pause();$('#video').removeAttribute('src');$('#video').load();}
async function fresh(r,signal){
 if(r.source==='commons'||(r.source==='archive'&&r.files?.length))return r;
 const d=await api('/api/resolve?'+new URLSearchParams({item:JSON.stringify(r.item)}),signal);const file=d.files.find(f=>f.node===r.file.node&&f.name===r.file.name&&f.formatId===r.file.formatId)||d.files[0];
 if(!file)throw Error('La fuente ya no ofrece un archivo accesible.');return {...r,file,files:d.files.filter(f=>family(f)===family(file)&&(f.language||'und')===(file.language||'und')).slice(0,30)};
}
async function refreshDownload(event,r,anchor){if(['archive','commons'].includes(r.source))return;event.preventDefault();anchor.setAttribute('aria-busy','true');try{const updated=await fresh(r);const a=node('a');a.href=media(updated,true);a.click();}catch(e){$('#notice').textContent=e.message;}finally{anchor.removeAttribute('aria-busy');}}
const qualityName=f=>`${f.height?f.height+'p · ':''}${(f.format||'video').toUpperCase()}${f.fps?' · '+Math.round(f.fps)+' fps':''}${f.size?' · '+size(f.size):''}`;
async function openPlayer(r){
 const current=++playerRun;playController?.abort();playController=new AbortController();destroyPlayback();$('#playerTitle').textContent=r.title;$('#playerSource').textContent=names[r.source];$('#playerError').textContent='';$('#playbackStatus').textContent='Preparando video…';$('#speed').value='1';$('#quality').replaceChildren();$('#download').removeAttribute('href');$('#direct').removeAttribute('href');if(!$('#player').open)$('#player').showModal();
 try{r=await fresh(r,playController.signal);if(current!==playerRun)return;}catch(e){if(current===playerRun)$('#playerError').textContent=e.message;return;}
 playerRow=r;variants=r.files?.length?[...r.files]:[r.file];if(!variants.some(f=>f.url===r.file.url&&f.node===r.file.node))variants.push(r.file);
 const best=choosePlayback(r.file,variants);variants.sort(compareQuality);mode.value='auto';
 for(const [i,f] of variants.entries()){const option=node('option',qualityName(f)+(f===best?' · máxima calidad':''));option.value=i;$('#quality').append(option);}$('#quality').value=String(variants.indexOf(best));startVideo(best,0);
 let prevFrames=0,prevTime=performance.now();diagnostics=setInterval(()=>{const v=$('#video');if(v.paused)return;const q=v.getVideoPlaybackQuality?.(),now=performance.now(),fps=q?Math.round((q.totalVideoFrames-prevFrames)*1000/(now-prevTime)):0;prevFrames=q?.totalVideoFrames||0;prevTime=now;let buffered=0;for(let i=0;i<v.buffered.length;i++)if(v.buffered.start(i)<=v.currentTime&&v.buffered.end(i)>=v.currentTime)buffered=v.buffered.end(i)-v.currentTime;$('#playbackStatus').textContent=`${v.playbackRate}× · ${Math.round(buffered)} s cargados${fps>0?' · '+fps+' fps mostrados':''}${q?.droppedVideoFrames?' · '+q.droppedVideoFrames+' fotogramas perdidos':''}`;},1500);
}
function startVideo(file,position=0,forceCompatible=false){
 hlsQuality.hidden=true;hlsQuality.replaceChildren();
 const knownDuration=file.duration||playerRow?.item?.duration||0;timeline.hidden=!knownDuration;timeline.max=knownDuration||1;timeline.value=position;
 hls?.destroy();hls=null;const v=$('#video');v.pause();v.removeAttribute('src');v.load();v.defaultPlaybackRate=1;v.playbackRate=Number($('#speed').value);v.preservesPitch=true;
 converted=forceCompatible||mode.value==='compatible'||['mkv','avi','mpg','mpeg','mov'].includes(file.format);offset=converted?position:0;fallback=converted;
 const row={...playerRow,file};$('#direct').href='#';$('#playbackStatus').textContent=converted?'Convirtiendo para reproducir en streaming…':'Cargando video…';$('#playerError').textContent='';
 v.onloadedmetadata=()=>{if(!converted&&position>0&&Number.isFinite(v.duration))v.currentTime=Math.min(position,v.duration);v.playbackRate=Number($('#speed').value);v.play().catch(()=>{});};
 if(converted){v.src='/api/transcode?'+new URLSearchParams({url:file.url,name:file.name,transport:file.transport||'http',ticket:file.ticket||'',node:file.node||'',start:String(position)});v.play().catch(()=>{});return;}
 if(file.transport==='hls'||file.format==='hls'){
  if(window.Hls?.isSupported()){hls=new Hls({enableWorker:true,capLevelToPlayerSize:false,maxBufferLength:45,backBufferLength:30,startLevel:-1});hls.loadSource(media(row));hls.attachMedia(v);hls.on(Hls.Events.MANIFEST_PARSED,()=>{if(!hls)return;let best=0;hls.levels.forEach((level,i)=>{if((level.height||level.bitrate)>(hls.levels[best].height||hls.levels[best].bitrate))best=i;const option=node('option',level.height?level.height+'p':Math.round(level.bitrate/1000)+' kbps');option.value=i;hlsQuality.append(option);});hls.currentLevel=best;hlsQuality.value=best;hlsQuality.hidden=hls.levels.length<2;});hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)startVideo(file,playPosition(),true);});}else v.src=media(row);
 }else v.src=media(row);
 v.play().catch(()=>{});
}
$('#video').onerror=()=>{if(!$('#player').open||!playerRow)return;const f=variants[Number($('#quality').value)];if(f&&!fallback){startVideo(f,playPosition(),true);return;}$('#playerError').textContent='No se pudo reproducir esta fuente ni convertirla. Prueba otra calidad o vuelve a extraer el enlace. El modo compatible necesita FFmpeg.';};
$('#video').onwaiting=()=>$('#playbackStatus').textContent='Esperando datos de la fuente…';$('#speed').onchange=()=>{$('#video').playbackRate=Number($('#speed').value);};$('#quality').onchange=()=>startVideo(variants[Number($('#quality').value)],playPosition());
$('#closePlayer').onclick=()=>$('#player').close();$('#player').addEventListener('close',()=>{++playerRun;playController?.abort();destroyPlayback();playerRow=null;});
class WorkQueue{constructor(limit){this.limit=limit;this.active=0;this.queue=[];}run(fn,signal){return new Promise((resolve,reject)=>{this.queue.push({fn,signal,resolve,reject});this.pump();});}pump(){while(this.active<this.limit&&this.queue.length){const j=this.queue.shift();if(j.signal?.aborted){j.reject(j.signal.reason);continue;}this.active++;Promise.resolve().then(j.fn).then(j.resolve,j.reject).finally(()=>{this.active--;this.pump();});}}}
const searches=new WorkQueue(4),resolvers=new WorkQueue(5);
function addFiles(item,files,filter=true){let found=0;for(const file of files){if(!/^https?:\/\//i.test(file.url))continue;const title=file.title||item.title||file.name;if(filter&&!containsAll(query,`${item.title||''} ${file.title||''}`,file.name))continue;const row={title,source:item.source,thumbnail:item.thumbnail,language:file.language&&file.language!=='und'?file.language:item.language||'und',file,item,files:files.filter(f=>family(f)===family(file)).slice(0,30)};const k=key(row);if(resultKeys.has(k))continue;resultKeys.add(k);results.push(row);found++;}return found;}
function addPage(item){
 if(!containsAll(query,item.title,''))return;
 const file={url:item.pageUrl,name:item.title,transport:'page',format:'página'},row={title:item.title,source:item.source,language:item.language||'und',thumbnail:item.thumbnail,item,file,state:'En cola para extraer video…'};
 const k=key(row);if(!resultKeys.has(k)){resultKeys.add(k);results.push(row);}return row;
}
function pageState(row,state){if(!row)return;row.state=state;const card=cards.get(key(row));if(card)card.querySelector('.extractionState').textContent=state;}
function removePage(row){if(!row)return;const k=key(row);results=results.filter(r=>key(r)!==k);resultKeys.delete(k);cards.delete(k);}
async function waitForPlayer(signal){while($('#player').open&&!signal.aborted)await new Promise(resolve=>setTimeout(resolve,300));signal.throwIfAborted();}
async function search(more=false){
 const priority=['cuevana','lamovie','okru'];const sources=[...document.querySelectorAll('input[name=source]:checked')].map(e=>e.value).sort((a,b)=>(priority.includes(a)?0:1)-(priority.includes(b)?0:1));if(!sources.length){$('#notice').textContent='Selecciona al menos una fuente.';return;}const nextQuery=$('#query').value.trim();if(!more&&!nextQuery)return;
 controller?.abort();controller=new AbortController();const signal=controller.signal,token=++run;if(!more){query=nextQuery;results=[];pages={};hasMore={};resultKeys.clear();seenPages.clear();cards.clear();$('#grid').replaceChildren();displayLimit=120;}
 const rounds=more?1:Number($('#depth').value);tab='results';busy=true;$('#notice').textContent='';$('#progress').hidden=false;$('#progress').dataset.state='running';$('#stop').hidden=false;$('#searchButton').textContent='Reiniciar búsqueda ↻';$('#sourcesStatus').replaceChildren();render();let checked=0,matched=0,discovered=0,completed=0;
 const errors=[],active=sources.filter(s=>!more||hasMore[s]!==false),fractions=new Map(active.map(s=>[s,0])),started=Date.now();
 const update=()=>{if(token!==run)return;const percent=Math.min(99,Math.floor([...fractions.values()].reduce((a,b)=>a+b,0)/Math.max(1,active.length)*100));progressBar.value=percent;$('#progressTitle').textContent=`Buscando… ${percent}% · ${results.length} resultados encontrados`;progressDetail.textContent=`${completed} de ${active.length} fuentes terminadas · ${checked} de ${discovered} páginas revisadas · ${Math.floor((Date.now()-started)/1000)} s${$('#player').open?' · Extracción en pausa mientras ves el video':''}`;};
 update();const clock=setInterval(update,1000);
 await Promise.allSettled(active.map(async source=>{
  const sourceSignal=AbortSignal.any([signal,AbortSignal.timeout(150000)]);
  const status=node('span',`${names[source]}: en cola…`);$('#sourcesStatus').append(status);let found=0,failures=0,unresolved=0;
  try{for(let round=0;round<rounds;round++){
   sourceSignal.throwIfAborted();status.textContent=`${names[source]}: buscando…`;const page=(pages[source]||0)+1;const data=await searches.run(()=>api('/api/search?'+new URLSearchParams({q:query,source,page,domains:$('#domains').value}),sourceSignal),sourceSignal);if(token!==run)return;pages[source]=page;hasMore[source]=data.more;if(data.warning)errors.push(`${names[source]}: ${data.warning}`);
   const items=data.items.filter(item=>{const id=item.pageUrl||item.id;if(seenPages.has(id))return false;seenPages.add(id);return true;});items.sort((a,b)=>Number(containsAll(query,b.title,''))-Number(containsAll(query,a.title,'')));let pending=items.length;
   const pageRows=new Map(items.map(item=>[item.pageUrl,addPage(item)]));discovered+=items.length;fractions.set(source,(round+.25)/rounds);update();scheduleRender();
   await Promise.allSettled(items.map(item=>resolvers.run(async()=>{const row=pageRows.get(item.pageUrl);try{await waitForPlayer(sourceSignal);pageState(row,'Extrayendo video…');const {files}=item.files?{files:item.files}:await api('/api/resolve?'+new URLSearchParams({item:JSON.stringify(item)}),sourceSignal);if(token!==run)return;if(!files.length)unresolved++;const added=addFiles(item,files);found+=added;matched+=added;if(added)removePage(row);else pageState(row,'Sin archivo extraído · disponible en su sitio');}catch(e){if(token===run){failures++;pageState(row,sourceSignal.aborted?'Extracción interrumpida · abre el sitio':`No se pudo extraer · ${e.message}`);}}finally{checked++;pending--;if(token===run){fractions.set(source,(round+.25+.75*(items.length-pending)/Math.max(1,items.length))/rounds);status.textContent=`${names[source]}: ${found} archivos · ${pending} pendientes`;update();scheduleRender();}}},sourceSignal)));
   if(!hasMore[source])break;
  }if(token===run)status.textContent=`${names[source]}: ${found} archivos${failures?' · '+failures+' sin acceso':''}${unresolved?' · '+unresolved+' sin archivo directo':''}`;
  }catch(e){if(!signal.aborted&&token===run){status.textContent=`${names[source]}: ${sourceSignal.aborted?'tiempo agotado':'no disponible'}`;errors.push(`${names[source]}: ${sourceSignal.aborted?'Tiempo agotado; puedes buscar más.':e.message}`);hasMore[source]=true;}}
  finally{if(token===run){completed++;fractions.set(source,1);update();}}
 }));
 clearInterval(clock);if(token!==run)return;busy=false;$('#stop').hidden=true;$('#searchButton').textContent='Buscar videos ↗';$('#progress').dataset.state=signal.aborted?'stopped':'done';if(!signal.aborted)progressBar.value=100;
 const grouped=groupRows(results),files=grouped.filter(r=>r.file.transport!=='page').length,pagesFound=grouped.length-files;
 $('#progressTitle').textContent=signal.aborted?'Búsqueda detenida':'✓ Búsqueda terminada · 100%';
 progressDetail.textContent=`${files} archivos extraídos · ${pagesFound} páginas encontradas · ${Math.floor((Date.now()-started)/1000)} s. ${signal.aborted?'Conservamos los resultados.':'Ya puedes revisar los resultados.'}`;
 for(const row of results)if(row.file.transport==='page'&&/cola|Extrayendo/.test(row.state||''))pageState(row,'Sin archivo extraído · disponible en su sitio');
 searchLog.querySelector('pre').textContent=[...$('#sourcesStatus').children].map(e=>e.textContent).join('\n')+'\n'+[...new Set(errors)].join('\n');searchLog.open=false;searchLog.hidden=false;$('#sourcesStatus').hidden=true;$('#notice').textContent='';render();
}
$('#importForm').onsubmit=async e=>{e.preventDefault();const url=$('#importUrl').value.trim(),button=$('#importForm button');button.disabled=true;$('#notice').textContent='Revisando el enlace y sus reproductores…';try{const item={id:'link:'+url,title:'',source:'link',pageUrl:url,language:'und'};const {files}=await api('/api/resolve?'+new URLSearchParams({item:JSON.stringify(item)}));const count=addFiles(item,files,false);tab='results';$('#notice').textContent=count?`${count} archivos añadidos desde el enlace.`:'No se encontraron archivos nuevos accesibles en ese enlace.';render();}catch(err){$('#notice').textContent=err.message;}finally{button.disabled=false;}};
$('#search').onsubmit=e=>{e.preventDefault();searchLog.hidden=true;$('#sourcesStatus').hidden=false;search();};$('#more').onclick=()=>{searchLog.hidden=true;$('#sourcesStatus').hidden=false;search(true);};$('#stop').onclick=()=>controller?.abort();$('#example').onclick=()=>{$('#query').value='backyardigans';search();};$('#showMore').onclick=()=>{displayLimit=Infinity;render();};$('#language').onchange=render;$('#unknown').onchange=render;
$('#resultsTab').onclick=()=>{tab='results';displayLimit=120;render();};$('#savedTab').onclick=()=>{tab='saved';displayLimit=120;render();};$('#domains').oninput=()=>{document.querySelector('input[value="custom"]').checked=!!$('#domains').value.trim();};
for(const id of ['exclude','sort']){try{const value=localStorage.getItem('videoteca.'+id);if(value!==null)$('#'+id).value=value;}catch{}$('#'+id).addEventListener(id==='exclude'?'input':'change',()=>{try{localStorage.setItem('videoteca.'+id,$('#'+id).value);}catch{}displayLimit=120;render();});}
$('#export').onclick=()=>{const rows=visible();if(!rows.length){$('#notice').textContent='Todavía no hay archivos para exportar.';return;}const blob=new Blob([JSON.stringify(rows,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=node('a');a.href=url;a.download='videoteca-enlaces.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};render();
const watchId=new URLSearchParams(location.search).get('watch');if(watchId&&/^[\w-]+$/.test(watchId)){try{const watch=JSON.parse(localStorage.getItem('videoteca.watch.'+watchId));if(watch?.until>Date.now())openPlayer(watch.row);else $('#notice').textContent='Este enlace del reproductor caducó. Vuelve a abrirlo desde los resultados.';}catch{}}
