import test from 'node:test';
import assert from 'node:assert/strict';
import {groupRows,choosePlayback} from '../public/playback.js';
import {declaredLanguage,languageRank,matchesLanguage,language} from '../public/languages.js';
import {transcodeArgs} from '../lib/transcode.mjs';
test('Agrupa calidades, conserva idiomas y episodios distintos',()=>{
 const low={url:'https://example/a',family:'episode1',height:360,language:'es'},high={url:'https://example/b',family:'episode1',height:1080,language:'es'},other={url:'https://example/c',family:'episode2',height:720,language:'es'};
 const rows=[low,high,other,{...high,language:'en',url:'https://example/en'}].map(file=>({item:{id:'collection'},file,language:file.language}));
 const grouped=groupRows(rows);assert.equal(grouped.length,3);assert.equal(grouped[0].file.height,1080);assert.equal(grouped[0].files.length,2);assert.equal(choosePlayback(low,[low,high]),high);
});
test('Prioriza español, latino y castellano; luego desconocidos y otros idiomas',()=>{
 assert.equal(language('es-MX'),'es-419');assert.equal(language('es-ES'),'es-ES');assert.equal(declaredLanguage('und','Audio Latino'),'es-419');assert.equal(declaredLanguage('en','Audio Latino'),'en');
 assert.ok(languageRank('es-419')<languageRank('und'));assert.ok(languageRank('und')<languageRank('en'));assert.equal(matchesLanguage('es','es-ES'),true);assert.equal(matchesLanguage('es-419','es'),false);
});
test('Conversión emite MP4 fragmentado H264/AAC y permite inicio temporal',()=>{
 const args=transcodeArgs('http://localhost:4317/api/media?url=x',45);assert.equal(args[args.indexOf('-ss')+1],'45');assert.ok(args.includes('libx264'));assert.ok(args.includes('aac'));assert.ok(args.includes('frag_keyframe+empty_moov+default_base_moof'));assert.equal(args.at(-1),'pipe:1');
});
