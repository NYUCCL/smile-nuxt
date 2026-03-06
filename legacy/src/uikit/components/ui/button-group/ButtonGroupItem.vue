<script setup>
import { reactiveOmit } from '@vueuse/core'
import { useForwardProps } from 'reka-ui'
import { inject } from 'vue'
import { cn } from '@/uikit/lib/utils'
import { buttonVariants } from '@/uikit/components/ui/button'

const props = defineProps({
  disabled: { type: Boolean, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false, default: 'button' },
  class: { type: null, required: false },
  variant: { type: null, required: false },
  size: { type: null, required: false },
})

const context = inject('buttonGroup')

const delegatedProps = reactiveOmit(props, 'class', 'size', 'variant')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <button
    data-slot="button-group-item"
    :data-variant="context?.variant || variant"
    :data-size="context?.size || size"
    v-bind="forwardedProps"
    :class="
      cn(
        buttonVariants({
          variant: context?.variant || variant,
          size: context?.size || size,
        }),
        `px-2 flex-1 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 border-l-0 first:border-l [&_svg:not([class*='size-'])]:size-3.5`,
        props.class
      )
    "
  >
    <slot />
  </button>
</template>
