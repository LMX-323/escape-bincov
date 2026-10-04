import ts from 'typescript';
import { readFile, writeFile } from 'node:fs/promises';

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
for (const file of ['src/main.ts', 'src/game.ts', 'src/ui.ts', 'src/balance.ts']) {
  const text = await readFile(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) throw new Error(`Refusing to format invalid TypeScript: ${file}`);
  await writeFile(file, printer.printFile(source));
}
