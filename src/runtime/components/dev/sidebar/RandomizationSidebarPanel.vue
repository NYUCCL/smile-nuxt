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

/**
 * Gets the appropriate branch type character for tree display
 * @param {number} index - The current index in the list
 * @param {number} total - The total number of items
 * @returns {string} The branch type character
 */
const getBranchType = (index, total) => {
  if (total === 1) {
    return '── '
  }
  else if (index === 0) {
    return '┌─ '
  }
  else if (index === total - 1) {
    return '└─ '
  }
  else {
    return '├─ '
  }
}
</script>

<template>
  <TooltipProvider>
    <!-- Main container -->
    <div class="h-fit p-0 m-0">
      <!-- Random seed section header -->
      <div
        class="text-xs text-muted-foreground font-mono text-left bg-muted px-2 py-1.5 m-0 border-t border-b border-dev-lines"
      >
        Random seed
      </div>

      <!-- Random seed configuration section -->
      <div class="bg-background pb-5 border-b border-dev-lines">
        <div class="text-xs m-2">
          Toggle to use a fixed seed (off means uses the current time as seed). A specific seed can be set in the input
          field. Press the arrow to reload the view with the new seed.
        </div>

        <div class="mt-0 p-0 z-50 mx-4">
          <div class="grid grid-cols-2 gap-3">
            <!-- Fixed seed toggle row -->
            <div class="col-span-2 flex items-center gap-2">
              <label class="text-xs font-mono">Fixed seed:</label>
              <Tooltip>
                <TooltipTrigger>
                  <Switch
                    :model-value="smilestore.localState.useSeed"
                    @update:model-value="smilestore.localState.useSeed = $event"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Use fixed seed</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <!-- Seed input and update button row -->
            <div class="flex-1">
              <Input
                v-model="seed"
                type="text"
                placeholder="Current seed"
                :class="{ 'opacity-50 pointer-events-none': !smilestore.localState.useSeed }"
              />
            </div>
            <Button
              :disabled="!smilestore.localState.useSeed"
              size="sm"
              variant="outline"
              class="font-mono text-xs"
              @click="set_seed"
            >
              Update seed
            </Button>
          </div>
        </div>
      </div>

      <!-- Random variables section -->
      <div
        v-if="
          smilestore.localState.possibleConditions
            && Object.keys(smilestore.localState.possibleConditions).length > 0
        "
        class="subsection"
      >
        <!-- Random variables header -->
        <div
          class="text-xs text-left font-mono bg-muted text-muted-foreground px-2 py-1.5 m-0 border-t border-b border-dev-lines"
        >
          Random Variables
        </div>

        <!-- Random variables configuration -->
        <div class="bg-background">
          <div class="text-xs m-2">
            Use these dropdowns to force specific values for each variable (see design.js). By default these are choosen
            randomly based on the seed.
          </div>

          <!-- Variables list -->
          <div class="relative m-0 p-0 pt-1.5 mb-3 mt-2">
            <ul class="list-none p-0 m-0 text-left ml-1.5 pb-2">
              <template
                v-for="(value, key, index) in smilestore.localState.possibleConditions"
                :key="key"
              >
                <li class="flex items-center mb-0 ml-0.5 mt-1">
                  <span class="font-mono text-sm text-muted-foreground whitespace-pre mr-0">{{
                    getBranchType(index, Object.keys(smilestore.localState.possibleConditions).length)
                  }}</span>
                  <Select
                    :model-value="selected[key]"
                    @update:model-value="(val) => changeCond(key, val)"
                  >
                    <SelectTrigger class="h-7 text-[0.65rem] py-1 px-3 font-mono">
                      <SelectValue :placeholder="`${key}: ${selected[key]}`" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="cond in value"
                        :key="cond"
                        :value="cond"
                      >
                        {{ key }}: {{ cond }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </li>
              </template>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </TooltipProvider>
</template>
