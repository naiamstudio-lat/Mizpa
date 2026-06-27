#!/usr/bin/env node
/**
 * Mizpa Full Project Generator
 * Creates a complete, buildable Vite+React+Tailwind project
 * Usage: generate_project.js <page_data.json> <output_dir>
 */
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outDir = process.argv[3] || '/opt/mizpa/output/site';

// Create directories
const dirs = [
  'src/components',
  'src/styles',
  'public',
];
dirs.forEach(d => fs.mkdirSync(path.join(outDir, d), { recursive: true }));

// ── package.json ────────────────────────────────────────────────
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({
  name: `mizpa-${Date.now()}`,
  private: true,
  version: '0.0.1',
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
  },
  dependencies: {
    react: '^19.0.0',
    'react-dom': '^19.0.0',
  },
  devDependencies: {
    '@types/react': '^19.0.0',
    '@types/react-dom': '^19.0.0',
    '@vitejs/plugin-react': '^4.3.0',
    autoprefixer: '^10.4.0',
    postcss: '^8.4.0',
    tailwindcss: '^3.4.0',
    typescript: '^5.6.0',
    vite: '^6.0.0',
  },
}, null, 2));

// ── vite.config.ts ──────────────────────────────────────────────
fs.writeFileSync(path.join(outDir, 'vite.config.ts'), `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`);

// ── tailwind.config.js ─────────────────────────────────────────
fs.writeFileSync(path.join(outDir, 'tailwind.config.js'), `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`);

// ── postcss.config.js ──────────────────────────────────────────
fs.writeFileSync(path.join(outDir, 'postcss.config.js'), `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`);

// ── tsconfig.json ──────────────────────────────────────────────
fs.writeFileSync(path.join(outDir, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2020',
    useDefineForClassFields: true,
    lib: ['ES2020', 'DOM', 'DOM.Iterable'],
    module: 'ESNext',
    skipLibCheck: true,
    moduleResolution: 'bundler',
    allowImportingTsExtensions: true,
    isolatedModules: true,
    moduleDetection: 'force',
    noEmit: true,
    jsx: 'react-jsx',
    strict: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    noFallthroughCasesInSwitch: true,
  },
  include: ['src'],
}, null, 2));

// ── index.html ──────────────────────────────────────────────────
const title = data.title || 'Generated Site';
const description = data.description || '';
fs.writeFileSync(path.join(outDir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${description}" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);

// ── src/main.tsx ────────────────────────────────────────────────
fs.writeFileSync(path.join(outDir, 'src/main.tsx'), `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`);

// ── src/styles/index.css ───────────────────────────────────────
fs.writeFileSync(path.join(outDir, 'src/styles/index.css'), `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`);

// ── src/vite-env.d.ts ──────────────────────────────────────────
fs.writeFileSync(path.join(outDir, 'src/vite-env.d.ts'), `/// <reference types="vite/client" />
`);

// ── Generate components from page data ──────────────────────────
const components = [];

// Header component
if (title) {
  const headerContent = `import React from 'react';

export default function Header() {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <h1 className="text-2xl font-bold text-gray-900">${title}</h1>
          <nav className="flex space-x-4">
            <a href="#" className="text-gray-600 hover:text-gray-900">Home</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">About</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">Contact</a>
          </nav>
        </div>
      </div>
    </header>
  );
}
`;
  fs.writeFileSync(path.join(outDir, 'src/components/Header.tsx'), headerContent);
  components.push('Header');
}

// Hero section
const heroContent = `import React from 'react';

export default function Hero() {
  return (
    <section className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-4xl font-extrabold mb-4">${title}</h2>
        ${description ? `<p className="text-xl text-blue-100 mb-8">${description}</p>` : ''}
        <a href="#" className="inline-block bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition">
          Get Started
        </a>
      </div>
    </section>
  );
}
`;
fs.writeFileSync(path.join(outDir, 'src/components/Hero.tsx'), heroContent);
components.push('Hero');

// Features section (from extracted links)
const links = data.links || [];
const features = links.slice(0, 6).map((link, i) => {
  const name = link.split('/').pop()?.replace(/[-_]/g, ' ') || `Feature ${i + 1}`;
  return `        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">${name}</h3>
          <p className="text-gray-600">Explore this feature from the original site.</p>
        </div>`;
}).join('\n');

if (features) {
  const featuresContent = `import React from 'react';

export default function Features() {
  return (
    <section className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
${features}
        </div>
      </div>
    </section>
  );
}
`;
  fs.writeFileSync(path.join(outDir, 'src/components/Features.tsx'), featuresContent);
  components.push('Features');
}

// Footer
const footerContent = `import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p>&copy; ${new Date().getFullYear()} Generated by Mizpa. All rights reserved.</p>
      </div>
    </footer>
  );
}
`;
fs.writeFileSync(path.join(outDir, 'src/components/Footer.tsx'), footerContent);
components.push('Footer');

// ── src/App.tsx ─────────────────────────────────────────────────
const imports = components.map(c => `import ${c} from './components/${c}';`).join('\n');
const jsx = components.map(c => `      <${c} />`).join('\n');

fs.writeFileSync(path.join(outDir, 'src/App.tsx'), `import React from 'react';
${imports}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
${jsx}
    </div>
  );
}
`);

// ── Summary ─────────────────────────────────────────────────────
const summary = {
  status: 'generated',
  outputDir: outDir,
  projectName: `mizpa-${Date.now()}`,
  title,
  description,
  components,
  files: [
    'package.json',
    'vite.config.ts',
    'tailwind.config.js',
    'postcss.config.js',
    'tsconfig.json',
    'index.html',
    'src/main.tsx',
    'src/App.tsx',
    'src/styles/index.css',
    ...components.map(c => `src/components/${c}.tsx`),
  ],
};

console.log(JSON.stringify(summary, null, 2));
