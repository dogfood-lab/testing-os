# astro-frontmatter

An Atlas fixture for Astro files whose frontmatter imports code and data,
the shape registry-stats' site has: `dashboard.astro` imports a component
and loads `data/stats.json` with `import()`, and the component's
frontmatter imports a formatter from `lib/`. The frontmatter is read as
TypeScript for its imports, so the site imports `lib` and reads the data.
