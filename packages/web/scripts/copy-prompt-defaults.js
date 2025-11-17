import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = path.resolve(__dirname, '../../ui/src/assets/prompt-enhancer-config.json');
const dest = path.resolve(__dirname, '../prompt-enhancer-config.json');
const templateSource = path.resolve(__dirname, '../../ui/shared/prompt-templates.js');
const templateDest = path.resolve(__dirname, '../server/prompt-templates.js');

if (!fs.existsSync(source)) {
  console.error(`[copy-prompt-defaults] Source file missing: ${source}`);
  process.exit(1);
}

fs.copyFileSync(source, dest);
console.log(`[copy-prompt-defaults] Copied prompt defaults to ${dest}`);

if (!fs.existsSync(templateSource)) {
  console.error(`[copy-prompt-defaults] Template source missing: ${templateSource}`);
  process.exit(1);
}
fs.copyFileSync(templateSource, templateDest);
console.log(`[copy-prompt-defaults] Copied prompt templates to ${templateDest}`);
