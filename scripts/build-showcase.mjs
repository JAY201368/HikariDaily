import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';

// Build the same interactive exhibits for a static GitHub Pages project site.
const project = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(project, 'temp/showcase-build');
const output = path.join(project, 'out/showcase');
const base = process.env.SHOWCASE_BASE_PATH || '/HikariDaily/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw new Error('SHOWCASE_BASE_PATH must be an absolute directory path');
const repositoryUrl = 'https://github.com/JAY201368/HikariDaily';
process.env.NODE_ENV = 'production';

function prefixAssets(source) {
  return source.replace(/(["'`(])\/(objects|textures|films|planner|showcase)\//g, `$1${base}$2/`);
}

const config = {
  configFile: false,
  envDir: false,
  root,
  base,
  mode: 'production',
  publicDir: path.join(project, 'public'),
  resolve: { alias: { '@': path.join(project, 'src') } },
  esbuild: { jsx: 'automatic' },
  plugins: [{
    name: 'showcase-public-paths',
    transform(source, id) {
      if (!id.startsWith(path.join(project, 'src')) || !/\.[jt]sx?$/.test(id)) return;
      return { code: prefixAssets(source), map: null };
    },
  }],
};

await mkdir(path.join(root, 'showcase/demo'), { recursive: true });
const showcaseElement = `<Showcase repositoryUrl=${JSON.stringify(repositoryUrl)} />`;
await writeFile(path.join(root, 'render.tsx'), `
import { renderToString } from 'react-dom/server';
import { Showcase } from '@/components/showcase/showcase';
export function render() { return renderToString(${showcaseElement}); }
`);
await writeFile(path.join(root, 'main.tsx'), `
import { hydrateRoot } from 'react-dom/client';
import { Showcase } from '@/components/showcase/showcase';
import '@/app/globals.css';
hydrateRoot(document.getElementById('root')!, ${showcaseElement});
`);
await writeFile(path.join(root, 'demo.tsx'), `
import { createRoot } from 'react-dom/client';
import { ShowcaseDemo } from '@/components/showcase/demo';
import { BriefingSchema } from '@/domain/schemas';
import snapshot from '@/content/showcase/briefing.json';
import '@/app/globals.css';
const requested = new URLSearchParams(location.search).get('view');
const view = requested === 'handbook' || requested === 'planner' ? requested : 'journey';
createRoot(document.getElementById('root')!).render(<ShowcaseDemo briefing={BriefingSchema.parse(snapshot)} view={view} />);
`);

const server = await createServer({ ...config, server: { middlewareMode: true }, appType: 'custom' });
let markup;
try {
  const renderer = await server.ssrLoadModule('/render.tsx');
  markup = renderer.render();
} finally {
  await server.close();
}
function documentHtml(title, body, entry) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description" content="翻阅摄影天气日报，打开随身仪表、外拍手册与拍摄计划本。"></head><body class="static"><div id="root">${body}</div><script type="module" src="${entry}"></script></body></html>`;
}
await writeFile(path.join(root, 'index.html'), documentHtml('逐光日刊 · 功能与交互展示', markup, '/main.tsx'));
await writeFile(path.join(root, 'showcase/demo/index.html'), documentHtml('交互展示 · 逐光日刊', '', '/demo.tsx'));

await build({
  ...config,
  build: {
    outDir: output,
    emptyOutDir: true,
    rolldownOptions: { input: [path.join(root, 'index.html'), path.join(root, 'showcase/demo/index.html')] },
  },
});
// This stylesheet is loaded by the editor at runtime, outside Vite's CSS graph.
const plannerStyles = path.join(output, 'planner/planner.css');
await writeFile(plannerStyles, prefixAssets(await readFile(plannerStyles, 'utf8')));
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Static showcase ready at ${output}`);
