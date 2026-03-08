<script setup>
/**
 * Info page — shows deployment URLs, recruitment service setup instructions,
 * and experiment configuration at a glance. Protected by dev-auth.
 */
import { ref, computed } from 'vue'

const store = useSmileStore()
const config = store.config

// Base URL: use deployURL from config, or fall back to current origin
const baseUrl = computed(() => {
  if (config.deployURL) return config.deployURL.replace(/\/$/, '')
  if (import.meta.client) return window.location.origin
  return 'https://your-app.vercel.app'
})

const urls = store.browserEphemeral.urls

// Build full URLs for each service
const fullUrls = computed(() => {
  const result = {}
  for (const [key, path] of Object.entries(urls)) {
    result[key] = `${baseUrl.value}${path}`
  }
  return result
})

const selectedService = ref('prolific')

const copied = ref('')
async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = label
    setTimeout(() => { copied.value = '' }, 2000)
  } catch {
    // fallback
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    copied.value = label
    setTimeout(() => { copied.value = '' }, 2000)
  }
}

const services = {
  prolific: {
    name: 'Prolific',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    description: 'Prolific.co is a dedicated platform for online behavioral research with high-quality participants.',
    urlNote: 'Prolific appends query parameters automatically. Use the "Study URL" below as your study link in Prolific.',
    setupSteps: [
      'Go to <a href="https://app.prolific.co" target="_blank" class="underline font-medium">app.prolific.co</a> and create a new study.',
      'Set the <strong>Study URL</strong> to the Prolific URL shown below. Prolific will automatically append <code>PROLIFIC_PID</code>, <code>STUDY_ID</code>, and <code>SESSION_ID</code> query parameters.',
      'Under <strong>Study completion</strong>, select "I\'ll redirect them using a URL". Set the completion URL to: <code>https://app.prolific.co/submissions/complete?cc=YOUR_CODE</code> (SMILE handles this automatically via the Thanks page).',
      'Set your <strong>Audience</strong> filters (country, language, demographics, etc.).',
      'Set the estimated <strong>completion time</strong> and <strong>reward</strong>. Prolific requires fair pay (currently min ~$8/hr equivalent).',
      'Click <strong>Preview</strong> to test the external study link opens correctly, then <strong>Publish</strong> when ready.',
    ],
    studyUrl: computed(() => `${baseUrl.value}/welcome/prolific`),
  },
  cloudresearch: {
    name: 'CloudResearch',
    color: 'bg-pink-100 text-pink-800 border-pink-300',
    description: 'CloudResearch recruits from multiple sources including MTurk, with built-in bot and server farm screening.',
    urlNote: 'CloudResearch appends <code>assignmentId</code>, <code>hitId</code>, <code>turkSubmitTo</code>, and <code>workerId</code> as query parameters.',
    setupSteps: [
      'Go to <a href="https://app.cloudresearch.com" target="_blank" class="underline font-medium">app.cloudresearch.com</a> and create a new study.',
      'Choose <strong>"Survey / External Link"</strong> as your study type.',
      'Set the <strong>Survey URL</strong> to the CloudResearch URL shown below.',
      'Under <strong>Completion Code Settings</strong>, choose "I will generate a unique code". SMILE auto-generates a completion code on the Thanks page that participants copy back.',
      'Configure your <strong>participant requirements</strong> (approval rate, location, etc.).',
      'Set <strong>payment</strong> and <strong>number of participants</strong>.',
      'Use the <strong>Preview</strong> button to verify the link works, then <strong>Launch</strong>.',
    ],
    studyUrl: computed(() => `${baseUrl.value}/welcome/cloudresearch`),
  },
  mturk: {
    name: 'Mechanical Turk',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    description: 'Amazon Mechanical Turk — the original crowd labor market for online tasks and research.',
    urlNote: 'MTurk uses an ExternalQuestion HIT type. The URL must be HTTPS. MTurk appends <code>assignmentId</code>, <code>hitId</code>, <code>turkSubmitTo</code>, and <code>workerId</code>.',
    setupSteps: [
      'You\'ll need the <strong>AWS CLI</strong> or a tool like <a href="https://github.com/Mechanical-Turk-Requester" target="_blank" class="underline font-medium">Boto3 (Python)</a> to create ExternalQuestion HITs.',
      'Create an ExternalQuestion XML pointing to the MTurk URL shown below: <pre class="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">&lt;ExternalQuestion xmlns="..."&gt;\n  &lt;ExternalURL&gt;YOUR_MTURK_URL&lt;/ExternalURL&gt;\n  &lt;FrameHeight&gt;800&lt;/FrameHeight&gt;\n&lt;/ExternalQuestion&gt;</pre>',
      'Create the HIT using <code>create_hit_type</code> and <code>create_hit_with_hit_type</code> (or equivalent).',
      'SMILE handles the MTurk form submission automatically — when participants finish, the Thanks page posts their completion to <code>turkSubmitTo</code>.',
      'For testing, use the <strong>MTurk Sandbox</strong> (<code>https://workersandbox.mturk.com</code>) before publishing to production.',
      'Monitor HITs via the <a href="https://requester.mturk.com" target="_blank" class="underline font-medium">Requester dashboard</a>.',
    ],
    studyUrl: computed(() => `${baseUrl.value}/mturk`),
  },
  citizensci: {
    name: 'Citizen Science',
    color: 'bg-green-100 text-green-800 border-green-300',
    description: 'A stand-in for lab-run citizen science portals or custom recruitment.',
    urlNote: 'Parameters <code>CITIZEN_ID</code>, <code>CITIZEN_STUDY_ID</code>, and <code>CITIZEN_SESSION_ID</code> are appended by the referring portal.',
    setupSteps: [
      'Configure your citizen science portal to link to the URL shown below.',
      'The portal should append <code>CITIZEN_ID</code>, <code>CITIZEN_STUDY_ID</code>, and <code>CITIZEN_SESSION_ID</code> as query parameters to identify participants.',
      'SMILE will read these parameters and store them in the participant\'s recruitment info.',
      'On completion, participants see a standard Thanks page. Configure your portal to accept the SMILE completion code if needed.',
    ],
    studyUrl: computed(() => `${baseUrl.value}/welcome/citizensci`),
  },
  web: {
    name: 'Anonymous Web',
    color: 'bg-purple-100 text-purple-800 border-purple-300',
    description: 'Direct web access — no recruitment service. Participants arrive via a shared link.',
    urlNote: 'No special query parameters. Share this URL directly.',
    setupSteps: [
      'Share the URL shown below via email, social media, QR code, or any other channel.',
      'Participants are assigned a random anonymous ID. No recruitment service metadata is collected.',
      'Since there is no external payment system, you\'ll need to arrange compensation separately if applicable.',
      'This mode is useful for pilot testing, demos, or unpaid studies.',
    ],
    studyUrl: computed(() => `${baseUrl.value}/welcome`),
  },
}

