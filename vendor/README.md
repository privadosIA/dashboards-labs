# Vendored packages

`core-dynamic-forms-2.19.1.tgz` is `@core/dynamic-forms` 2.19.1, the author's library that draws forms and tables from
JSON. The root `package.json` depends on it as `file:vendor/core-dynamic-forms-2.19.1.tgz`, so `npm ci` works without a
private registry and without the server's repository.

- **Origin:** the `.tgz` published with the library; copied once from `web/vendor/` of the Veritmo repository
  (the same file that repository vendors). From then on it belongs to this repository.
- **Version:** 2.19.1.
- **Licence:** this release was published under MIT, Copyright (c) 2026 Jesús Suero; the text is inside the package (`package/LICENSE`)
  and applies to this file. The library's own repository (forms-lib) is Apache-2.0 from its relicense onwards; the author holds the copyright
  of both, so the two licenses coexist without conflict. Whoever copies the package or a substantial part of it must keep the notice
  that travels with it.
- Its peer dependencies (Angular, `@ngx-formly/*`, `rxjs`) are installed from npm as usual.
- **To update it:** put the new `.tgz` here, delete the old one, change the path in the root `package.json` and run
  `npm install`.
