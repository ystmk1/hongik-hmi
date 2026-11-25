// Assemble the pages exactly as the lab server does (native_carla.py +
// navigation_adapter.py), so the source files here keep the lab repo's names
// and paths and can be copied back unchanged.
//
//   node scripts/build.mjs        -> writes dist/ (what Vercel serves)
//   import {routes} from './build.mjs'   (used by the dev server)
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MOCK_TAG = '<script src="/demo/mock-backend.js"></script>';
const read = name => readFile(join(ROOT, name), 'utf8').then(s => s.replace(/^﻿/, ''));
const withMock = html => html.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + MOCK_TAG);

// served URL -> lab file (navigation_adapter.static_asset + native_carla.handler)
export const SERVED = {
  '/language.js': 'language.js',
  '/participant-setup.js': 'participant_setup.js',
  '/feedback-voice.js': 'feedback_voice.js',
  '/nurec-nav-boot.js': 'navigation_boot.js',
  '/nurec-map-context.js': 'map_context.js',
  '/nurec-nav.css': 'navigation.css',
  '/recorded-cabin.js': 'recorded_cabin.js',
  '/driving-sound.js': 'driving_sound.js',
  '/driving-sound.css': 'driving_sound.css',
  '/exterior-sound.js': 'exterior_sound.js',
  '/underbody-sound.js': 'underbody_sound.js',
  '/scene-audio.js': 'scene_audio.js',
  '/city-study.js': 'city_study.js',
  '/city-study.css': 'city_study.css',
  '/midterm-panel.js': 'midterm_panel.js',
  '/midterm-panel.css': 'midterm_panel.css',
  '/midterm-audio.js': 'midterm_audio.js',
  '/pedestrian-ui.js': 'pedestrian_ui.js',
  '/experiment-ui.js': 'experiment_ui.js',
  '/survey-ui.js': 'survey_ui.js',
  '/cockpit.js': 'course_ui/cockpit.js',
  '/cockpit.css': 'course_ui/cockpit.css',
  '/research-events.css': 'course_ui/research-events.css',
  '/multimodal.css': 'course_ui/multimodal.css',
  '/hongik-assistant.css': 'course_ui/hongik-assistant.css',
};

// navigation_adapter.navigation_html(city_audio=False)
async function navigationHtml() {
  let html = await read('course_ui/index.html');
  html = html.replace('</head>', '<script src="/language.js"></script></head>');
  html = html.replace(/<script[^>]*src="\/(?:qwen-speech|navigation-voice|hongik-wake|hongik-assistant|experience|multimodal)\.js[^>]*><\/script>/g, '');
  html = html.replace('<script src="/cockpit.js', '<script src="/nurec-nav-boot.js"></script><script src="/nurec-map-context.js"></script><script src="/cockpit.js');
  html = html.replace('<script type="module">', '<script src="/nurec-nav.js"></script><script type="module">');
  html = html.replace('</head>', '<link rel="stylesheet" href="/nurec-nav.css"></head>');
  html = html.replace('</head>', '<script defer src="/recorded-cabin.js"></script><script defer src="/driving-sound.js"></script><link rel="stylesheet" href="/driving-sound.css"></head>');
  return html;
}

// native_carla.native_navigation_html(midterm), synced with the experiment-protocol branch (2026-11-22)
async function nativeNavigationHtml(midterm) {
  let html = await navigationHtml();
  html = html.replaceAll('Math.min(devicePixelRatio,2)', 'Math.min(devicePixelRatio,1)');
  html = html.replaceAll('function animate(now){requestAnimationFrame(animate);', 'function animate(now){requestAnimationFrame(animate);if(now-last<1000/24)return;');
  html = html.replaceAll("item.kind==='pedestrian'?personMesh():carMesh", "item.kind==='obstacle'?new THREE.Mesh(new THREE.BoxGeometry(item.width_m,.45,item.length_m),new THREE.MeshStandardMaterial({color:0xa98450,roughness:1})):item.kind==='pedestrian'?personMesh():carMesh");
  if (midterm) {
    html = html.replaceAll('src="/research-events.js', 'src="/midterm-panel.js');
    html = html.replace('</head>', '<script defer src="/exterior-sound.js"></script><script defer src="/underbody-sound.js"></script><script defer src="/scene-audio.js"></script><script defer src="/midterm-audio.js"></script><link rel="stylesheet" href="/midterm-panel.css"></head>');
    html = html.replace('</head>', '<script defer src="/feedback-voice.js"></script><script defer src="/experiment-ui.js"></script><script defer src="/survey-ui.js"></script></head>');
  } else {
    html = html.replace('</head>', '<script defer src="/exterior-sound.js"></script><script defer src="/underbody-sound.js"></script><script defer src="/scene-audio.js"></script><script defer src="/city-study.js"></script><link rel="stylesheet" href="/city-study.css"></head>');
  }
  return html;
}

// Generated files: served path -> () => text
export const GENERATED = {
  '/index.html': async () => withMock((await read('native_home.html')).replace('<main>', '<script src="/language.js"></script><script defer src="/participant-setup.js"></script><main><p><a href="/experiment">AI OFF / ON experiment</a></p>')),
  '/experiment.html': async () => withMock(await read('experiment.html')),
  '/navigation.html': async () => withMock(await nativeNavigationHtml(true)),
  '/navigation/classic.html': async () => withMock(await nativeNavigationHtml(false)),
  '/admin.html': async () => withMock(await read('research_admin.html')),
  '/drive.html': async () => withMock((await read('drive.html')).replaceAll('NuRec', 'CARLA RGB')),
  '/nurec-nav.js': async () => (await read('navigation.js')).replaceAll("location.assign('http://127.0.0.1:8775/')", "location.assign('/')"),
  '/research-events.js': async () => (await read('hongik_panel.js')).replaceAll('http://127.0.0.1:8775/', '/').replaceAll('|normal|complete)', '|normal|complete|yield|city_yield|city_carpool|city_rattle)'),
};

// Folders served as-is: URL prefix -> folder
export const FOLDERS = {'/vendor/': 'course_ui/vendor/', '/demo/': 'demo/'};

export async function build(out = join(ROOT, 'dist')) {
  await rm(out, {recursive: true, force: true});
  const put = async (path, data) => {
    const file = join(out, path);
    await mkdir(dirname(file), {recursive: true});
    await writeFile(file, data);
  };
  for (const [path, source] of Object.entries(SERVED)) await put(path, await read(source));
  for (const [path, make] of Object.entries(GENERATED)) await put(path, await make());
  for (const [prefix, folder] of Object.entries(FOLDERS)) await cp(join(ROOT, folder), join(out, prefix), {recursive: true});
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log('Built', await build());
}
