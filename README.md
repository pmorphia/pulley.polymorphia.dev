# pulley.polymorphia.dev

The website of [Pulley](https://github.com/fwlang/pulley), the Flywheel package manager. It lists the Flywheel packages and the users of the [Distrobase](https://github.com/Wednesware/Distrobase) registry at `dstbs.wednesware.org`, which Pulley and [Hydrogen](https://github.com/Wednesware/Hydrogen) use.

It is a static site with no build step, served by GitHub Pages.

- **Packages:** every Flywheel package with its latest version and release count. A distribution is a Flywheel package when its latest release has a `pulley.toml`; the site reads each release archive to tell (showing "checking" meanwhile) and leaves out everything else, such as Hydrogen distributions with a `.sourcepkg`. The description comes from the `pulley.toml`. A package page opened directly for another kind of distribution says it isn't a Flywheel package.
- **Package pages:** the README (Markdown, with Flywheel highlighting and "Try it" links to the [playground](https://flywheel.polymorphia.dev)), the install command, releases, artifacts with SHA-256 checksums, dependencies and files.
- **Users:** registered users, with their join dates and packages.
- **Install:** how to install Pulley.
- **Search:** filters packages and users in the browser, since Distrobase has no search endpoint. Typing an address such as `author.name` opens it directly.

## Registry API

Everything is read live from the browser:

| Request | Used for |
|---|---|
| `GET /v1/users` | users |
| `GET /v1/distributions` | the package list (added in Distrobase's `public-listing` branch) |
| `GET /v1/{author}/{name}` | a package's releases |
| `GET /v1/{author}/{name}/{version}` | a release's artifacts |
| `GET /v1/{author}/{name}/{version}/{artifact}` | the archive, read in the browser for its metadata and README |

This needs the registry to send `Access-Control-Allow-Origin` on GET responses. Results are cached in `localStorage`, so pages open instantly and still render when the registry can't be reached. Without `/v1/distributions`, the site lists users only and offers direct address lookup.

## Hand-off from polymorphia.dev

The `$ pulley` button on polymorphia.dev hoists itself into this site's search bar and hands over to this page. The first stage runs on polymorphia.dev, with this page loaded in an iframe (`#embed=pm`), so the sound can play all the way through. Then polymorphia.dev navigates here (`#from=pm-settled`). `#from=pm` is the fallback without sound. The way back (`#from=pl`) runs in reverse. See the comments in `index.html` and `js/app.js`.

## Files

| | |
|---|---|
| `index.html` | markup and styles |
| `js/app.js` | data, views, page transitions, sound and the hand-off |
| `js/pkg.js` | gunzip, tar and `pulley.toml` reading for release archives |
| `js/md.js`, `js/highlight.js`, `grammar/` | Markdown and Flywheel highlighting, shared with flywheel.polymorphia.dev |

Preview locally with `python3 -m http.server -d .`.
