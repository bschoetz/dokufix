// The check that esbuild cannot do. Bundling, esbuild takes a name that a module
// neither declares nor imports for a global and says nothing; the page then
// fails when the line runs. ESLint reads src/ and fails on
//
//   no-undef                    a name that is neither declared nor imported
//                               and is no global of the browser or of the
//                               three libraries the page loads from the CDN
//   no-import-assign            an assignment to an imported name
//   dokufix/no-unused-imports   an import nothing uses
//
// The third is ESLint's no-unused-vars narrowed to imports, which the core rule
// has no option for: it would also report a function nobody calls and a local
// nobody reads. Those are left alone.
//
//   npx eslint src        (part of "npm run check")

import globals from 'globals';

const noUnusedImports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { unused: "'{{name}}' is imported but never used." },
  },
  create(context){
    function check(node){
      for (const variable of context.sourceCode.getDeclaredVariables(node)){
        if (!variable.references.length) context.report({ node: node.local, messageId: 'unused', data: { name: variable.name } });
      }
    }
    return { ImportSpecifier: check, ImportDefaultSpecifier: check, ImportNamespaceSpecifier: check };
  },
};

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        marked: 'readonly',
        markedFootnote: 'readonly',
        mermaid: 'readonly',
      },
    },
    plugins: { dokufix: { rules: { 'no-unused-imports': noUnusedImports } } },
    rules: {
      'no-undef': 'error',
      'no-import-assign': 'error',
      'dokufix/no-unused-imports': 'error',
    },
  },
];
