<script setup>
/**
 * ThanksView Component
 *
 * Displays completion/thanks page with different layouts based on recruitment service.
 * Handles completion code generation and clipboard functionality for various platforms.
 * Shows an upload progress animation before displaying the final thanks message.
 */

// External library imports
import * as _Clipboard from 'clipboard'
// Vue imports
import { onMounted, ref } from 'vue'

// Internal imports
const Clipboard = _Clipboard.default || _Clipboard

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
 * On first visit, the code is computed immediately but only persisted to the cookie
 * after saveData succeeds (so the cookie acts as proof that data was saved).
 */
const completionCode = ref(
  alreadyCompleted ? api.store.cookieState.completionCode : api.computeCompletionCode(),
)

/**
 * Initialize clipboard functionality and run upload animation
 * Sets up clipboard.js to handle copy-to-clipboard actions
 * Animates the progress bar over 20 seconds before showing thanks content
 */
onMounted(() => {
  // Set up clipboard functionality
  const clipboard = new Clipboard('[data-clipboard-target]')
  clipboard.on('success', (e) => {
    api.log.debug(`code copied to clipboard ${e.trigger.id}`)
  })

  // Skip upload animation and save if already completed
  if (alreadyCompleted) return

  // Save data, then show a brief completion animation
  // The progress bar animates to ~80% quickly, then jumps to 100% once save completes.
  let saveComplete = false
  const minDisplayTime = 2000 // show upload screen for at least 2 seconds
  const mountTime = Date.now()

  // Start the save immediately (no delay)
  Promise.resolve(api.saveData(true)).then(() => {
    api.setCompletionCode(completionCode.value)
    saveComplete = true
  }).catch(() => {
    // Even on error, proceed to thanks screen
    saveComplete = true
  })

  const updateProgress = () => {
    const elapsed = Date.now() - mountTime

    if (saveComplete && elapsed >= minDisplayTime) {
      // Save is done and minimum display time met — finish up
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
      <!-- Prolific recruitment service completion -->
      <div v-if="api.getRecruitmentService() == 'prolific'">
        <TitleTwoCol
          left-first
          left-width="w-1/3"
          :responsive-u-i="api.config.responsiveUI"
        >
          <template #title>
            <h1 class="text-3xl font-bold mb-4">
              <i-fa6-solid-square-check class="inline mr-2" />&nbsp;Thanks, let's begin the payment process!
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
                :href="`https://app.prolific.co/submissions/complete?cc=${completionCode}`"
              >
                Submit my work to Prolific
                <i-fa6-solid-arrow-right />
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
              <i-fa6-solid-square-check class="inline mr-2" />&nbsp;Thanks, let's begin the payment process!
            </h1>
            <p class="text-lg mb-8">
              Please copy the code displayed below (or click the button) and paste it into the Mechanical Turk window to
              begin the process of payment. Your work will be approved within several hours and any performance related
              bonuses will be assigned at that time. We really appreciate your time.
            </p>
          </template>
          <template #left>
            <div class="text-left text-muted-foreground">
              <h3 class="text-lg font-bold mb-2">
                Completion Code
              </h3>
              <p class="text-sm text-muted-foreground">
                Copy this unique code and paste it into the Mechanical Turk submission form.
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
                  <i-fa6-solid-clipboard />
                </Button>
              </div>
            </div>
          </template>
        </TitleTwoCol>
      </div>

      <!-- MTurk recruitment service completion -->
      <div v-if="api.getRecruitmentService() == 'mturk'">
        <TitleTwoCol
          left-first
          left-width="w-1/3"
          :responsive-u-i="api.config.responsiveUI"
        >
          <template #title>
            <h1 class="text-3xl font-bold mb-4">
              <i-fa6-solid-square-check class="inline mr-2" />&nbsp;Thanks, let's begin the payment process!
            </h1>
            <p class="text-lg mb-8">
              Please verify the code displayed below is visible in the form on the Mechanical Turk website. If it is not
              click the button to copy it to your clipboard and paste it into the Mechanical Turk window to begin the
              process of payment. Your work will be approved within several hours and any performance related bonuses
              will be assigned at that time. We really appreciate your time.
            </p>
          </template>
          <template #left>
            <div class="text-left text-muted-foreground">
              <h3 class="text-lg font-bold mb-2">
                Completion Code
              </h3>
              <p class="text-sm text-muted-foreground">
                Verify this code appears in your Mechanical Turk submission form, or copy it manually.
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
                  class="text-2xl completioncode-mturk"
                />
                <Button
                  variant="default"
                  data-clipboard-target=".completioncode-mturk"
                >
                  Copy Code
                  <i-fa6-solid-clipboard />
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
              <i-fa6-solid-square-check class="inline mr-2" />&nbsp;Thanks, let's begin the payment process!
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
                <i-fa6-solid-arrow-right />
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
              <i-fa6-solid-square-check class="inline mr-2" />&nbsp;Thanks, let's record your credit!
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
                :href="`${api.config.sona.url}/webstudy_credit.aspx?experiment_id=${api.config.sona.experimentId}&credit_token=${api.config.sona.creditToken}&survey_code=${api.store.private.recruitmentInfo.survey_code}`"
              >
                Return to SONA for credit
                <i-fa6-solid-arrow-right />
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
              <i-fa6-solid-square-check class="inline mr-2" />&nbsp;Thanks, let's begin the payment process!
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
                :href="`${api.config.sonaPaid.url}/webstudy_credit.aspx?experiment_id=${api.config.sonaPaid.experimentId}&credit_token=${api.config.sonaPaid.creditToken}&survey_code=${api.store.private.recruitmentInfo.survey_code}`"
              >
                Return to SONA for payment
                <i-fa6-solid-arrow-right />
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
              <i-fa6-solid-square-check class="inline mr-2" />&nbsp;Thanks for your contribution to science!
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
                :href="`${api.config.spark.completionUrl}/${api.store.private.recruitmentInfo.subject_ID}`"
              >
                Return to SPARK
                <i-fa6-solid-arrow-right />
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
              <i-fa6-solid-square-check class="inline mr-2" />&nbsp;Thanks for your contribution to science!
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
              <i-fa6-solid-square-check class="inline mr-2" />&nbsp;Thanks for your contribution to science!
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
