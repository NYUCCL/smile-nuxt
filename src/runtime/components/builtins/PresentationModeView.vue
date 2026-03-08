<script setup>
import { computed } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
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
  <div class="min-h-screen bg-background">
    <!-- Header Section -->
    <header class="bg-muted/50 border-b py-6">
      <div class="w-2/3 mx-auto px-6 py-8">
        <h1 class="text-5xl font-bold text-foreground mb-4 leading-tight">
          {{ title }}
        </h1>
        <p class="text-2xl text-muted-foreground leading-relaxed">
          {{ subtitle }}
        </p>
      </div>
    </header>

    <!-- Author Information Section -->
    <section class="border-b bg-background">
      <div class="w-2/3 mx-auto px-6 py-8">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-8">
          <!-- Authors -->
          <div class="md:col-span-2">
            <h3 class="text-[0.65rem] font-extralight uppercase tracking-widest text-muted-foreground mb-4">
              Authors
            </h3>
            <div class="space-y-2">
              <div
                v-for="(author, index) in projectAuthors"
                :key="index"
                class="text-[0.9rem]"
              >
                <template v-if="author.link">
                  <a
                    :href="author.link"
                    class="text-foreground hover:text-primary transition-colors font-medium"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ author.name }}
                  </a>
                </template>
                <template v-else>
                  <span class="text-foreground font-medium">{{ author.name }}</span>
                </template>
                <sup class="text-xs text-muted-foreground">
                  <template
                    v-for="(aff, affIndex) in getUniqueAffiliations(author.affiliation)"
                    :key="affIndex"
                  >
                    {{ getAffiliationIndex(aff)
                    }}{{ affIndex < getUniqueAffiliations(author.affiliation).length - 1 ? ',' : '' }}
                  </template>
                </sup>
              </div>
            </div>
          </div>

          <!-- Affiliations -->
          <div class="md:col-span-3">
            <h3 class="text-[0.65rem] font-extralight uppercase tracking-widest text-muted-foreground mb-4">
              Affiliations
            </h3>
            <div class="space-y-3">
              <div
                v-for="(aff, index) in uniqueAffiliations"
                :key="index"
                class="text-[0.9rem]"
              >
                <sup class="text-xs">{{ index + 1 }}</sup>&nbsp;{{ aff }}
              </div>
            </div>
          </div>

          <!-- Project Info -->
          <div
            v-if="info.length"
            class="md:col-span-4 md:col-start-9"
          >
            <div class="space-y-4">
              <div
                v-for="item in info"
                :key="item.title"
              >
                <h3 class="text-[0.65rem] font-extralight uppercase tracking-widest text-muted-foreground mb-2">
                  {{ item.title }}
                </h3>
                <div class="text-[0.9rem]">
                  <a
                    v-if="item.link"
                    :href="item.link"
                    class="text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ item.data }}
                  </a>
                  <span
                    v-else
                    class="text-foreground"
                  >{{ item.data }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Main Content -->
    <main class="w-2/3 mx-auto px-6 py-12">
      <!-- Project Description -->
      <div class="prose prose-gray max-w-none mb-12">
        <p
          v-for="(paragraph, index) in descriptionParagraphs"
          :key="index"
          class="text-lg text-muted-foreground leading-relaxed mb-4"
        >
          {{ paragraph }}
        </p>
      </div>

      <Separator class="my-8" />

      <!-- Navigation Sections -->
      <div class="space-y-8">
        <template
          v-for="(section, index) in sections"
          :key="index"
        >
          <div>
            <h3 class="text-xl font-semibold text-foreground mb-3">
              {{ section.title }}
            </h3>
            <p
              v-if="section.description"
              class="text-lg text-muted-foreground mb-4"
            >
              {{ section.description }}
            </p>
            <Button
              size="sm"
              @click="goToSection(section)"
            >
              {{ section.label || section.title }}
              <ArrowRight class="w-4 h-4 ml-2 inline" />
            </Button>
          </div>
          <Separator v-if="index < sections.length - 1" />
        </template>
      </div>
    </main>

    <!-- Footer -->
    <footer class="bg-muted/50 border-t mt-16">
      <div class="w-2/3 mx-auto px-6 py-8 text-center">
        <p class="text-sm text-muted-foreground">
          Created by
          <a
            :href="siteAuthor.link"
            class="text-primary hover:text-primary/80 transition-colors font-medium"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ siteAuthor.name }}
          </a>
          using
          <a
            href="https://smile.gureckislab.org"
            class="text-primary hover:text-primary/80 transition-colors font-medium"
            target="_blank"
            rel="noopener noreferrer"
          >
            SMILE</a>.
        </p>
      </div>
    </footer>
  </div>
</template>
