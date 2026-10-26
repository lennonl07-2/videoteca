export function family(file){return file.family||file.name?.replace(/\.ia(?=\.)/i,'')||file.url;}
export function choosePlayback(file,files=[]){
 const candidates=files.filter(f=>family(f)===family(file));if(!candidates.some(f=>f.url===file.url))candidates.push(file);
 return candidates.sort(compareQuality)[0];
}
export function compareQuality(a,b){return (Number(b.height)||0)-(Number(a.height)||0)||(Number(b.fps)||0)-(Number(a.fps)||0)||(Number(b.size)||0)-(Number(a.size)||0);}
export function groupRows(rows){
 const groups=new Map();
 for(const row of rows){
  const id=`${row.item?.pageUrl||row.item?.id||row.source}:${row.file.transport==='page'?'page':family(row.file)}:${row.language||'und'}`;
  if(!groups.has(id))groups.set(id,{...row,files:[]});
  const group=groups.get(id);
  for(const f of [row.file,...(row.files||[])])if(family(f)===family(row.file)&&(f.language||'und')===(row.file.language||'und')&&!group.files.some(x=>x.url===f.url&&x.node===f.node&&x.formatId===f.formatId))group.files.push(f);
 }
 return [...groups.values()].map(r=>({...r,file:[...r.files].sort(compareQuality)[0]}));
}
export function rangeOf(header,size){
 if(!header)return {start:0,end:size-1,partial:false};
 const m=/^bytes=(\d*)-(\d*)$/.exec(header);if(!m||(!m[1]&&!m[2]))return null;
 const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 const end=m[1]?(m[2]?Math.min(size-1,Number(m[2])):size-1):size-1;
 return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<size&&end>=start?{start,end,partial:true}:null;
}
