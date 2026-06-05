<!--
  Sample informed consent template — formatting reference.

  This file is NOT used by the experiment. It exists as a copy-paste
  starting point showing how a fully formatted consent body is structured
  (heading, intro paragraph, bulleted list of disclosures, signature/contact
  paragraph).

  To use it, replace the contents of `InformedConsentText.vue` with the
  template below and edit the bracketed placeholders to match your study
  and IRB-approved language.
-->
<template>
  <div class="p-3 pt-2 text-left">
    <h1 class="text-3xl font-bold">
      <i-mdi-approve class="inline-block mr-2" />Informed Consent
    </h1>
    <hr class="mt-2 mb-3 h-px">
    <p>
      You are being asked to participate in a research study. This document
      provides you with information about the study. Your participation is
      voluntary, and you may choose not to participate or withdraw at any time.
    </p>
    <ul class="pl-8 pt-3 pb-3 list-square">
      <li>
        Participation in this study will take about [estimated time] to complete,
        and you will receive [describe compensation here] for your participation.
      </li>
      <li>
        You will complete a brief computer-based task. The task involves
        [describe your task here].
      </li>
      <li>In addition, by agreeing to participate, you understand you must be 18 years or older to participate.</li>
      <li>
        There are no known risks associated with your participation in this research beyond those of everyday life.
      </li>
      <li>
        Confidentiality of your research records will be strictly maintained. We assign code numbers to each participant
        so that data is never directly linked to individual identity, and we are interested in group results rather than
        the responses of particular individuals.
      </li>
      <li>
        Taking part in this study is voluntary. Not taking part or withdrawing after the study has begun will result in
        no penalty. You have the right to skip or not answer any questions you prefer not to answer.
      </li>
    </ul>
    <p>
      If there is anything about the study or your participation that is unclear or that you do not understand, if you
      have questions or wish to report a research-related problem, you may contact the principal investigator,
      [your name] at [your address],
      [your email].
    </p>
  </div>
</template>

<style scoped>
/* Ensure list bullets are visible */
ul {
  list-style-type: square;
  padding-left: 2rem;
}

li {
  margin-bottom: 0.5rem;
}
</style>
