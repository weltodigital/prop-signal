# Brand assets

Built from `Prop Signal.png` in the repository root, which is the source file.

The source is a stacked lockup on a solid white ground with no alpha channel.
These are derived from it: white made transparent so the logo sits on the paper
colour rather than on a white plate, then trimmed to the artwork.

- `prop-signal-logo.png` — the full lockup. Used where the brand is the point:
  the marketing page and the sign-in page.
- `prop-signal-mark.png` — the chevron on its own, for the application header
  where a stacked lockup would render the wordmark too small to read.

`src/app/icon.png` is the same mark, squared and padded. Next serves it as the
favicon by file convention, with no configuration.

These are imported rather than served from `public/`, so their dimensions come
from the file and cannot drift out of step with the markup.

The one image rule in this codebase is about *listing* photographs, which carry
no rights and are stripped by the credit wrapper before anything is stored. Our
own logo is not that.
