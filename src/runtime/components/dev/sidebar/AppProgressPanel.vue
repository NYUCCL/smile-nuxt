<script setup>
import { CloudUpload, Database, UserMinus } from 'lucide-vue-next'
import useAPI from '../../../composables/useAPI'

const api = useAPI()
</script>

<template>
  <!-- App progress stepper panel -->
  <Stepper class="flex w-full items-start gap-2 my-0 pt-4 pb-2 border-t border-sd-line">
    <!-- Step 1: User known/unknown -->
    <StepperItem
      class="relative flex w-full flex-col items-center justify-center"
      :step="1"
    >
      <StepperSeparator
        class="absolute left-[calc(50%+20px)] right-[calc(-50%+10px)] top-5 block h-0.5 shrink-0 rounded-full bg-muted"
        :class="[api.store.cookieState.knownUser ? 'bg-sd-ok' : '']"
      />

      <StepperTrigger as-child>
        <div
          class="z-10 rounded-full shrink-0 p-3"
          :class="[api.store.cookieState.knownUser ? 'bg-sd-ok-bg' : 'bg-muted']"
        >
          <UserMinus
            :class="[api.store.cookieState.knownUser ? 'text-sd-ok' : 'text-muted-foreground']"
          />
        </div>
      </StepperTrigger>

      <div class="flex flex-col items-center text-center">
        <StepperDescription
          :class="[api.store.cookieState.knownUser ? 'text-sd-ok' : 'text-muted-foreground']"
          class="text-[0.6rem] text-muted-foreground transition font-mono"
        >
          {{ api.store.cookieState.knownUser ? 'Known user' : 'Unknown user' }}
        </StepperDescription>
      </div>
    </StepperItem>

    <!-- Step 2: Record created -->
    <StepperItem
      class="relative flex w-full flex-col items-center justify-center"
      :step="2"
    >
      <StepperSeparator
        class="absolute left-[calc(50%+20px)] right-[calc(-50%+10px)] top-5 block h-0.5 shrink-0 rounded-full bg-muted"
        :class="[
          api.store.browserEphemeral.dataLoaded && !api.store.browserEphemeral.unsavedChanges
            ? 'bg-sd-ok'
            : api.store.browserEphemeral.dataLoaded && api.store.browserEphemeral.unsavedChanges
              ? 'bg-sd-warn'
              : '',
        ]"
      />

      <StepperTrigger as-child>
        <div
          class="z-10 rounded-full shrink-0 p-3 cursor-pointer"
          :class="[api.store.browserEphemeral.dataLoaded ? 'bg-sd-ok-bg' : 'bg-muted']"
          @click="api.connectDB()"
        >
          <Database :class="[api.store.browserEphemeral.dataLoaded ? 'text-sd-ok' : 'text-muted-foreground']" />
        </div>
      </StepperTrigger>

      <div class="flex flex-col items-center text-center">
        <StepperDescription
          :class="[api.store.browserEphemeral.dataLoaded ? 'text-sd-ok' : 'text-muted-foreground']"
          class="text-[0.6rem] text-muted-foreground transition font-mono"
        >
          {{ api.store.browserEphemeral.dataLoaded ? 'Record created' : 'No record yet' }}
        </StepperDescription>
      </div>
    </StepperItem>

    <!-- Step 3: Sync status -->
    <StepperItem
      class="relative flex w-full flex-col items-center justify-center"
      :step="3"
    >
      <StepperTrigger as-child>
        <div
          class="z-10 rounded-full shrink-0 p-3"
          :class="[
            api.store.browserEphemeral.dataLoaded && !api.store.browserEphemeral.unsavedChanges
              ? 'bg-sd-ok-bg'
              : api.store.browserEphemeral.dataLoaded && api.store.browserEphemeral.unsavedChanges
                ? 'bg-sd-warn-bg'
                : 'bg-muted',
          ]"
        >
          <CloudUpload
            :class="[
              api.store.browserEphemeral.dataLoaded && !api.store.browserEphemeral.unsavedChanges
                ? 'text-sd-ok'
                : api.store.browserEphemeral.dataLoaded && api.store.browserEphemeral.unsavedChanges
                  ? 'text-sd-warn'
                  : 'text-muted-foreground',
            ]"
          />
        </div>
      </StepperTrigger>

      <div class="flex flex-col items-center text-center">
        <StepperDescription
          :class="[
            api.store.browserEphemeral.dataLoaded && !api.store.browserEphemeral.unsavedChanges
              ? 'text-sd-ok'
              : api.store.browserEphemeral.dataLoaded && api.store.browserEphemeral.unsavedChanges
                ? 'text-sd-error'
                : 'text-muted-foreground',
          ]"
          class="text-[0.6rem] text-muted-foreground transition font-mono"
        >
          {{
            !api.store.browserEphemeral.dataLoaded
              ? 'Never saved'
              : api.store.browserEphemeral.unsavedChanges
                ? 'Unsaved changes'
                : 'Saved'
          }}
        </StepperDescription>
      </div>
    </StepperItem>
  </Stepper>
</template>
