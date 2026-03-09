<script setup>
import { ArrowLeft, ArrowRight, BookOpen, Copy, Check, Dices } from 'lucide-vue-next'
import { ref, computed } from 'vue'
import useViewAPI from '../../composables/useViewAPI'
import useSmileStore from '../../stores/smilestore'

const api = useViewAPI()
const store = useSmileStore()
const config = store.config

// Currently selected service for detail view (null = card grid)
const selectedService = ref(null)

// Base URL for deployment links
const baseUrl = computed(() => {
  if (config.deployURL) return config.deployURL.replace(/\/$/, '')
  if (import.meta.client) return window.location.origin
  return 'https://your-app.vercel.app'
})

// Prepend /dev to recruitment URLs so they stay in dev mode
const devUrls = computed(() => {
  const urls = {}
  for (const [key, value] of Object.entries(api.urls)) {
    urls[key] = '/dev' + value
  }
  return urls
})

// Clipboard helper
const copied = ref('')
async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = label
    copied.value = label
    setTimeout(() => {
      copied.value = ''
    }, 2000)
  }
  catch {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    copied.value = label
    setTimeout(() => {
      copied.value = ''
    }, 2000)
  }
}

// Service definitions with card styling + info content
const services = {
  prolific: {
    name: 'Prolific',
    buttonLabel: 'Prolific',
    buttonClass: 'is-blue',
    description: 'Prolific.co is a dedicated platform for online behavioral research with high-quality participants.',
    link: 'https://www.prolific.co',
    urlNote: 'Prolific appends query parameters automatically. Use the "Study URL" below as your study link in Prolific.',
    studyUrl: computed(() => `${baseUrl.value}/welcome/prolific`),
    setupSteps: [
      'Go to <a href="https://app.prolific.co" target="_blank" class="underline font-medium">app.prolific.co</a> and create a new study.',
      'Set the <strong>Study URL</strong> to the Prolific URL shown below. Prolific will automatically append <code>PROLIFIC_PID</code>, <code>STUDY_ID</code>, and <code>SESSION_ID</code> query parameters.',
      'Under <strong>Study completion</strong>, select "I\'ll redirect them using a URL". Set the completion URL to: <code>https://app.prolific.co/submissions/complete?cc=YOUR_CODE</code> (SMILE handles this automatically via the Thanks page).',
      'Set your <strong>Audience</strong> filters (country, language, demographics, etc.).',
      'Set the estimated <strong>completion time</strong> and <strong>reward</strong>. Prolific requires fair pay (currently min ~$8/hr equivalent).',
      'Click <strong>Preview</strong> to test the external study link opens correctly, then <strong>Publish</strong> when ready.',
    ],
  },
  cloudresearch: {
    name: 'CloudResearch',
    buttonLabel: 'CR',
    buttonClass: 'is-pink',
    description: 'CloudResearch recruits from several sources, including Mechanical Turk but includes some screening for bots and server farms.',
    link: 'https://www.cloudresearch.com/',
    urlNote: 'CloudResearch appends <code>assignmentId</code>, <code>hitId</code>, <code>turkSubmitTo</code>, and <code>workerId</code> as query parameters.',
    studyUrl: computed(() => `${baseUrl.value}/welcome/cloudresearch`),
    setupSteps: [
      'Go to <a href="https://app.cloudresearch.com" target="_blank" class="underline font-medium">app.cloudresearch.com</a> and create a new study.',
      'Choose <strong>"Survey / External Link"</strong> as your study type.',
      'Set the <strong>Survey URL</strong> to the CloudResearch URL shown below.',
      'Under <strong>Completion Code Settings</strong>, choose "I will generate a unique code". SMILE auto-generates a completion code on the Thanks page that participants copy back.',
      'Configure your <strong>participant requirements</strong> (approval rate, location, etc.).',
      'Set <strong>payment</strong> and <strong>number of participants</strong>.',
      'Use the <strong>Preview</strong> button to verify the link works, then <strong>Launch</strong>.',
    ],
  },
  mturk: {
    name: 'Mechanical Turk',
    buttonLabel: 'AMT',
    buttonClass: 'is-yellow',
    extraButtons: true, // has AMT Preview Mode button
    description: 'Amazon Mechanical Turk is the original wild-west of online crowd labor markets.',
    link: 'https://mturk.com',
    urlNote: 'MTurk uses an ExternalQuestion HIT type. The URL must be HTTPS. MTurk appends <code>assignmentId</code>, <code>hitId</code>, <code>turkSubmitTo</code>, and <code>workerId</code>.',
    studyUrl: computed(() => `${baseUrl.value}/mturk`),
    setupSteps: [
      'You\'ll need the <strong>AWS CLI</strong> or a tool like <a href="https://github.com/Mechanical-Turk-Requester" target="_blank" class="underline font-medium">Boto3 (Python)</a> to create ExternalQuestion HITs.',
      'Create an ExternalQuestion XML pointing to the MTurk URL shown below: <pre class="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">&lt;ExternalQuestion xmlns="..."&gt;\n  &lt;ExternalURL&gt;YOUR_MTURK_URL&lt;/ExternalURL&gt;\n  &lt;FrameHeight&gt;800&lt;/FrameHeight&gt;\n&lt;/ExternalQuestion&gt;</pre>',
      'Create the HIT using <code>create_hit_type</code> and <code>create_hit_with_hit_type</code> (or equivalent).',
      'SMILE handles the MTurk form submission automatically — when participants finish, the Thanks page posts their completion to <code>turkSubmitTo</code>.',
      'For testing, use the <strong>MTurk Sandbox</strong> (<code>https://workersandbox.mturk.com</code>) before publishing to production.',
      'Monitor HITs via the <a href="https://requester.mturk.com" target="_blank" class="underline font-medium">Requester dashboard</a>.',
    ],
  },
  citizensci: {
    name: 'Citizen Science',
    buttonLabel: 'CitizenSci',
    buttonClass: 'is-green',
    description: 'Citizen Science is a stand-in for a possible future platform run by the lab.',
    urlNote: 'Parameters <code>CITIZEN_ID</code>, <code>CITIZEN_STUDY_ID</code>, and <code>CITIZEN_SESSION_ID</code> are appended by the referring portal.',
    studyUrl: computed(() => `${baseUrl.value}/welcome/citizensci`),
    setupSteps: [
      'Configure your citizen science portal to link to the URL shown below.',
      'The portal should append <code>CITIZEN_ID</code>, <code>CITIZEN_STUDY_ID</code>, and <code>CITIZEN_SESSION_ID</code> as query parameters to identify participants.',
      'SMILE will read these parameters and store them in the participant\'s recruitment info.',
      'On completion, participants see a standard Thanks page. Configure your portal to accept the SMILE completion code if needed.',
    ],
  },
  sona: {
    name: 'SONA',
    buttonLabel: 'SONA',
    buttonClass: 'is-orange',
    description: 'SONA is a platform for running experiments from the university "for credit" pool of students.',
    urlNote: 'SONA appends a <code>survey_code</code> query parameter that is used to grant credit upon completion.',
    studyUrl: computed(() => `${baseUrl.value}/welcome/sona/?survey_code=%SURVEY_CODE%`),
    setupSteps: [
      'Log in to your university\'s SONA system and create a new <strong>Online External Study</strong>.',
      'Set the <strong>Study URL</strong> to the SONA URL shown below. SONA will automatically replace <code>%SURVEY_CODE%</code> with the participant\'s unique code.',
      'Under <strong>Study Information</strong>, set the estimated duration and number of credits.',
      'Set your <strong>Participant Restrictions</strong> (prerequisites, disqualifiers, etc.).',
      'Configure the following environment variables in your deployment: <code>VITE_SONA_URL</code> (your SONA domain), <code>VITE_SONA_EXPERIMENT_ID</code>, and <code>VITE_SONA_CREDIT_TOKEN</code>.',
      'SMILE automatically redirects participants back to SONA to grant credit upon completion.',
    ],
  },
  sona_paid: {
    name: 'SONA Paid',
    buttonLabel: 'SONA Paid',
    buttonClass: 'is-teal',
    description: 'SONA Paid is a platform for running paid experiments from the university pool.',
    urlNote: 'Same as SONA credit but uses separate config for paid study completion.',
    studyUrl: computed(() => `${baseUrl.value}/welcome/sona_paid/?survey_code=%SURVEY_CODE%`),
    setupSteps: [
      'Log in to your university\'s SONA system and create a new <strong>Online External Study</strong> (paid type).',
      'Set the <strong>Study URL</strong> to the SONA Paid URL shown below.',
      'Configure payment amount and study duration.',
      'Configure the following environment variables: <code>VITE_SONA_PAID_URL</code>, <code>VITE_SONA_PAID_EXPERIMENT_ID</code>, and <code>VITE_SONA_PAID_CREDIT_TOKEN</code>.',
      'SMILE automatically redirects participants back to SONA for payment upon completion.',
    ],
  },
  spark: {
    name: 'SPARK',
    buttonLabel: 'SPARK',
    buttonClass: 'is-red',
    description: 'SPARK is a recruitment service from the Hartley Lab for adolescent participants of various ages.',
    urlNote: 'SPARK appends <code>subject_ID</code>, <code>participant_ID</code>, <code>age</code>, and <code>gender</code> as query parameters.',
    studyUrl: computed(() => `${baseUrl.value}/welcome/spark`),
    setupSteps: [
      'Coordinate with the SPARK platform team to register your study.',
      'Provide the SPARK URL shown below as the study link.',
      'SPARK will append participant demographic information (subject ID, participant ID, age, gender) as query parameters.',
      'Upon completion, SMILE redirects participants back to the SPARK completion endpoint.',
    ],
  },
  panda: {
    name: 'PANDA',
    buttonLabel: 'PANDA',
    buttonClass: 'is-coral',
    description: 'PANDA (Princeton and NYU Discoveries in Action) is a recruitment platform for younger participants.',
    link: 'https://www.discoveriesinaction.org',
    urlNote: 'PANDA appends an <code>ID</code> query parameter to identify the participant.',
    studyUrl: computed(() => `${baseUrl.value}/welcome/panda`),
    setupSteps: [
      'Register your study with the <a href="https://www.discoveriesinaction.org" target="_blank" class="underline font-medium">PANDA platform</a>.',
      'Provide the PANDA URL shown below as the study link.',
      'PANDA loads studies in dual iframes (mobile/desktop). SMILE automatically detects and handles the hidden iframe.',
      'Note: PANDA clears localStorage on each session start to support families running the study multiple times.',
      'Upon completion, participants see a generic thanks message. No redirect is performed.',
    ],
  },
  web: {
    name: 'Anonymous Web User',
    buttonLabel: 'Anon Web',
    buttonClass: 'is-purple',
    description: 'Anonymous web user is not referred by any recruitment service.',
    urlNote: 'No special query parameters. Share this URL directly.',
    studyUrl: computed(() => `${baseUrl.value}/welcome`),
    setupSteps: [
      'Share the URL shown below via email, social media, QR code, or any other channel.',
      'Participants are assigned a random anonymous ID. No recruitment service metadata is collected.',
      'Since there is no external payment system, you\'ll need to arrange compensation separately if applicable.',
      'This mode is useful for pilot testing, demos, or unpaid studies.',
    ],
  },
}

