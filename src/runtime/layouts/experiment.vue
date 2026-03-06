<template>
  <div class="@container bg-background text-foreground experiment-container flex flex-col h-screen">
    <ClientOnly>
      <ExperimentStatusBar />
    </ClientOnly>
    <div class="flex-1 min-h-0">
      <slot />
    </div>
  </div>
</template>
