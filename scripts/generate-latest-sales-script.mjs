import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
let markdown = readFileSync(resolve(root, 'latest-script.md'), 'utf8').replace(/\r\n?/g, '\n').trim() + '\n';
markdown = markdown.replace(/^## ([1-9]\d*)｜/gm, '# $1｜');

const ids = [...markdown.matchAll(/^# (\d+)｜/gm)].map((match) => Number(match[1]));
const expected = Array.from({ length: 78 }, (_, index) => index + 1);
if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error(`Expected phases 1-78, received: ${ids.join(', ')}`);
if (!markdown.includes('## 6A｜') || !markdown.includes('## 6B｜')) throw new Error('The 6A/6B bridge is missing');

const banner = '// Generated from the WorkOS 2026-09-24 rapport-first master script.\n// Do not edit this generated file directly.\n';
writeFileSync(resolve(root, 'lib/sales-script/sugiyama-latest.ts'), `${banner}export const latestSugiyamaMarkdown = ${JSON.stringify(markdown)};\n`, 'utf8');
