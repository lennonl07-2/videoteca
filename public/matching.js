export const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function containsAll(query,title,filename) {
  const words=normalize(query).trim().split(/\s+/).filter(Boolean);
  const text=normalize(`${title||''} ${filename||''}`);
  return words.length>0 && words.every(word=>text.includes(word));
}
export function containsExcluded(input,...values) {
  const words=normalize(input||'').split(/[\s,;]+/).filter(Boolean);
  const text=normalize(values.filter(Boolean).join(' '));
  return words.some(word=>text.includes(word));
}
export const positiveNumber=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):0;
export const durationOf=row=>positiveNumber(row.file?.duration)||positiveNumber(row.item?.duration);
export function compareResults(a,b,order='duration') {
  const duration=durationOf(b)-durationOf(a),size=positiveNumber(b.file?.size)-positiveNumber(a.file?.size);
  return order==='size'?size||duration:order==='duration'?duration||size:0;
}
export function durationLabel(value) {
  const seconds=Math.floor(positiveNumber(value));if(!seconds)return 'Duración no informada';
  const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
  return h?`${h} h ${m} min`:`${m}:${String(s).padStart(2,'0')} min`;
}
