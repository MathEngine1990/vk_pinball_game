import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFile(path.join(root, file), 'utf8');
const [template, css, physics, sdk, license, platform, session, game] = await Promise.all([
  read('public/index.html'),
  read('public/style.css'),
  read('physics.js'),
  read('node_modules/@vkontakte/vk-bridge/dist/browser.min.js'),
  read('node_modules/@vkontakte/vk-bridge/LICENSE'),
  read('public/platform.js'),
  read('public/local-session.js'),
  read('public/game.js')
]);
const scripts = [
  '/* ' + license + ' */\n' + sdk.replace(/^\/\/# sourceMappingURL=.*$/gm, ''),
  platform,
  (await read('public/music.js')).replace(/^export /gm,''),
  (await read('public/sound.js')).replace(/^export /gm,''),
  physics.replace(/^export /gm, ''),
  (await read('catalog.js')).replace(/^export /gm,''),
  (await read('public/progress-store.js')).replace(/^export /gm,''),
  session,
  await read('public/peer-session.js'),
  (await read('public/banner-ads.js')).replace(/^export /gm,''),
  `const networkMode=false;
const send=m=>peerSession.active()?peerSession.send(m):localSession.send(m);
const start=type=>localSession.start(type);
const connect=()=>localSession.connect();
const pauseSession=paused=>peerSession.active()?peerSession.pause(paused):localSession.pauseSession(paused);
const endLocal=finished=>localSession.endLocal(finished);`,
  game
];
const version = createHash('sha256').update([template, css, ...scripts].join('\n')).digest('hex').slice(0, 12);
const inline = scripts.map(script => '<script>\n' + script.replace(/<\/script/gi, '<\\/script') + '\n</script>').join('\n');
const html = template
  .replace('<link rel="stylesheet" href="/style.css">', () => '<style>\n' + css + '\n</style>')
  .replace('<!-- GAME_SCRIPTS -->', () => inline)
  .replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="rikoshet-release" content="' + version + '">');
if (html.includes('<!-- GAME_SCRIPTS -->') || !html.includes('VKWebAppInit')) {
  throw new Error('Incomplete standalone build');
}

const output = path.join(root, 'Релиз для GitHub Pages');
await fs.mkdir(output, {recursive: true});
for (const name of ['index.html', 'web.html', 'mobile.html']) {
  // Root entry points and the export folder always come from the same sources.
  await fs.writeFile(path.join(root, name), html);
  await fs.writeFile(path.join(output, name), html);
  for (const folder of ['Для GitHub','Готово к загрузке на GitHub']) {
    await fs.mkdir(path.join(root,folder),{recursive:true});
    await fs.writeFile(path.join(root,folder,name),html);
  }
}
await fs.writeFile(path.join(output, '.nojekyll'), '');
// Keep the earlier source handoff usable, while root files remain authoritative.
const sourceFiles=[
  'scripts/check-balance.mjs','public/music.js','public/sound.js','scripts/check-music.mjs','scripts/prepare-audio.py','music.test.js',
  'public/banner-ads.js','banner-ads.test.js',
  'package.json','package-lock.json','README.md','.gitignore','server.js','physics.js','arena.test.js',
  'public/index.html','public/game.js','public/style.css','public/platform.js',
  'public/local-session.js','public/network-session.js','scripts/build.mjs','scripts/check-browser.mjs'
  ,'catalog.js','public/session-router.js','public/runtime-config.js'
  ,'public/progress-store.js','progress-store.test.js'
  ,'public/peer-session.js','scripts/check-peer.mjs'
];
for (const source of sourceFiles) {
  const destination=path.join(root,'Для GitHub',source);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.copyFile(path.join(root,source),destination);
}
await fs.writeFile(path.join(root,'Для GitHub','.nojekyll'),'');
console.log('Релиз ' + version + ' → ' + output);

const audioSource=await fs.stat(path.join(root,'public/audio/runtime')).then(()=>path.join(root,'public/audio/runtime')).catch(()=>path.join(root,'audio/runtime'));
for(const folder of [root,output,path.join(root,'Для GitHub'),path.join(root,'Готово к загрузке на GitHub')]){await fs.mkdir(path.join(folder,'audio'),{recursive:true});const destination=path.join(folder,'audio/runtime');if(audioSource!==destination)await fs.cp(audioSource,destination,{recursive:true});}

const soundSource=await fs.stat(path.join(root,'public/audio/sfx')).then(()=>path.join(root,'public/audio/sfx')).catch(()=>path.join(root,'audio/sfx'));
for(const folder of [root,output,path.join(root,'Для GitHub'),path.join(root,'Готово к загрузке на GitHub')]){const destination=path.join(folder,'audio/sfx');if(soundSource!==destination)await fs.cp(soundSource,destination,{recursive:true});}
