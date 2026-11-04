<script setup>
import { ref, watch } from 'vue'
import useSmileStore from '../../../stores/smilestore'
import useAPI from '../../../composables/useAPI'

const api = useAPI()

/**
 * Global Smile store instance
 * @type {import('@/core/stores/smilestore')}
 */
const smilestore = useSmileStore()

/**
 * Current seed value for randomization
 * @type {import('vue').Ref<string>}
 */
const seed = ref(smilestore.getSeedID)

/**
 * Sets the current seed and reloads the page to apply changes
 */
function set_seed() {
  // seed.value = uuidv4()
  // seed = smilestore.randomizeSeed()
  api.log.debug('Setting seed to ', seed.value)
  smilestore.setSeedID(seed.value)
  // Force a reload to resample conditions and variables
  window.location.reload()
}

/**
 * Selected conditions from the store
 * @type {object}
 */
const selected = smilestore.getConditions

/**
 * Changes a condition value and reloads the page to apply changes
 * @param {string} key - The condition key to change
 * @param {*} value - The new value for the condition
 */
function changeCond(key, value) {
  smilestore.setCondition(key, value)
  // Force a reload to resample conditions and variables
  window.location.reload()
}

/**
 * Watches for changes in store conditions and updates the selected conditions
 */
watch(
  () => smilestore.data.conditions,
  async (newConds) => {
    // for each key in newConds, update that entry in conditions
    Object.keys(newConds).forEach((key) => {
      selected[key] = newConds[key]
    })
  },
)
</script>

<template>
  <TooltipProvider>
    <div>
      <!-- Random seed -->
      <div class="sd-section">
        Random seed
      </div>
      <div class="sd-random-body">
        <p class="sd-help">
          With a fixed seed, every reload draws the same random values. Off, the
          seed comes from the current time. Change the seed and press Update to
          reload with it.
        </p>
        <label class="flex items-center gap-2 cursor-pointer">
          <Switch
            :model-value="smilestore.localState.useSeed"
            @update:model-value="smilestore.localState.useSeed = $event"
          />
          <span class="sd-label">Fixed seed</span>
        </label>
        <div class="flex items-center gap-2">
          <Input
            v-model="seed"
            type="text"
            placeholder="Current seed"
            class="sd-field sd-mono flex-1 min-w-0"
            :disabled="!smilestore.localState.useSeed"
          />
          <Button
            :disabled="!smilestore.localState.useSeed"
            variant="panel"
            class="sd-field px-2.5"
            @click="set_seed"
          >
            Update
          </Button>
        </div>
      </div>

      <!-- Random variables -->
      <template
        v-if="
          smilestore.localState.possibleConditions
            && Object.keys(smilestore.localState.possibleConditions).length > 0
        "
      >
        <div class="sd-section">
          Random variables
        </div>
        <div class="sd-random-body">
          <p class="sd-help">
            Force a value for any random variable (from design.js). Unset, each is
            drawn from the seed.
          </p>
          <ul class="sd-random-vars">
            <li
              v-for="(value, key) in smilestore.localState.possibleConditions"
              :key="key"
            >
              <span class="sd-mono sd-random-name">{{ key }}</span>
              <Select
                :model-value="selected[key]"
                @update:model-value="(val) => changeCond(key, val)"
              >
                <SelectTrigger class="sd-field sd-mono min-w-24">
                  <SelectValue :placeholder="String(selected[key])" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="cond in value"
                    :key="cond"
                    :value="cond"
                  >
                    {{ cond }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </TooltipProvider>
</template>

<style scoped>
.sd-random-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 14px;
}

.sd-random-vars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sd-random-vars li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sd-random-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
