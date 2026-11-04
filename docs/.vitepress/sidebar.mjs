// The docs sidebar. Its own file so scripts/build-agent-docs.mjs can read the
// page order without loading VitePress and its Vite plugins.
export const sidebar = [
  {
    text: 'Overview',
    items: [
      { text: 'Introduction', link: '/introduction' },
      { text: 'Quick Start', link: '/quickstart' },
      { text: 'Key Concepts', link: '/concepts' },
      { text: 'Updating Smile', link: '/updating' },
      { text: 'Getting help', link: '/help' },
      { text: 'Leveraging agents', link: '/agents' },
    ],
  },
  {
    text: 'Coding and Testing',
    items: [
      { text: 'Overview', link: '/coding/overview' },
      { text: 'Project Organization', link: '/coding/organization' },
      { text: 'Developing', link: '/coding/developing' },
      { text: 'Configuring', link: '/coding/configuration' },
      { text: 'Components', link: '/coding/components' },
      { text: 'Views', link: '/coding/views' },
      { text: 'Built-in Views', link: '/coding/builtin-views' },
      { text: 'Overriding Builtins', link: '/coding/overrides' },
      { text: 'Timeline and Design File', link: '/coding/timeline' },
      { text: 'Stepping Views', link: '/coding/steps' },
      { text: 'Autofill', link: '/coding/autofill' },
      { text: 'Randomization', link: '/coding/randomization' },
      { text: 'Persistence', link: '/coding/persistence' },
      { text: 'Data storage', link: '/coding/datastorage' },
      { text: 'Server-side logic', link: '/coding/serverside' },
      { text: 'Testing', link: '/coding/testing' },

      //{ text: '🔌 Server-side Computations', link: '/server' },
    ],
  },
  {
    text: 'Style and Design',
    items: [
      { text: 'Overview', link: '/styling/styleoverview' },
      { text: 'Tailwind CSS', link: '/styling/tailwind' },
      { text: 'Dark Mode', link: '/styling/darkmode' },
      { text: 'Layouts', link: '/styling/layouts' },
      { text: 'UI Components', link: '/styling/uikit' },
      { text: 'Icons', link: '/styling/icons' },
      { text: 'Forms and Quizzes', link: '/styling/forms' },
      { text: 'Images and Videos', link: '/styling/imagesvideo.md' },
      { text: 'Presentation mode', link: '/presentation' },
      //{ text: 'Animations', link: '/styling/animations' },
    ],
  },
  {
    text: 'Recruiting participants',
    items: [
      { text: 'Cloud Hosting', link: '/recruit/deploying' },
      { text: 'Recruitment Services', link: '/recruit/recruitment' },
    ],
  },
  {
    text: 'Analyzing data',
    items: [
      { text: 'Analyzing data', link: '/analysis' },
    ],
  },
  {
    text: 'APIs and Advanced Documentation',
    items: [{ text: 'API', link: '/api' }],
  },

  {
    text: 'Contributing',
    items: [
      { text: 'Getting started contributing', link: '/gettingstarted' },
      { text: 'Contributing to the docs', link: '/contributing' },
      { text: 'Design Philosophy', link: '/philosophy' },
    ],
  },
]
