---
description: "Presentation mode (/presentation/): a landing page and free navigation for showing your experiment to others, how to customize it by overriding PresentationModeView, and how to share it from a deployed site."
---

# Presentation Mode

Presentation mode is a way of deploying <SmileText /> experiments in a way that
they can be used to share examples of an experiment with other people. This can
be helpful in cases where you want to share a link to your experiment with
readers of a paper, collaborators, or others. You can also use this mode to
develop richer, interactive views of the data in your experiment as well as
complete websites devoted to a paper or project. A good example of an experiment
being shared in presentation mode is
[here](https://exps.gureckislab.org/e/telephone-gleaming-kill/#/).

There are three things that presentation mode enables:

1. A nicely designed "landing page" that you can customize to show links to
   preprints/published articles, figures, and also links that let you jump
   between various parts of your experiment
2. It disables the control on which page/route of the experiment is shown in
   which order allowing you and your audience to jump around and explore
   different parts of the task (e.g., jump to read the instructions without
   first completing the consent form)
3. A automatically generated QR code that you can use to link to the
   presentation mode site from posters, papers, or other materials.

## How to use Presentation Mode

Presentation mode is a route, not a separate command. Start the dev server
normally and visit the `/presentation/` route:

```
pnpm dev
```

Then open `http://localhost:3000/presentation/` in your browser. It looks
something like this:

![Presentation Mode](/images/presentmode.png)

Notice that you can use the drop-down "jump" menu to jump around between the
parts of your experiment in this mode.

## QR Code download

The small QR code button in the top nav bar opens a dropdown menu that shows a
QR code for the current webpage. This can be downloaded as a SVG and inserted
into posters and talks. It points to the deployed location of the presentation
mode website.

## How to customize Presentation Mode

The landing page is the built-in `PresentationModeView` component. To change
it, [override it](/coding/overrides): create `components/PresentationModeView.vue`
in your project, and your version replaces the built-in one. A good start is to
copy the built-in file from
`node_modules/@nyuccl/smile-nuxt/dist/runtime/components/builtins/PresentationModeView.vue`
and edit it. You can add links to papers, links that jump to parts of your
experiment, figures, or anything else that helps explain the study.

## Sharing a deployed experiment in Presentation Mode

`/presentation/` is part of every build, including the one participants use.
On a deployed site it's turned off by default (it returns a 404) until you
choose who can open it, with `SMILE_PRESENTATION_ACCESS` in your hosting
provider's environment variables:

| Setting | Who can open `/presentation/` |
| --- | --- |
| unset (`disabled`) | nobody (404) |
| `password` | anyone with the password in `SMILE_PRESENTATION_PASSWORD` (setting the password alone is enough) |
| `open` | anyone with the link, for example readers of a paper |

The presentation password is separate from the dev tools' password, so you can
share one without the other. See
[Dev & presentation route access](/recruit/deploying#dev-password) for the
details, and hash the password with `pnpm smile:hash-password` rather than
storing it as plain text.

Then share `https://<your-deploy-url>/presentation/` (or the QR code above).
