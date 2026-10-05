import fs from 'fs';
import path from 'path';

const root = 'd:\\Z360 Task';
const hasPages = fs.existsSync(path.join(root, 'pages'));
const hasSrcPages = fs.existsSync(path.join(root, 'src', 'pages'));
console.log('hasPages:', hasPages, 'hasSrcPages:', hasSrcPages);
if (hasPages) console.log('pages content:', fs.readdirSync(path.join(root, 'pages')));
