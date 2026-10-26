import test from 'node:test';
import assert from 'node:assert/strict';
import { publicIP,language,remote } from '../server.mjs';
import { containsAll } from '../public/matching.js';
test('Todas las palabras: orden libre, subcadenas, tildes y mayúsculas',()=>{
 assert.equal(containsAll('backyard ESPAÑOL','Los Backyardigans','episodio-espanol.mp4'),true);
 assert.equal(containsAll('español backyard','Los Backyardigans','episodio-espanol.mp4'),true);
 assert.equal(containsAll('backyardigans español','Backyardigans','english.mp4'),false);
 assert.equal(containsAll('   ','algo','video.mp4'),false);
});
test('Idioma desconocido no se presenta como español',()=>{
 assert.equal(language('spa'),'es');assert.equal(language('Spanish'),'es');assert.equal(language('en-US'),'en');assert.equal(language(undefined),'und');
});
test('Bloquea destinos privados y reservados',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.2','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','::ffff:127.0.0.1','224.0.0.1'])assert.equal(publicIP(ip),false,ip);
 assert.equal(publicIP('8.8.8.8'),true);
});
test('Rechaza protocolos, credenciales y puertos ajenos a HTTP',async()=>{
 for(const url of ['file:///etc/passwd','https://user:pass@example.com','http://example.com:8000'])await assert.rejects(remote(url));
});