const currentService = computed(() => services[selectedService.value])
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900 font-sans">
    <div class="max-w-3xl mx-auto px-4 py-10">

      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold mb-2">Experiment Info</h1>
        <p class="text-gray-600">
          Deployment details, recruitment URLs, and setup instructions for your experiment.
        </p>
      </div>

      <!-- Experiment Details Card -->
      <div class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4">Experiment Details</h2>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt class="text-gray-500 font-medium">Project</dt>
          <dd>{{ config.projectName || config.projectRef || '(not set)' }}</dd>

          <dt class="text-gray-500 font-medium">Code Name</dt>
          <dd>{{ config.codeName || '(not set)' }}</dd>

          <dt class="text-gray-500 font-medium">Version</dt>
          <dd>{{ config.smileVersion || '(not set)' }}</dd>

          <template v-if="config.github?.repoName">
            <dt class="text-gray-500 font-medium">Repository</dt>
            <dd>
              <a
                :href="`https://github.com/${config.github.owner}/${config.github.repoName}`"
                target="_blank"
                class="text-blue-600 underline"
              >
                {{ config.github.owner }}/{{ config.github.repoName }}
              </a>
            </dd>

            <dt class="text-gray-500 font-medium">Branch</dt>
            <dd>{{ config.github.branch || '(unknown)' }}</dd>

            <dt class="text-gray-500 font-medium">Last Commit</dt>
            <dd>
              <a
                v-if="config.github.lastCommitHash"
                :href="config.github.commitURL"
                target="_blank"
                class="text-blue-600 underline font-mono text-xs"
              >
                {{ config.github.lastCommitHash }}
              </a>
              <span v-if="config.github.lastCommitMsg" class="ml-2 text-gray-500">
                {{ config.github.lastCommitMsg }}
              </span>
            </dd>
          </template>

          <dt class="text-gray-500 font-medium">Deploy URL</dt>
          <dd class="font-mono text-xs break-all">{{ baseUrl }}</dd>
        </dl>

        <!-- QR Code for production URL -->
        <div class="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4">
          <img :src="`/api/qr?url=${encodeURIComponent(baseUrl)}`" alt="QR Code" class="w-32 h-32" />
          <div class="text-sm text-gray-500">
            <p class="font-medium text-gray-700 mb-1">QR Code</p>
            <p>Scan to open the experiment on a mobile device, or download for posters and presentations.</p>
            <a
              :href="`/api/qr?url=${encodeURIComponent(baseUrl)}`"
              download="qr.svg"
              class="inline-flex items-center gap-1 mt-2 text-blue-600 underline text-xs"
            >
              Download SVG
            </a>
          </div>
        </div>
      </div>

      <!-- Quick Links -->
      <div class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4">Mode URLs</h2>
        <div class="space-y-3 text-sm">
          <div class="flex items-center justify-between">
            <div>
              <span class="font-medium">Production</span>
              <span class="text-gray-500 ml-2">— participants see this</span>
            </div>
            <div class="flex items-center gap-2">
              <code class="text-xs bg-gray-100 px-2 py-1 rounded">{{ baseUrl }}/</code>
              <button
                @click="copyToClipboard(`${baseUrl}/`, 'prod')"
                class="text-xs px-2 py-1 border rounded hover:bg-gray-50"
              >
                {{ copied === 'prod' ? 'Copied!' : 'Copy' }}
              </button>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <div>
              <span class="font-medium">Dev Mode</span>
              <span class="text-gray-500 ml-2">— sidebar + console</span>
            </div>
            <div class="flex items-center gap-2">
              <code class="text-xs bg-gray-100 px-2 py-1 rounded">{{ baseUrl }}/dev/</code>
              <button
                @click="copyToClipboard(`${baseUrl}/dev/`, 'dev')"
                class="text-xs px-2 py-1 border rounded hover:bg-gray-50"
              >
                {{ copied === 'dev' ? 'Copied!' : 'Copy' }}
              </button>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <div>
              <span class="font-medium">Presentation</span>
              <span class="text-gray-500 ml-2">— nav bar for demos</span>
            </div>
            <div class="flex items-center gap-2">
              <code class="text-xs bg-gray-100 px-2 py-1 rounded">{{ baseUrl }}/presentation/</code>
              <button
                @click="copyToClipboard(`${baseUrl}/presentation/`, 'pres')"
                class="text-xs px-2 py-1 border rounded hover:bg-gray-50"
              >
                {{ copied === 'pres' ? 'Copied!' : 'Copy' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Recruitment Service Section -->
      <div class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4">Recruitment Service Setup</h2>

        <!-- Service Selector -->
        <div class="mb-6">
          <label for="service-select" class="block text-sm font-medium text-gray-700 mb-1">
            Select a recruitment platform:
          </label>
          <select
            id="service-select"
            v-model="selectedService"
            class="w-full max-w-xs border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="prolific">Prolific</option>
            <option value="cloudresearch">CloudResearch</option>
            <option value="mturk">Mechanical Turk</option>
            <option value="citizensci">Citizen Science</option>
            <option value="web">Anonymous Web</option>
          </select>
        </div>

        <!-- Selected Service Details -->
        <div class="border rounded-lg overflow-hidden" :class="currentService.color.replace(/text-\S+/, '').trim()">
          <div class="px-4 py-3 border-b" :class="currentService.color">
            <h3 class="font-semibold">{{ currentService.name }}</h3>
            <p class="text-sm mt-1 opacity-80">{{ currentService.description }}</p>
          </div>

          <div class="p-4 bg-white">
            <!-- Study URL -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-1">Study URL</label>
              <p class="text-xs text-gray-500 mb-2" v-html="currentService.urlNote"></p>
              <div class="flex items-center gap-2">
                <code class="flex-1 text-xs bg-gray-50 border rounded px-3 py-2 break-all select-all">
                  {{ currentService.studyUrl.value }}
                </code>
                <button
                  @click="copyToClipboard(currentService.studyUrl.value, 'study')"
                  class="shrink-0 text-xs px-3 py-2 border rounded hover:bg-gray-50 font-medium"
                >
                  {{ copied === 'study' ? 'Copied!' : 'Copy' }}
                </button>
              </div>
            </div>

            <!-- Full Test URL (with example params) -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-1">Test URL (with example params)</label>
              <div class="flex items-center gap-2">
                <code class="flex-1 text-xs bg-gray-50 border rounded px-3 py-2 break-all select-all">
                  {{ fullUrls[selectedService] }}
                </code>
                <button
                  @click="copyToClipboard(fullUrls[selectedService], 'test')"
                  class="shrink-0 text-xs px-3 py-2 border rounded hover:bg-gray-50 font-medium"
                >
                  {{ copied === 'test' ? 'Copied!' : 'Copy' }}
                </button>
              </div>
            </div>

            <!-- Setup Instructions -->
            <div>
              <h4 class="text-sm font-medium text-gray-700 mb-2">Setup Instructions</h4>
              <ol class="list-decimal list-outside ml-5 space-y-2 text-sm text-gray-700">
                <li
                  v-for="(step, i) in currentService.setupSteps"
                  :key="i"
                  v-html="step"
                  class="leading-relaxed"
                ></li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <!-- Back link -->
      <div class="text-center text-sm text-gray-500">
        <NuxtLink to="/dev/" class="text-blue-600 underline">Back to Dev Mode</NuxtLink>
      </div>
    </div>
  </div>
</template>
