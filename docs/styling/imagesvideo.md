---
description: "Where to put images, video and other files (public/ or assets/), how to refer to them in templates and code with getPublicUrl, how to preload stimuli, dark-mode images, and what to do with large files."
---

# Images and Video

Experiments often need images, videos, sounds or data files (JSON, CSV). This
page covers where to put them, how to refer to them, how to preload them so
participants don't wait for them to appear, and what to do with files too big
for a GitHub repository.

## Public versus assets folder

There are two places for files in a <SmileText/> project.

### `public/` (usually the right choice)

Files in `public/` at the top of your project are copied into the build as
they are, with the same names. The starter already has two there
(`universitylogo.png` and `helpus.png`). Refer to them with a path starting
with `/`:

```html
<img src="/universitylogo.png" alt="University logo" />
```

Use `public/` for stimuli and anything you pick in code (for example, a
random image per trial), because the file names stay the same and are easy to
build in code. It's also the folder the [preloading](#preloading) options read
from.

### `assets/`

Files in `assets/` are processed by the build: each one is copied with a hash
added to its name (for example `logo.png` becomes `logo-139efdf8.png`), and
references to it in your templates and CSS are updated to match. That way a
participant's browser never shows an old cached copy after you change the file.
Refer to them with `~/assets/`:

```html
<img src="~/assets/images/logo.png" alt="logo" />
```

This only works for paths written out in a template or CSS file, not for paths
put together in code. The starter keeps its CSS in `assets/css/`.

## Referring to files in code

When your code decides which file to show, use `api.getPublicUrl()` to get the
URL of a file in `public/`. It adds the right base path for wherever the
experiment is deployed. For example, with images of bees in
`public/bees/bees-01.svg`, `public/bees/bees-02.svg`, and so on:

```vue
<script setup>
const api = useAPI()

// Pick a random bee (1–9)
const n = api.randomInt(1, 9)
const beeUrl = api.getPublicUrl(`bees/bees-0${n}.svg`)
</script>

<template>
  <img :src="beeUrl" width="220" />
</template>
```

The path is relative to `public/`. A leading `/` is ignored.

Two related helpers:

- `api.getStaticUrl(path)` is the same as `getPublicUrl`, kept so code written
  for older versions of <SmileText/> keeps working.
- `api.getCoreStaticUrl(path)` gives the URL of a file that ships with
  <SmileText/> itself (served under `/_smile/`).

## Video

Put short video files in `public/` and use the HTML `<video>` element:

```vue
<script setup>
const api = useAPI()
</script>

<template>
  <video :src="api.getPublicUrl('intro.mp4')" controls playsinline width="640" />
</template>
```

Add `autoplay muted` to start the video without a click (browsers only allow
autoplay for muted video). For long videos, see
[Dealing with large files](#dealing-with-large-files).

To show a YouTube or Vimeo video, use the embed code from the site (an
`<iframe>`), for example:

```html
<iframe
  width="640"
  height="360"
  src="https://www.youtube.com/embed/VIDEO_ID"
  title="Instructions video"
  allow="autoplay; encrypted-media; picture-in-picture"
  allowfullscreen
></iframe>
```

## Dark mode and images

If your experiment supports [dark mode](/styling/darkmode), some images (logos,
icons, line drawings) can be too dark or too light in one of the themes.

The `dark-aware-img` class inverts an image's colors when dark mode is on, so a
dark drawing on a light background becomes a light drawing on a dark
background:

```html
<img src="/universitylogo.png" alt="University logo" class="dark-aware-img" />
```

It works best for images with simple colors, such as:

- **Icons and logos** with dark colors on a light background
- **Simple graphics and diagrams** that need contrast in both modes

Photographs and images with many colors usually look wrong inverted. For those,
make a light and a dark version and show the one that matches the current
color mode.

## Preloading

Preloading asks the browser to download images or videos before they're needed,
so the participant isn't left waiting for them. This matters when stimuli have
to appear quickly.

List the files to preload, relative to `public/`, in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt', '@nyuccl/smile-nuxt'],
  smile: {
    preloadImages: ['bees/bees-01.svg', 'bees/bees-02.svg'],
    preloadVideos: ['intro.mp4'],
  },
})
```

Then call `api.preloadAllImages()` or `api.preloadAllVideos()` at a good time,
for example once the participant has consented, so the downloads happen while
they read the instructions:

```js
function finish() {
  api.preloadAllImages() // start loading the listed images
  api.goNextView()
}
```

## Dealing with large files

GitHub limits the size of single files and of a whole repository (including
its history), so keep very large files, especially video, out of your project.
Host them somewhere else, such as YouTube, Vimeo or a cloud storage bucket, and
embed them with the right HTML (see [Video](#video)). GitHub's
[Large File Storage](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage)
is another option, but check that your hosting service supports it when it
builds your experiment.
