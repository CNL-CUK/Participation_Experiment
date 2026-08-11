import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const projectPageBase = repositoryName?.endsWith('.github.io') ? '/' : `/${repositoryName}/`;
const base = process.env.GITHUB_ACTIONS && repositoryName ? projectPageBase : '/';

export default defineConfig({
  base,
  plugins: [react()],
});
