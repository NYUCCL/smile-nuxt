# Developing your experiments

When developing and debugging your experiment, it is useful to interact with a
web server running on your local computer (i.e., your laptop or desktop). This
is much faster than waiting for changes to upload to the cloud and then having
your browser download the files again.

In <SmileText/>, dev mode is handled by [Nuxt](https://nuxt.com) (which uses
[Vite](https://vitejs.dev) under the hood). Vite is heavily optimized for
developer experience (DX). To test your application locally, type:

```sh
pnpm dev
```

in the project folder. You should see something like this:

```sh
ℹ  SMILE 0.2.0-beta.3
ℹ  Experiment:    http://localhost:3000
ℹ  Dev:           http://localhost:3000/dev/
ℹ  Presentation:  http://localhost:3000/presentation/
```

If you open the link after `Experiment:` in your browser[^mac], it shows a
live demo of your experiment. The other two URLs expose Smile's developer
tools (covered below) and presentation mode. The page automatically
refreshes as you edit your code — that's all you need to get started.

[^mac]:
    On Mac, if you press the Command (⌘) key while clicking the link, it will
    open in a new tab.

## Smile developer tools

When you are viewing your website in developer mode, there are special UI
elements that help you debug and develop your experiments. Here's an example
video from a recent build (v0.1.0):

<video controls autoplay loop muted poster="https://todd.gureckislab.org/images/blog/smile-0.1.0-devmode.png" style="max-width:100%;width:700px;">
  <source src="https://todd.gureckislab.org/videos/blog/smile-0.1.0-devmode.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

The developer tools let you:

- Inspect the state of your running experiment, including configuration settings
  and your current data
- Jump between sections of your experiment (i.e., [Views](/coding/views))
- Pin certain Views/pages so that you can focus on them without restarting the
  entire task
- View errors and warning messages
- Autofill forms and experiment data to generate simulated data for testing your
  analysis scripts
- Simulate how your task will appear on different size monitors and devices like
  phones
- Toggle between light/dark mode
  ([if you choose to support it](/styling/darkmode))
- Debug the step-by-step operation of your experiment
- Perform "brain surgery" by forcing particular settings or events to happen to
  see how your experiment responds.

## Testing the build process

You can also test the build process locally:

```sh
pnpm build
```

If the build is successful, the bundled output goes into the `.output/`
folder (not tracked by git). Unlike the older static-SPA version of Smile
— which produced a single `dist/` of static files — Nuxt builds **both** a
client bundle and a small Node server entry by default. So `.output/`
contains `public/` (the static assets and client JS) plus `server/` (a
minimal Node app that serves them and handles API routes).

When you deploy to Vercel, Nuxt's Vercel preset is auto-detected and
produces output tailored to that platform — you don't need to do anything
special at build time. See [Cloud Hosting](/recruit/deploying) for the
deployment flow.

To preview the production build locally, type:

```sh
pnpm preview
```

This boots the built server at `http://localhost:3000`, serving exactly
what gets deployed. Useful for sanity-checking before you push.

## Hot Module Replacement

One of the most useful features of Vite in development mode is that it
automatically reloads the webpage any time changes are made to any project
files. This prevents you from having to go back and forth between your editor
and the browser and manually refreshing the browser window.

[Some tools](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
provide this automatic updating by forcing the entire browser webpage to reload
anytime a file changes.

However, the downside of reloading the site page each time there is a change is
that the "state" of the page is reset. For example, if you were testing your
experiment and were on trial 10, paused, and then changed the color of one of
the fonts, most live-reloaders will completely reload the page, taking you back
to the first trial of the experiment (i.e., the state is reset).

Instead, Vite can reload modules for parts of a page without reloading the
_entire_ page. This can be **very powerful** for developing experiments because
it can prevent a lot of mindless clicking just to get back to a particular state
and trigger an error, etc. Once you understand this difference, you'll wonder
how you ever programmed for the web without it. This feature is known as
[Hot Module Replacement](https://vitejs.dev/guide/features.html#hot-module-replacement).

## Bundling, Tree-Shaking, and Code-splitting

A second key feature of Vite is that it acts as a bundler. When you use complex
libraries in your project, there may be lots of dependencies both within and
between packages. As one example, the popular [lodash](https://lodash.com)
library organizes all the functions into individual modules, so importing the
lodash library in Node.js technically may load as many as 600 other files at
once. If this was running on a real webserver, the number of separate requests
might overload the server. As a result, modern websites "bundle" the required
code into a single, optimized file so that only one file is imported. Vite does
this behind the scenes for you both in development and build mode.

There are several other features of Vite, including a process called
[Tree-Shaking](https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking),
which removes functions from the bundle that are not used in the current app to
reduce the file size, and
[Code Splitting](https://developer.mozilla.org/en-US/docs/Glossary/Code_splitting),
which organizes files into "chunks" that reflect common dependencies across
different pages of a site.

## Updating Smile

Smile now ships as the `@nyuccl/smile-nuxt` npm package, so pulling in newer
versions is a standard package-manager operation (no git-patch dance). See
[Updating Smile](/updating) for the full workflow.
