import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

async function files(directory: string): Promise<string[]> {
  return (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map((entry) =>
        entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`],
      ),
    )
  ).flat();
}
test('client, contracts and server imports respect their boundaries', async () => {
  for (const path of (await files('src')).filter((p) => /\.tsx?$/.test(p))) {
    const source = ts.createSourceFile(
      path,
      await readFile(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function check(node: ts.Node) {
      let name: string | undefined;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        name = node.moduleSpecifier.text;
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        ts.isStringLiteral(node.arguments[0])
      )
        name = node.arguments[0].text;
      if (name) {
        const target = (
          name.startsWith('@/')
            ? resolve('src', name.slice(2))
            : name.startsWith('.')
              ? resolve(dirname(path), name)
              : name
        ).replaceAll('\\', '/');
        if (path.startsWith('src/client/'))
          assert(
            !target.includes('/src/server/') && !/^(node:|pg$|next\/headers$)/.test(name),
            `${path} imports server code ${name}`,
          );
        if (path.startsWith('src/server/') || path.startsWith('src/app/api/'))
          assert(
            !target.includes('/src/client/') &&
              !/^(react($|\/)|lucide-react$|next\/(link|image)$)/.test(name),
            `${path} imports UI code ${name}`,
          );
        if (path.startsWith('src/contracts/'))
          assert(target.includes('/src/contracts/'), `${path} must contain only shared contracts`);
      }
      ts.forEachChild(node, check);
    }
    check(source);
  }
});
