import * as fs from 'fs';
import * as path from 'path';

export function resolveTemplatePath(...segments: string[]): string {
  const srcPath = path.join(process.cwd(), 'src', ...segments);
  const distPath = path.join(process.cwd(), 'dist', 'src', ...segments);

  if (fs.existsSync(srcPath)) return srcPath;
  if (fs.existsSync(distPath)) return distPath;

  throw new Error(`Template not found.\nChecked:\n  ${srcPath}\n  ${distPath}`);
}
