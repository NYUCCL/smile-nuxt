<script setup>
import { reactiveOmit } from '@vueuse/core'
import { StepperItem, useForwardProps } from 'reka-ui'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/uikit/components/ui/tooltip'
import { cn } from '@/uikit/lib/utils'

const props = defineProps({
  step: { type: Number, required: true },
  disabled: { type: Boolean, required: false },
  completed: { type: Boolean, required: false },
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
        <StepperItem
          v-slot="slotProps"
          v-bind="forwarded"
          :class="cn('flex items-center gap-2 group data-[disabled]:pointer-events-none', props.class)"
        >
          <slot v-bind="slotProps" />
        </StepperItem>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {{ tooltip }}
      </TooltipContent>
    </Tooltip>
    <StepperItem
      v-else
      v-slot="slotProps"
      v-bind="forwarded"
      :class="cn('flex items-center gap-2 group data-[disabled]:pointer-events-none', props.class)"
    >
      <slot v-bind="slotProps" />
    </StepperItem>
  </TooltipProvider>
</template>
