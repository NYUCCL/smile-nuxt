<script setup>
/**
 * A number field for the dev tools with its own up/down buttons. The
 * browser's spinners can't take the dev palette's colors (only light/dark via
 * color-scheme), so they're hidden and these follow the theme. Arrow keys
 * still step the value.
 */
import { ChevronDown, ChevronUp } from 'lucide-vue-next'

const model = defineModel({ type: [Number, String], default: 0 })
const props = defineProps({
  step: { type: Number, default: 1 },
  min: { type: Number, default: 0 },
  label: { type: String, default: '' },
})

function bump(direction) {
  const current = Number(model.value) || 0
  model.value = Math.max(props.min, current + direction * props.step)
}
</script>

<template>
  <div class="sd-number">
    <input
      v-model.number="model"
      type="number"
      :step="step"
      :min="min"
      :aria-label="label || undefined"
      class="sd-number-input sd-mono"
    >
    <span class="sd-number-steps">
      <button
        type="button"
        tabindex="-1"
        :aria-label="`Increase${label ? ` ${label}` : ''}`"
        @click="bump(1)"
      >
        <ChevronUp />
      </button>
      <button
        type="button"
        tabindex="-1"
        :aria-label="`Decrease${label ? ` ${label}` : ''}`"
        @click="bump(-1)"
      >
        <ChevronDown />
      </button>
    </span>
  </div>
</template>

<style scoped>
.sd-number {
  display: inline-flex;
  align-items: stretch;
  height: var(--sd-control-h);
  border: 1px solid var(--sd-line);
  border-radius: var(--sd-radius);
  background-color: var(--sd-bg);
  overflow: hidden;
}

.sd-number:focus-within {
  border-color: var(--sd-accent);
}

.sd-number-input {
  width: 3.75rem;
  min-width: 0;
  padding: 0 0.375rem;
  font-size: var(--sd-font-sm);
  color: var(--sd-text);
  background: transparent;
  border: 0;
  outline: none;
  appearance: textfield;
  -moz-appearance: textfield;
}

.sd-number-input::-webkit-inner-spin-button,
.sd-number-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.sd-number-steps {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--sd-line);
}

.sd-number-steps button {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  width: 1rem;
  color: var(--sd-text-muted);
  background-color: var(--sd-chrome);
  cursor: pointer;
}

.sd-number-steps button + button {
  border-top: 1px solid var(--sd-line);
}

.sd-number-steps button:hover {
  color: var(--sd-text);
  background-color: var(--sd-hover);
}

.sd-number-steps svg {
  width: 10px;
  height: 10px;
}
</style>
