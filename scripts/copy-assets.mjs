import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(process.cwd());

const copies = [
  {
    from: resolve(root, 'nodes/Mnexium/mnexium.png'),
    to: resolve(root, 'dist/nodes/Mnexium/mnexium.png'),
  },
];

for (const file of copies) {
  mkdirSync(dirname(file.to), { recursive: true });
  copyFileSync(file.from, file.to);
}

console.log('Copied n8n node assets to dist');
