<script setup>
import { ArrowRight, ClipboardCopy, SquareCheckBig } from 'lucide-vue-next'
/**
 * ThanksView Component
 *
 * Displays completion/thanks page with different layouts based on recruitment service.
 * Handles completion code generation and clipboard functionality for various platforms.
 * Shows an upload progress animation before displaying the final thanks message.
 */

// Vue imports
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import useAPI from '../../composables/useAPI'
import { copyText } from '../../utils/clipboard.js'

/**
 * Initialize API
 */
const api = useAPI()

/**
 * Check if this is a revisit (completion code already exists in cookie)
 * If so, skip the upload animation since data was already saved.
 */
const alreadyCompleted = !!api.store.cookieState.completionCode

/**
 * Upload progress state — skip animation if already completed
 */
const isUploading = ref(!alreadyCompleted)
const uploadProgress = ref(alreadyCompleted ? 100 : 0)

/**
 * Completion code — reuse from cookie on revisit, generate fresh on first visit.
 * The code is shown whether or not the last save reached the server: a
 * participant is paid for their time even when saving fails. The page waits
 * for the save first (up to MAX_SAVE_WAIT), and says so if it is still going.
 */
const completionCode = ref(
  alreadyCompleted ? api.store.cookieState.completionCode : api.computeCompletionCode(),
)

/** The longest the upload screen waits for the last save before showing the code */
const MAX_SAVE_WAIT = 15000

/**
 * A save has failed and the sync loop is still trying (or the browser is
 * offline). Not the second or so a normal save takes: that would only flash.
 */
const stillSaving = computed(() => ['offline', 'error'].includes(api.syncStatus.status))

const prolificCompleteUrl = computed(
  () => `https://app.prolific.com/submissions/complete?cc=${completionCode.value}`,
)

/**
 * Copies the text of a copy button's target. A copy button is any element
 * with a data-clipboard-target attribute holding a CSS selector; the text
 * copied is the value of the element the selector finds (its text content
 * when it is not a form field).
 * @param {MouseEvent} event - A click anywhere in the document
 */
async function copyFromClickedButton(event) {
  const trigger = event.target instanceof Element ? event.target.closest('[data-clipboard-target]') : null
  if (!trigger) return
  const target = document.querySelector(trigger.getAttribute('data-clipboard-target'))
  if (!target) return
  const copied = await copyText(target.value ?? target.textContent, target)
  if (copied) api.log.debug(`code copied to clipboard ${trigger.id}`)
  else api.log.warn('could not copy the code to the clipboard')
}

onBeforeUnmount(() => {
  document.removeEventListener('click', copyFromClickedButton)
})

/**
 * Initialize clipboard functionality and run upload animation
 * Listens for clicks on the copy buttons
 * Animates the progress bar over 20 seconds before showing thanks content
 */
onMounted(() => {
  // Set up clipboard functionality
  document.addEventListener('click', copyFromClickedButton)

  // Skip upload animation and save if already completed
  if (alreadyCompleted) return

  // Save, then show the code. The progress bar animates to ~80% and jumps to
  // 100% once the server has the record. If the save fails, the sync loop
  // keeps trying; this screen waits up to MAX_SAVE_WAIT for it and then shows
  // the code anyway, with a note that saving is still going on.
  let saved = false
  const minDisplayTime = 2000 // show upload screen for at least 2 seconds
  const mountTime = Date.now()

  // Start the save immediately (no delay). sync() never rejects.
  api.sync().then((result) => {
    saved = result.ok
    // Set either way: it marks the study as finished for a return visit
    api.setCompletionCode(completionCode.value)
  })

  const updateProgress = () => {
    const elapsed = Date.now() - mountTime

    // A retry by the sync loop may have got through since sync() answered
    if (!saved && elapsed >= minDisplayTime && api.syncStatus.status === 'saved' && api.store.cookieState.completionCode) saved = true
    if ((saved && elapsed >= minDisplayTime) || elapsed >= MAX_SAVE_WAIT) {
      uploadProgress.value = 100
      isUploading.value = false
      return
    }

    // Animate to ~80% over 3 seconds while waiting
    const fakeProgress = Math.min(elapsed / 3000, 0.8)
    const eased = 1 - Math.pow(1 - fakeProgress, 2)
    uploadProgress.value = Math.round(eased * 100)
    requestAnimationFrame(updateProgress)
  }

  requestAnimationFrame(updateProgress)
})
</script>

