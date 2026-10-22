const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('Head detail pages render safely before their API requests resolve', async () => {
  global.window = { location: { protocol: 'http:', hostname: 'localhost', pathname: '/' } };
  const { createServer } = await import('vite');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { MemoryRouter, Route, Routes } = await import('react-router-dom');
  const vite = await createServer({
    root,
    configFile: path.join(root, 'vite.config.js'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });

  try {
    const cases = [
      {
        module: '/src/pages/head/MonitoringDetail.jsx',
        path: '/head/monitoring/12',
        route: '/head/monitoring/:id',
        text: /Loading mentor details/,
      },
      {
        module: '/src/pages/head/Announcements.jsx',
        path: '/head/announcements',
        route: '/head/announcements',
        text: /Loading announcements/,
      },
    ];
    for (const { module, path: routePath, route, text } of cases) {
      const { default: Component } = await vite.ssrLoadModule(module);
      const tree = React.createElement(
        MemoryRouter,
        { initialEntries: [routePath] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: route, element: React.createElement(Component) }),
        ),
      );
      const html = renderToStaticMarkup(tree);
      assert.match(html, text, `${routePath} should render its loading state`);
      assert.doesNotMatch(html, /Unexpected Application Error/);
    }
  } finally {
    await vite.close();
    delete global.window;
  }
});
