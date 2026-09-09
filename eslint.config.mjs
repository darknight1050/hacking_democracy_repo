import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
export default defineConfig([
  ...next,
  ...ts,
  {
    files: ['src/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server/**', '**/server/**'],
              message: 'Client code must use API contracts, never server modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/server/**/*.ts', 'src/app/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/client/**',
                '**/client/**',
                'react',
                'lucide-react',
                'next/link',
                'next/image',
              ],
              message: 'Keep UI code in src/client.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores(['.next/**', '.next-build/**', '.next-test/**', '.local/**', 'next-env.d.ts']),
]);