<template>
  <!-- Upload progress screen -->
  <div
    v-if="isUploading"
    class="w-full h-screen flex flex-col items-center mt-30"
  >
    <div class="w-4/5 max-w-md text-center">
      <h1 class="text-3xl font-bold mb-4">
        Uploading Your Data
      </h1>
      <p class="text-lg text-muted-foreground mb-8">
        Do not close your browser window yet!
      </p>
      <Progress
        :model-value="uploadProgress"
        class="h-3 mb-4"
      />
      <p class="text-sm text-muted-foreground">
        {{ uploadProgress }}%
      </p>
    </div>
  </div>

  <!-- Main container with responsive padding and centering -->
  <div
    v-else
    class="w-full mx-auto py-10"
  >
    <div class="w-4/5 mx-auto text-left">
      <!-- The last save hasn't arrived: ask for a moment more, without holding the code back -->
      <p
        v-if="stillSaving"
        class="mb-6 rounded-md border border-border bg-muted px-4 py-3 text-sm"
        role="status"
        data-testid="thanks-still-saving"
      >
        Your data is still being saved. Please keep this page open for a moment before you leave it; this
        message goes away when saving is finished.
      </p>
      <!-- Prolific recruitment service completion -->
      <div v-if="api.getRecruitmentService() == 'prolific'">
        <TitleTwoCol
          left-first
          left-width="w-1/3"
          :responsive-u-i="api.config.responsiveUI"
        >
          <template #title>
            <h1 class="text-3xl font-bold mb-4">
              <SquareCheckBig class="inline mr-2" />&nbsp;Thanks, let's begin the payment process!
            </h1>
            <p class="text-lg mb-8">
              Please click the button below to begin the process of payment. This will notify Prolific you successfully
              completed the task. Your work will be approved within several hours and any performance related bonuses
              will be assigned at that time. We really appreciate your time.
            </p>
          </template>
          <template #left>
            <div class="text-left text-muted-foreground">
              <h3 class="text-lg font-bold mb-2">
                Payment Process
              </h3>
              <p class="text-sm text-muted-foreground">
                Click the button to complete your submission and receive payment through Prolific.
              </p>
            </div>
          </template>
          <template #right>
            <div class="border border-border text-left bg-muted p-6 rounded-lg">
              <Button
                variant="default"
                as="a"
                :href="prolificCompleteUrl"
              >
                Submit my work to Prolific
                <ArrowRight />
              </Button>
            </div>
          </template>
        </TitleTwoCol>
      </div>

      <!-- CloudResearch recruitment service completion -->
      <div v-if="api.getRecruitmentService() == 'cloudresearch'">
        <TitleTwoCol
          left-first
          left-width="w-1/3"
          :responsive-u-i="api.config.responsiveUI"
        >
          <template #title>
            <h1 class="text-3xl font-bold mb-4">
              <SquareCheckBig class="inline mr-2" />&nbsp;Thanks, let's begin the payment process!
            </h1>
            <p class="text-lg mb-8">
              Please copy the code displayed below (or click the button) and paste it into the CloudResearch study
              window to begin the process of payment. Your work will be approved within several hours and any performance related
              bonuses will be assigned at that time. We really appreciate your time.
            </p>
          </template>
          <template #left>
            <div class="text-left text-muted-foreground">
              <h3 class="text-lg font-bold mb-2">
                Completion Code
              </h3>
              <p class="text-sm text-muted-foreground">
                Copy this unique code and paste it into the CloudResearch submission form.
              </p>
            </div>
          </template>
          <template #right>
            <div class="border border-border text-left bg-muted p-6 rounded-lg">
              <h3 class="text-lg font-semibold mb-4 text-foreground">
                Unique completion code:
              </h3>
              <div class="flex items-center gap-4 mb-4">
                <Input
                  v-model="completionCode"
                  readonly
                  class="text-3xl completioncode-cloudresearch"
                />
                <Button
                  variant="default"
                  data-clipboard-target=".completioncode-cloudresearch"
                >
                  Copy Code
                  <ClipboardCopy />
                </Button>
              </div>
            </div>
          </template>
        </TitleTwoCol>
      </div>

      <!-- Citizen Science recruitment service completion -->
      <div v-if="api.getRecruitmentService() == 'citizensci'">
        <TitleTwoCol
          left-first
          left-width="w-1/3"
          :responsive-u-i="api.config.responsiveUI"
        >
          <template #title>
            <h1 class="text-3xl font-bold mb-4">
              <SquareCheckBig class="inline mr-2" />&nbsp;Thanks, let's begin the payment process!
            </h1>
            <p class="text-lg mb-8">
              This still needs to be implemented
            </p>
          </template>
          <template #left>
            <div class="text-left text-muted-foreground">
              <h3 class="text-lg font-bold mb-2">
                Submission
              </h3>
              <p class="text-sm text-muted-foreground">
                Click the button to complete your submission.
              </p>
            </div>
          </template>
          <template #right>
            <div class="border border-border text-left bg-muted p-6 rounded-lg">
              <Button
                variant="default"
                as="a"
                :href="!api.config.anonymousMode ? 'http://gureckislab.org' : 'http://google.com'"
              >
                Submit my work
                <ArrowRight />
              </Button>
            </div>
          </template>
        </TitleTwoCol>
      </div>

      <!-- SONA (credit) recruitment service completion -->
      <div v-if="api.getRecruitmentService() == 'sona'">
        <TitleTwoCol
          left-first
          left-width="w-1/3"
          :responsive-u-i="api.config.responsiveUI"
        >
          <template #title>
            <h1 class="text-3xl font-bold mb-4">
              <SquareCheckBig class="inline mr-2" />&nbsp;Thanks, let's record your credit!
            </h1>
            <p class="text-lg mb-8">
              Please click the button below to return to SONA and receive credit for completing this study.
              We really appreciate your participation.
            </p>
          </template>
          <template #left>
            <div class="text-left text-muted-foreground">
              <h3 class="text-lg font-bold mb-2">
                Credit Assignment
              </h3>
              <p class="text-sm text-muted-foreground">
                Click the button to return to SONA and automatically receive your course credit.
              </p>
            </div>
          </template>
          <template #right>
            <div class="border border-border text-left bg-muted p-6 rounded-lg">
              <Button
                variant="default"
                as="a"
                :href="`${api.store.private.recruitmentInfo.url}/webstudy_credit.aspx?experiment_id=${api.store.private.recruitmentInfo.experimentId}&credit_token=${api.store.private.recruitmentInfo.creditToken}&survey_code=${api.store.private.recruitmentInfo.survey_code}`"
              >
                Return to SONA for credit
                <ArrowRight />
              </Button>
            </div>
          </template>
        </TitleTwoCol>
      </div>

      <!-- SONA (paid) recruitment service completion -->
      <div v-if="api.getRecruitmentService() == 'sona_paid'">
        <TitleTwoCol
          left-first
          left-width="w-1/3"
          :responsive-u-i="api.config.responsiveUI"
        >
          <template #title>
            <h1 class="text-3xl font-bold mb-4">
              <SquareCheckBig class="inline mr-2" />&nbsp;Thanks, let's begin the payment process!
            </h1>
            <p class="text-lg mb-8">
              Please click the button below to return to SONA and begin the payment process.
              Your work will be approved and payment processed shortly. We really appreciate your time.
            </p>
          </template>
          <template #left>
            <div class="text-left text-muted-foreground">
              <h3 class="text-lg font-bold mb-2">
                Payment Process
              </h3>
              <p class="text-sm text-muted-foreground">
                Click the button to return to SONA and receive your payment.
              </p>
            </div>
          </template>
          <template #right>
            <div class="border border-border text-left bg-muted p-6 rounded-lg">
              <Button
                variant="default"
                as="a"
                :href="`${api.store.private.recruitmentInfo.url}/webstudy_credit.aspx?experiment_id=${api.store.private.recruitmentInfo.experimentId}&credit_token=${api.store.private.recruitmentInfo.creditToken}&survey_code=${api.store.private.recruitmentInfo.survey_code}`"
              >
                Return to SONA for payment
                <ArrowRight />
              </Button>
            </div>
          </template>
        </TitleTwoCol>
      </div>

      <!-- SPARK recruitment service completion -->
      <div v-if="api.getRecruitmentService() == 'spark'">
        <TitleTwoCol
          left-first
          left-width="w-1/3"
          :responsive-u-i="api.config.responsiveUI"
        >
          <template #title>
            <h1 class="text-3xl font-bold mb-4">
              <SquareCheckBig class="inline mr-2" />&nbsp;Thanks for your contribution to science!
            </h1>
            <p class="text-lg mb-8">
              Please click the button below to return to SPARK and complete your session.
              We really appreciate your participation.
            </p>
          </template>
          <template #left>
            <div class="text-left text-muted-foreground">
              <h3 class="text-lg font-bold mb-2">
                Session Complete
              </h3>
              <p class="text-sm text-muted-foreground">
                Click the button to return to SPARK and finalize your session.
              </p>
            </div>
          </template>
          <template #right>
            <div class="border border-border text-left bg-muted p-6 rounded-lg">
              <Button
                variant="default"
                as="a"
                :href="`${api.store.private.recruitmentInfo.completionUrl}/${api.store.private.recruitmentInfo.subject_ID}`"
              >
                Return to SPARK
                <ArrowRight />
              </Button>
            </div>
          </template>
        </TitleTwoCol>
      </div>

      <!-- PANDA recruitment service completion -->
      <div v-if="api.getRecruitmentService() == 'panda'">
        <TitleTwoCol
          left-first
          left-width="w-1/3"
          :responsive-u-i="api.config.responsiveUI"
        >
          <template #title>
            <h1 class="text-3xl font-bold mb-4">
              <SquareCheckBig class="inline mr-2" />&nbsp;Thanks for your contribution to science!
            </h1>
            <p class="text-lg mb-8">
              Your data have been successfully recorded. You may now close this window or follow any
              additional instructions provided by the research team.
            </p>
          </template>
          <template #left>
            <div class="text-left text-muted-foreground">
              <h3 class="text-lg font-bold mb-2">
                Study Complete
              </h3>
              <p class="text-sm text-muted-foreground">
                Thank you for participating. Your contribution helps advance scientific knowledge.
              </p>
            </div>
          </template>
          <template #right>
            <div class="border border-border text-left bg-muted p-6 rounded-lg">
              <p class="text-foreground">
                You may now safely close this browser window.
              </p>
            </div>
          </template>
        </TitleTwoCol>
      </div>

      <!-- Web recruitment service completion -->
      <div v-if="api.getRecruitmentService() == 'web'">
        <TitleTwoCol
          left-first
          left-width="w-1/3"
          :responsive-u-i="api.config.responsiveUI"
        >
          <template #title>
            <h1 class="text-3xl font-bold mb-4">
              <SquareCheckBig class="inline mr-2" />&nbsp;Thanks for your contribution to science!
            </h1>
            <p class="text-lg mb-8">
              Your data have been successfully recorded and you can close this window or navigate to another page.
            </p>
          </template>
          <template #left>
            <div class="text-left text-muted-foreground">
              <h3 class="text-lg font-bold mb-2">
                Study Complete
              </h3>
              <p class="text-sm text-muted-foreground">
                Thank you for participating in our research study. Your contribution helps advance scientific knowledge.
              </p>
            </div>
          </template>
          <template #right>
            <div class="border border-border text-left bg-muted p-6 rounded-lg">
              <p class="text-foreground">
                You may now safely close this browser window.
              </p>
            </div>
          </template>
        </TitleTwoCol>
      </div>
    </div>
  </div>
</template>
