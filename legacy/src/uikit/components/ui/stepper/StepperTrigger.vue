<script setup>
import { reactiveOmit } from '@vueuse/core'
import { StepperTrigger, useForwardProps } from 'reka-ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/uikit/components/ui/tooltip'
import { cn } from '@/uikit/lib/utils'

const props = defineProps({
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: { type: null, required: false },
  tooltip: { type: String, required: false },
})

const delegatedProps = reactiveOmit(props, 'class', 'tooltip')

const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <TooltipProvider>
    <Tooltip v-if="tooltip">
      <TooltipTrigger asChild>
        <StepperTrigger
          v-bind="forwarded"
          :class="cn('p-1 flex flex-col items-center text-center gap-1 rounded-md', props.class)"
        >
          <slot />
        </StepperTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {{ tooltip }}
      </TooltipContent>
    </Tooltip>
    <StepperTrigger
      v-else
      v-bind="forwarded"
      :class="cn('p-1 flex flex-col items-center text-center gap-1 rounded-md', props.class)"
    >
      <slot />
    </StepperTrigger>
  </TooltipProvider>
</template>
