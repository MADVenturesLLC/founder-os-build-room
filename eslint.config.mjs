// Minimal ESLint flat config — WF-17 lint authorization.
//
// Scope: TypeScript sources this repository already builds and tests
// (tsconfig.json's `include`), using typescript-eslint's `recommended`
// preset only. No stylistic/formatting rules, no new toolchain beyond
// eslint + typescript-eslint — this repository has no prior lint
// configuration to extend, so the smallest workable baseline is adopted
// rather than a larger preset.
//
// Does not touch build, test, or type-check configuration.

import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '**/dist/**',
      '**/*.js',
      // .worktrees/* are separate git-worktree checkouts (other branches
      // checked out alongside this one) — not this branch's source tree.
      '.worktrees/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['packages/*/src/**/*.ts', 'test/**/*.ts'],
    rules: {
      // The codebase deliberately uses index-signature environment maps
      // (`Env`, `NodeJS.ProcessEnv`) and untyped JSON parsing at trust
      // boundaries (plan files, evidence exports) — `no-explicit-any` and
      // `no-unsafe-*` would fire across long-established, reviewed patterns
      // rather than catching a defect. Left at the recommended default
      // (warn) rather than disabled outright.
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
  {
    // Consumed MadBridge source (DEC-20260827-01 §4 frozen consumption):
    // each `consumed` file is its 7d37a61 source with only import
    // specifiers changed, and test/madbridge-consumed.test.ts checks that
    // byte for byte. The source carries four unused imports; removing them
    // would make the port differ from what is pinned, so the rule is off
    // for this package alone.
    files: ['packages/madbridge-consumed/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