const currentService = computed(() => services[selectedService.value])

// Build full test URLs with example params
const fullUrls = computed(() => {
  const result = {}
  for (const [key, path] of Object.entries(api.urls)) {
    result[key] = `${baseUrl.value}${path}`
  }
  return result
})
</script>

<template>
  <div class="px-4 md:px-8 lg:px-12 pt-10 pb-10 bg-background text-foreground global-color-mode">
    <!-- Detail view for selected service -->
    <template v-if="selectedService && currentService">
      <!-- Back button -->
      <button
        class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        @click="selectedService = null"
      >
        <ArrowLeft class="size-4" />
        Back to all services
      </button>

      <!-- Service header -->
      <div class="mb-6">
        <h1 class="text-2xl font-bold mb-1">
          {{ currentService.name }}
        </h1>
        <p class="text-muted-foreground">
          {{ currentService.description }}
        </p>
      </div>

      <!-- Test as user button -->
      <div class="mb-6">
        <Button
          as-child
          variant="default"
          size="sm"
          :class="currentService.buttonClass"
        >
          <a :href="devUrls[selectedService]">
            <Dices class="size-4" />
            Test as {{ currentService.name }}
            <ArrowRight class="size-4" />
          </a>
        </Button>
      </div>

      <!-- Study URL -->
      <Card class="mb-4">
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">
            Study URL
          </CardTitle>
          <div
            class="text-xs text-muted-foreground"
            v-html="currentService.urlNote"
          />
        </CardHeader>
        <CardContent>
          <div class="flex items-center gap-2">
            <code class="flex-1 text-xs bg-muted px-3 py-2 rounded break-all select-all">
              {{ currentService.studyUrl.value }}
            </code>
            <Button
              variant="outline"
              size="xs"
              @click="copyToClipboard(currentService.studyUrl.value, `study-${selectedService}`)"
            >
              <Check
                v-if="copied === `study-${selectedService}`"
                class="size-3"
              />
              <Copy
                v-else
                class="size-3"
              />
              {{ copied === `study-${selectedService}` ? 'Copied!' : 'Copy' }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Test URL with example params -->
      <Card class="mb-6">
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">
            Test URL (with example params)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex items-center gap-2">
            <code class="flex-1 text-xs bg-muted px-3 py-2 rounded break-all select-all">
              {{ fullUrls[selectedService] }}
            </code>
            <Button
              variant="outline"
              size="xs"
              @click="copyToClipboard(fullUrls[selectedService], `test-${selectedService}`)"
            >
              <Check
                v-if="copied === `test-${selectedService}`"
                class="size-3"
              />
              <Copy
                v-else
                class="size-3"
              />
              {{ copied === `test-${selectedService}` ? 'Copied!' : 'Copy' }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Setup Instructions -->
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">
            Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol class="list-decimal list-outside ml-5 space-y-2 text-sm text-muted-foreground">
            <li
              v-for="(step, i) in currentService.setupSteps"
              :key="i"
              class="leading-relaxed"
              v-html="step"
            />
          </ol>
        </CardContent>
      </Card>
    </template>

    <!-- Card grid view -->
    <template v-else>
      <div class="mb-6 flex items-start gap-6">
        <!-- Left column: logo + QR -->
        <div class="shrink-0 flex flex-col items-end gap-3">
          <img
            src="/_smile/images/smile.svg"
            alt="SMILE"
            class="w-52"
          >
          <a
            :href="`/api/qr?url=${encodeURIComponent(baseUrl)}`"
            download="qr.svg"
            title="Download QR code"
          >
            <img
              :src="`/api/qr?url=${encodeURIComponent(baseUrl)}`"
              alt="QR Code"
              class="w-24 h-24"
            >
          </a>
        </div>

        <!-- Right column: text + details -->
        <div>
          <h1 class="text-3xl font-bold mb-2">
            Welcome to Smile Developer Mode
          </h1>
          <p class="text-lg mb-4">
            You can use this to test your application, read the docs, QA your data, and recruit participants through
            multiple platforms.
          </p>

          <!-- Experiment Details -->
          <div class="min-w-0">
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              <dt class="text-muted-foreground/60">
                Project
              </dt>
              <dd class="font-mono flex items-center gap-1">
                {{ config.projectName || config.projectRef || '(not set)' }}
                <button
                  class="text-muted-foreground hover:text-foreground transition-colors"
                  @click="copyToClipboard(config.projectName || config.projectRef || '', 'project')"
                >
                  <Check
                    v-if="copied === 'project'"
                    class="size-3"
                  /><Copy
                    v-else
                    class="size-3"
                  />
                </button>
              </dd>

              <dt class="text-muted-foreground/60">
                Code Name
              </dt>
              <dd class="font-mono flex items-center gap-1">
                {{ config.codeName || '(not set)' }}
                <button
                  class="text-muted-foreground hover:text-foreground transition-colors"
                  @click="copyToClipboard(config.codeName || '', 'codename')"
                >
                  <Check
                    v-if="copied === 'codename'"
                    class="size-3"
                  /><Copy
                    v-else
                    class="size-3"
                  />
                </button>
              </dd>

              <dt class="text-muted-foreground/60">
                Version
              </dt>
              <dd class="font-mono flex items-center gap-1">
                {{ config.smileVersion || '(not set)' }}
                <button
                  class="text-muted-foreground hover:text-foreground transition-colors"
                  @click="copyToClipboard(config.smileVersion || '', 'version')"
                >
                  <Check
                    v-if="copied === 'version'"
                    class="size-3"
                  /><Copy
                    v-else
                    class="size-3"
                  />
                </button>
              </dd>

              <template v-if="config.github?.repoName">
                <dt class="text-muted-foreground/60">
                  Repo
                </dt>
                <dd class="font-mono flex items-center gap-1">
                  <a
                    :href="`https://github.com/${config.github.owner}/${config.github.repoName}`"
                    target="_blank"
                    class="text-[var(--link-button-foreground)] underline"
                  >{{ config.github.owner }}/{{ config.github.repoName }}</a>
                  <span class="text-muted-foreground">({{ config.github.branch || '?' }})</span>
                  <button
                    class="text-muted-foreground hover:text-foreground transition-colors"
                    @click="copyToClipboard(`https://github.com/${config.github.owner}/${config.github.repoName}`, 'repo')"
                  >
                    <Check
                      v-if="copied === 'repo'"
                      class="size-3"
                    /><Copy
                      v-else
                      class="size-3"
                    />
                  </button>
                </dd>

                <dt class="text-muted-foreground/60">
                  Commit
                </dt>
                <dd class="font-mono flex items-start gap-1">
                  <a
                    v-if="config.github.lastCommitHash"
                    :href="config.github.commitURL"
                    target="_blank"
                    class="text-[var(--link-button-foreground)] underline text-xs"
                  >{{ config.github.lastCommitHash }}</a>
                  <span
                    v-if="config.github.lastCommitMsg"
                    class="text-muted-foreground text-xs"
                  >{{ config.github.lastCommitMsg }}
                    <button
                      v-if="config.github.lastCommitHash"
                      class="inline-flex align-middle text-muted-foreground hover:text-foreground transition-colors ml-1"
                      @click="copyToClipboard(config.github.lastCommitHash, 'commit')"
                    >
                      <Check
                        v-if="copied === 'commit'"
                        class="size-3"
                      /><Copy
                        v-else
                        class="size-3"
                      />
                    </button>
                  </span>
                </dd>
              </template>
            </dl>

            <!-- Mode URLs -->
            <div class="flex flex-col gap-1 mt-2 pt-2 border-t text-xs">
              <div
                v-for="{ label, suffix, key } in [
                  { label: 'Dev', suffix: '/dev/', key: 'dev' },
                  { label: 'Production', suffix: '/', key: 'prod' },
                  { label: 'Presentation', suffix: '/presentation/', key: 'pres' },
                ]"
                :key="key"
                class="flex items-center gap-1"
              >
                <span class="text-muted-foreground/60 w-20">{{ label }}:</span>
                <code class="bg-muted px-1.5 py-0.5 rounded">{{ baseUrl }}{{ suffix }}</code>
                <button
                  class="text-muted-foreground hover:text-foreground transition-colors"
                  @click="copyToClipboard(`${baseUrl}${suffix}`, key)"
                >
                  <Check
                    v-if="copied === key"
                    class="size-3"
                  />
                  <Copy
                    v-else
                    class="size-3"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <hr class="my-4">

      <div class="grid grid-cols-2 @3xl:grid-cols-3 gap-4">
        <Card
          v-for="(svc, key) in services"
          :key="key"
          class="flex flex-col"
        >
          <CardHeader>
            <div class="flex items-center justify-between gap-2">
              <CardTitle>{{ svc.name }}</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger as-child>
                    <button
                      class="shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-all p-1 rounded"
                      @click="selectedService = key"
                    >
                      <BookOpen class="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>How to use {{ svc.name }}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <CardDescription>{{ svc.description }}</CardDescription>
          </CardHeader>
          <CardContent class="flex justify-end flex-1 items-end gap-2">
            <div class="flex items-end gap-2">
              <template v-if="key === 'mturk'">
                <Button
                  as-child
                  variant="secondary"
                  size="xs"
                  class="is-light-yellow"
                >
                  <a href="/dev/mturk?assignmentId=ASSIGNMENT_ID_NOT_AVAILABLE&hitId=123RVWYBAZW00EXAMPLE&turkSubmitTo=https://www.mturk.com/&workerId=AZ3456EXAMPLE">
                    Preview
                    <ArrowRight class="inline-block ml-1 w-4 h-4" />
                  </a>
                </Button>
              </template>
              <Button
                as-child
                variant="default"
                size="xs"
                :class="svc.buttonClass"
              >
                <a :href="devUrls[key]">
                  <Dices />
                  {{ svc.buttonLabel }}
                  <ArrowRight class="inline-block ml-1 w-4 h-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>

<style>
.global-color-mode a:not([class*="is-"]) {
  color: var(--link-button-foreground);
}
</style>

<style scoped>
.is-blue {
  background-color: rgb(102, 209, 255);
  color: #393939;
}

.is-red {
  background-color: rgb(255, 102, 133);
  color: #393939;
}

.is-light-yellow {
  background-color: rgb(245, 213, 138);
  color: #393939;
}

.is-yellow {
  background-color: rgb(255, 183, 15);
  color: #393939;
}

.is-pink {
  background-color: #ffc0cb;
  color: #393939;
}

.is-green {
  background-color: rgb(91, 228, 166);
  color: #393939;
}

.is-orange {
  background-color: rgb(255, 179, 102);
  color: #393939;
}

.is-teal {
  background-color: rgb(102, 217, 204);
  color: #393939;
}

.is-coral {
  background-color: rgb(255, 140, 130);
  color: #393939;
}

.is-purple {
  background-color: #ebaeff;
  color: #393939;
  border: none;
}

@media screen and (max-width: 599px) {
  .text-4xl {
    font-size: 1.5em;
  }
}

@media screen and (max-width: 418px) {
  .text-4xl {
    display: none;
  }
}
</style>
