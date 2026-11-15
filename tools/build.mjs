// src/index.html + vendor/three.min.js + src/game.js -> dist/index.html (single self-contained file)
// usage: node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => readFileSync(join(root, p), 'utf8');
let html = rd('src/index.html');
const inline = (tag, file) => {
  const code = rd(file);
  if (code.includes('</script')) throw new Error(file + ' contains </script');
  if (!html.includes(tag)) throw new Error('missing tag: ' + tag);
  html = html.replace(tag, () => '<script>' + code + '</script>');
};
inline('<script src="../vendor/three.min.js"></script>', 'vendor/three.min.js');
inline('<script src="../vendor/peerjs.min.js"></script>', 'vendor/peerjs.min.js');
inline('<script src="game.js"></script>', 'src/game.js');
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
console.log('built dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
