<!--
  Sample informed consent template — formatting reference.

  This file is NOT used by the experiment. It exists as a copy-paste
  starting point showing how a fully formatted consent body is structured
  (heading, intro paragraph, bulleted list of disclosures, signature/contact
  paragraph).

  To use it, replace the contents of `InformedConsentText.vue` with the
  template below and edit the specifics to match your study and IRB-approved
  language.
-->
<template>
  <div class="p-3 pt-2 text-left">
    <h1 class="text-3xl font-bold">
      <i-mdi-approve class="inline-block mr-2" />Informed Consent
    </h1>
    <hr class="mt-2 mb-3 h-px">
    <p>
      If you agree to be in this study, you will be asked to look at pictures of objects or pictures presented on a
      computer display, watch videos, listen to sounds, or observe lights controlled by the computer and to make
      judgments about them using a keyboard, mouse, or other input device attached to a computer.
    </p>
    <ul class="pl-8 pt-3 pb-3 list-square">
      <li>
        Participation in this study will take about 30 minutes to complete, and you will receive $4.50 for your
        participation. As an additional incentive to try your best at the task, you may earn a cash bonus of up to
        $10.00 based on your performance.
      </li>
      <li>When you complete the study, a thorough verbal and written explanation of it will be provided.</li>
      <li>In addition, by agreeing to participate, you understand you must be 18 years or older to participate.</li>
      <li>
        There are no known risks associated with your participation in this research beyond those of everyday life.
        Although you will receive no direct benefits, this research may help the investigator understand how people
        learn new categories.
      </li>
      <li>
        Confidentiality of your research records will be strictly maintained. We assign code numbers to each participant
        so that data is never directly linked to individual identity, and we are interested in group results rather than
        the responses of particular individuals. Any emails will never be shared with anyone nor linked to your data.
        Data are kept in our laboratory and are only viewed by the investigators. These data files are kept on our
        computer indefinitely.
      </li>
      <li>
        Taking part in this study is voluntary. Not taking part or withdrawing after the study has begun will result in
        no loss of services from NYU to which you are otherwise entitled. You have the right to skip or not answer any
        questions you prefer not to answer.
      </li>
    </ul>
    <p>
      If there is anything about the study or your participation that is unclear or that you do not understand, if you
      have questions or wish to report a research-related problem, you may contact the principal investigator,
      <a href="https://mylab.edu">Your Name</a> at Your Address, Your City, State, Zip,
      <a href="mailto:you@university.edu">you@university.edu</a>. For questions about your rights as a
      research participant, you may contact your university's IRB office.
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
