<script setup>
import { computed } from 'vue'
import { ArrowRight, ArrowUpRight } from 'lucide-vue-next'
import useAPI from '../../composables/useAPI'

const api = useAPI()

const props = defineProps({
  title: {
    type: String,
    default: 'This is my default title for a project',
  },
  subtitle: {
    type: String,
    default: 'This is a subtitle for my project which makes it seem interesting and relevant to a wide audience.',
  },
  siteAuthor: {
    type: Object,
    default: () => ({
      name: 'Todd Gureckis',
      link: 'https://gureckislab.org',
    }),
  },
  projectAuthors: {
    type: Array,
    default: () => [
      {
        name: 'Todd Gureckis',
        link: 'https://todd.gureckislab.org',
        affiliation: 'New York University',
      },
    ],
  },
  info: {
    type: Array,
    default: () => [],
  },
  description: {
    type: [String, Array],
    default: () => [
      'This is a description of this project. Presentation mode is a nice way to share the experiment with the world.',
      'Use the links below to navigate to different parts of the experiment, or use the navigation bar at the top of the page.',
    ],
  },
  sections: {
    type: Array,
    default: () => [
      {
        title: 'Start from beginning',
        description: 'Start the experiment from the very beginning as if you were a real participant. Your data will not be saved.',
        label: 'Start',
        view: 'welcome_anonymous',
      },
    ],
  },
})

const descriptionParagraphs = computed(() => {
  if (typeof props.description === 'string') return [props.description]
  return props.description
})

const uniqueAffiliations = computed(() => {
  const affiliations = props.projectAuthors.flatMap(author =>
    Array.isArray(author.affiliation) ? author.affiliation : [author.affiliation],
  )
  return [...new Set(affiliations)]
})

function getUniqueAffiliations(affiliation) {
  return Array.isArray(affiliation) ? affiliation : [affiliation]
}

function getAffiliationIndex(affiliation) {
  return uniqueAffiliations.value.indexOf(affiliation) + 1
}

function goToSection(section) {
  if (section.href) {
    window.location.href = section.href
  }
  else if (section.view) {
    api.goToView(section.view)
  }
}
</script>

<template>
  <div class="min-h-full flex flex-col bg-background text-foreground">
    <!-- Header: title, subtitle, authors -->
    <header class="relative shrink-0 overflow-hidden border-b">
      <!-- a soft dot grid that fades out toward the bottom -->
      <div
        aria-hidden="true"
        class="presentation-dots absolute inset-0 pointer-events-none"
      />
      <div class="relative max-w-4xl mx-auto px-6 pt-16 pb-12">
        <p class="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground mb-6">
          <span class="size-1.5 rounded-full bg-foreground/60" />
          Online experiment
        </p>
        <h1 class="text-4xl md:text-5xl font-semibold tracking-tight leading-tight mb-4">
          {{ title }}
        </h1>
        <p class="text-lg text-muted-foreground leading-relaxed max-w-2xl">
          {{ subtitle }}
        </p>

        <div class="mt-10 grid grid-cols-1 sm:grid-cols-12 gap-x-8 gap-y-6 text-sm">
          <!-- Authors -->
          <div class="sm:col-span-4">
            <h2 class="presentation-label">
              Authors
            </h2>
            <ul class="space-y-1">
              <li
                v-for="(author, index) in projectAuthors"
                :key="index"
              >
                <a
                  v-if="author.link"
                  :href="author.link"
                  class="font-medium underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ author.name }}</a>
                <span
                  v-else
                  class="font-medium"
                >{{ author.name }}</span>
                <sup class="text-muted-foreground ml-0.5">
                  <template
                    v-for="(aff, affIndex) in getUniqueAffiliations(author.affiliation)"
                    :key="affIndex"
                  >
                    {{ getAffiliationIndex(aff)
                    }}{{ affIndex < getUniqueAffiliations(author.affiliation).length - 1 ? ',' : '' }}
                  </template>
                </sup>
              </li>
            </ul>
          </div>

          <!-- Affiliations -->
          <div class="sm:col-span-4">
            <h2 class="presentation-label">
              Affiliations
            </h2>
            <ul class="space-y-1 text-muted-foreground">
              <li
                v-for="(aff, index) in uniqueAffiliations"
                :key="index"
              >
                <sup>{{ index + 1 }}</sup>&nbsp;{{ aff }}
              </li>
            </ul>
          </div>

          <!-- Project info (paper, code, data …) -->
          <div
            v-if="info.length"
            class="sm:col-span-4 space-y-4"
          >
            <div
              v-for="item in info"
              :key="item.title"
            >
              <h2 class="presentation-label">
                {{ item.title }}
              </h2>
              <a
                v-if="item.link"
                :href="item.link"
                class="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ item.data }}
                <ArrowUpRight class="size-3.5 text-muted-foreground" />
              </a>
              <span v-else>{{ item.data }}</span>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="max-w-4xl w-full mx-auto px-6 py-12 flex-1 shrink-0">
      <!-- Project description -->
      <div class="max-w-2xl space-y-4 mb-12">
        <p
          v-for="(paragraph, index) in descriptionParagraphs"
          :key="index"
          class="text-base text-foreground/80 leading-relaxed"
        >
          {{ paragraph }}
        </p>
      </div>

      <!-- Places to jump into the experiment -->
      <h2 class="presentation-label mb-4">
        Explore the experiment
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          v-for="(section, index) in sections"
          :key="index"
          type="button"
          class="presentation-card group bg-muted/70 dark:bg-card"
          :class="{ 'md:col-span-2': index === 0 && sections.length % 2 === 1 }"
          @click="goToSection(section)"
        >
          <span class="text-xs font-medium tabular-nums text-muted-foreground">
            {{ String(index + 1).padStart(2, '0') }}
          </span>
          <span class="mt-2 block text-base font-semibold">
            {{ section.title }}
          </span>
          <span
            v-if="section.description"
            class="mt-1 block text-sm text-muted-foreground leading-relaxed"
          >
            {{ section.description }}
          </span>
          <span
            class="mt-4 inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-sm font-medium transition-colors"
            :class="index === 0
              ? 'bg-primary text-primary-foreground group-hover:bg-primary/90'
              : 'border border-foreground/20 group-hover:bg-foreground/5'"
          >
            {{ section.label || section.title }}
            <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>
    </main>

    <!-- Footer -->
    <footer class="shrink-0 border-t">
      <div class="max-w-4xl mx-auto px-6 py-8 text-sm text-muted-foreground">
        Created by
        <a
          :href="siteAuthor.link"
          class="font-medium text-foreground underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >{{ siteAuthor.name }}</a>
        using
        <a
          href="https://smile.gureckislab.org"
          class="font-medium text-foreground underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >Smile</a>.
      </div>
    </footer>
  </div>
</template>

<style scoped>
.presentation-label {
  margin-bottom: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}

.presentation-dots {
  background-color: color-mix(in oklab, var(--muted) 60%, transparent);
  background-image: radial-gradient(color-mix(in oklab, var(--foreground) 18%, transparent) 1px, transparent 1px);
  background-size: 18px 18px;
    mask-image: linear-gradient(to bottom, black 30%, transparent);
}

.presentation-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  padding: 1.25rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  color: var(--card-foreground);
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
}

.presentation-card:hover {
  border-color: color-mix(in oklab, var(--foreground) 25%, var(--border));
}

.presentation-card:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
</style>
