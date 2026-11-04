---
description: "Autofill for development: registering autofill functions with api.setAutofill so the dev tools can fill forms and complete trials with fake data, and the faker helpers for generating responses."
---

# Autofill

When developing and debugging your experiment, it is useful to have a way to
"fake" data for various components. This serves two purposes:

- It let you quickly jump ahead to test different parts of the code
- It lets you generate fake, but realistic data for your experiment. This can
  help later to test your data analysis scripts.

In <SmileText/> you can autofill forms and other components with fake data. With
this feature you can quickly click through your experiment during testing and
create realistic looking data than you can use to test your data analysis.

## Autofill forms

To autofill a form with fake data we register a function with the [API](/api)
that will be called when the autofill button is clicked. This function should
set the values of the form fields to the desired values. The function is pure
JavaScript and can be as simple or complex as needed. For example in the
[demographic survey View](/coding/builtin-views#demographic-survey) we might want to
autofill the form with some common values:

```js
<script setup>
function autofill() {
  forminfo.dob = '1986-09-12'
  forminfo.gender = 'Male'
  forminfo.race = 'Caucasian/White'
  forminfo.hispanic = 'No'
  forminfo.fluent_english = 'Yes'
  forminfo.normal_vision = 'Yes'
  forminfo.color_blind = 'No'
  forminfo.learning_disability = 'No'
  forminfo.neurodevelopmental_disorder = 'No'
  forminfo.psychiatric_disorder = 'No'
  forminfo.country = 'United States'
  forminfo.zipcode = '12345'
  forminfo.education_level = 'Doctorate Degree (PhD/Other)'
  forminfo.household_income = '$100,000–$199,999'
}

api.setAutofill(autofill)
</script>
```

In this example the `autofill()` function sets the values of the form fields to
deterministic "standin" values. Then we call `api.setAutofill(autofill)` to
register this function as available.

When a [View](/coding/views) has an autofill function registered a special
button will appear in the [developer tools](/coding/developing) menu bar that,
when clicked, will autofill the form values using this function.

You can call `api.removeAutofill()` to remove the autofill function from the
developer tools if needed. When you navigate on the timeline to a new View the
autofill function is automatically removed so it must be re-registered within
each view.

## Autofill trials

A multi-trial View needs fake data for every trial, and each trial can have
several kinds of response (a reaction time, a hit or miss, a key). The way to
do this in <SmileText/> is to describe the expected responses once, on the
parent step, as functions that make fake values. Every trial under that step
inherits them (see
[Abstract Dependent Variable Definition](/coding/steps#abstract-dependent-variable-definition)).
This is how the Stroop task in a new project does it
(`components/StroopExpView.vue`):

```vue
<script setup>
const api = useViewAPI()

// The parent step says what each trial will record, as fake-data functions.
const trials = api.steps.append([
  {
    id: 'stroop',
    rt: () => api.faker.rnorm(500, 50),
    hit: () => api.faker.rbinom(1, 0.8),
    response: () => api.faker.rchoice(['r', 'g', 'b']),
  },
])

// The trials themselves inherit those fields.
trials[0]
  .append([
    { id: 'a', word: 'SHIP', color: 'red', condition: 'unrelated' },
    { id: 'b', word: 'RED', color: 'red', condition: 'congruent' },
    { id: 'c', word: 'GREEN', color: 'red', condition: 'incongruent' },
  ])
  .shuffle()

trials.append([{ id: 'summary' }])
</script>
```

When a participant really responds, your code sets `api.stepData.rt` (and so
on), which replaces the function with the real value. The autofill function
does the same thing with fake values: for each remaining trial it calls
`api.faker.render()` on the step's data, records the step and moves on.

```js
function autofill() {
  while (api.stepIndex < api.nSteps) {
    api.faker.render(api.stepData) // turn each function into a fake value
    api.recordStep()
    api.goNextStep()
  }
}

api.setAutofill(autofill)
```

`api.faker.render()` changes the object you give it (and also returns it):
each field that is a function is replaced by what the function returns, and
fields that already hold a value are left alone. The recorded data then goes
to the database like a real participant's
(see [Data storage](/coding/datastorage)), which makes it useful for testing
your analysis scripts.

The built-in surveys (demographics, device, feedback) and the instructions
quiz already register their own autofill functions.

## The Autofill API

The autofill API is a set of functions that are available to you when you are
developing your app to help you quickly skip forms and generate fake data. The
API is available through the [Smile API](/api) object. The following functions
are available:

### `api.setAutofill(autofillFunction)`

Registers a function to be called when the autofill button is clicked. This is
just a pure JavaScript function that sets the values of the form fields to the
desired values. The function should have no arguments.

### `api.removeAutofill()`

This removes the autofill function from the developer tools menu bar. This
called automatically when each [view](/coding/views) is advanced on the
[timeline](/coding/timeline).

## The Faker API

`api.faker` has functions for making fake data. Each one returns an object
`{ val, type }`, not a bare number: the value is in `.val` (for example
`api.stepData.hit.val` after rendering), and `type` names the distribution.

### `api.faker.rnorm(mean, sd)`

A value from a normal distribution.

### `api.faker.runif(min, max)`

A value from a uniform distribution between `min` and `max`.

### `api.faker.rbinom(n, p)`

The number of successes in `n` tries, each with probability `p`.
`rbinom(1, 0.8)` is 1 about 80% of the time.

### `api.faker.rexGaussian(mu, sigma, tau)`

A value from an ex-Gaussian distribution, a common shape for reaction times.

### `api.faker.rchoice(choices)`

One item from the array `choices`, at random.

### `api.faker.render(object)`

Replaces each field of `object` that is a function with what the function
returns, and returns `object`. Fields that aren't functions are left as they
are.
