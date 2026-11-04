---
description: "How to get your data out of the database and analyze it in Python with the smiledata library (loading, filtering, trials as DataFrames, plotting), and how each record tracks the code version that produced it."
---

# Analyzing data

## Downloading data

::: info Coming with the data dashboard
A built-in way to download data is planned as part of the dev tools' data
dashboard ([#45](https://github.com/NYUCCL/smile-nuxt/issues/45)). Until then,
export it from the database with `sqlite3`, as described in
[Downloading your data](/coding/datastorage#downloading-your-data).
:::

That gives you a JSON file in `analysis/data/`. It holds a list with one entry
per participant: their `data` object (everything recorded during the
experiment, including your `pageData_*` fields) with their participant `id`
added. Private data, such as recruitment IDs, isn't included.

## Loading the data

The [smiledata library](#python-analysis-library-smiledata) below is the
easiest way to work with the file. If you'd rather use plain Python, it's
ordinary JSON:

```python
import json

with open('analysis/data/my-experiment-live.json') as f:
    participants = json.load(f)

for p in participants:
    print(p['id'], p['done'], p.get('pageData_experiment'))
```

The fields match the `data` part of the SMILE store (see
[What's in it](/coding/datastorage#what-s-in-it)).

## Data provenance

Every participant's data records which version of your code produced it. The
`smileConfig.github` field has the repository owner and name, the branch, and
the last commit's message, hash and URL at the time the participant ran the
experiment. So you can always tell which version of the code produced a given
participant's data, and link straight to that code even as the experiment
changes during development.

## Python Analysis Library (smiledata)

<SmileText/> includes a Python library called `smiledata` for analyzing exported
experiment data. The library is located in `analysis/lib/smiledata` and uses
[Polars](https://pola.rs/) for fast DataFrame operations.

### Installation

The library uses [uv](https://docs.astral.sh/uv/) for dependency management. To
set up:

```bash
# Navigate to the analysis folder
cd analysis

# Install uv if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create virtual environment and install dependencies
uv sync

# For Jupyter notebook support
uv sync --extra jupyter

# For Marimo notebook support
uv sync --extra marimo

# For development (includes testing tools)
uv sync --extra dev

# Combine multiple extras
uv sync --extra jupyter --extra dev

# Install everything (jupyter, marimo, and dev tools)
uv sync --extra all
```

### Quick Start

```python
from smiledata import load_json

# Load exported data
data = load_json("data/my-experiment-2025-01-15.json")

# Get summary statistics
print(data.summary())
# {'total': 50, 'complete': 45, 'withdrawn': 2, 'incomplete': 3}

# Filter to complete participants only
complete = data.complete_only()

# Convert to Polars DataFrame for analysis
trials_df = complete.to_trials_df()
```

### Loading Data

#### `load_json(path)`

Load a single JSON export file:

```python
from smiledata import load_json

data = load_json("data/experiment-2025-01-15.json")
```

#### `load_folder(folder, pattern="*.json")`

Load all JSON files from a folder:

```python
from smiledata import load_folder

# Load all JSON files
data = load_folder("data/")

# Load files matching a pattern
data = load_folder("data/", pattern="*-production-*.json")
```

#### `load_latest(folder)`

Load the most recently modified JSON file:

```python
from smiledata.loader import load_latest

data = load_latest("data/")
```

### Working with Datasets

The `SmileDataset` class provides methods for filtering and transforming
participant data.

#### Filtering

```python
# Filter to complete participants (consented, done, not withdrawn)
complete = data.complete_only()

# Filter by experimental condition
condition_a = data.by_condition(condition="A")

# Filter by multiple conditions
filtered = data.by_condition(condition="A", block_order="1")

# Filter by recruitment service
prolific_only = data.by_recruitment("prolific")

# Custom filter with lambda
fast_responders = data.filter(lambda p: p.trial_count > 100)

# Chain filters
result = data.complete_only().by_condition(condition="A")
```

#### Statistics

```python
# Counts
print(f"Total: {data.participant_count}")
print(f"Complete: {data.complete_count}")
print(f"Withdrawn: {data.withdrawn_count}")

# Full summary
summary = data.summary()
# {'total': 50, 'complete': 45, 'withdrawn': 2, 'incomplete': 3}
```

#### Converting to DataFrames

```python
import polars as pl

# Participant-level DataFrame (one row per participant)
participants_df = data.to_participants_df()

# Trial-level DataFrame (one row per trial, all participants)
trials_df = data.to_trials_df()

# Without participant ID column
trials_df = data.to_trials_df(include_participant_id=False)

# Demographics DataFrame
demographics_df = data.demographics_df()

# Specific page data (from pageData_* fields)
quiz_df = data.to_page_data_df("instructionsQuiz")
```

### Extracting Page Data into DataFrames

<SmileText/> uses route-based data recording, where each page/route in your
experiment can record its own data. This data is stored in
`pageData_<routeName>` fields. The `smiledata` library provides convenient
methods to extract this data into DataFrames for analysis.

#### Discovering Available Pages

First, check what pages have recorded data:

```python
# See all pages that have data across participants
print(data.available_pages())
# Output: ['consent', 'demograph', 'device', 'experiment', 'feedback', 'quiz']
```

#### Extracting Trial Data from a Page

Use `to_trials_df(page=...)` or `to_page_data_df(page_name)` to extract data
from a specific page:

```python
# Get trial data from the main experiment page
trials_df = data.to_trials_df(page="experiment")

# Or equivalently
trials_df = data.to_page_data_df("experiment")

# Get quiz attempts
quiz_df = data.to_page_data_df("quiz")
```

The resulting DataFrame includes automatic columns:

- `participant_id`: The participant's ID in the database
- `visit`: The visit number (0-indexed) if the participant visited the page
  multiple times
- `index`: The index of this entry within the visit (for multiple records per
  visit)
- `timestamp`: When the data was recorded (if available)

Plus all the fields you recorded in each data entry.

#### Understanding the Visit Structure

When a participant visits a page multiple times (e.g., going back and forth
between routes), data is organized by visit:

```python
# Access raw page data structure for a participant
page_data = participant.get_page_data("experiment")
# {
#   "visit_0": {"data": [...], "timestamps": [...]},
#   "visit_1": {"data": [...], "timestamps": [...]}
# }

# Get all entries flattened into a list
entries = participant.get_page_data_entries("experiment")

# Get just the last submission (most recent)
last_entry = participant.get_form("experiment")

# Get a specific visit
first_visit = participant.get_form("experiment", visit=0)

# Get all visits as a list
all_visits = participant.get_form("experiment", all_visits=True)
```

::: warning Reloading the page starts a new visit
If a participant reloads the page partway through a view, they continue where
they left off (the stepper restores their position), but everything they record
after the reload goes into the next visit. A Stroop task with 9 trials,
reloaded after trial 4, is saved as:

```python
# {
#   "visit_0": {"data": [trials 1–4], "timestamps": [...]},
#   "visit_1": {"data": [trials 5–9], "timestamps": [...]}
# }
```

No data is lost, but one sitting of the task can span several visits. When you
analyze a task that participants complete once, combine all of its visits
(for example with `get_page_data_entries()` or the `visit` column of
`to_page_data_df()`) rather than reading only `visit_0`. More than one visit to
such a view usually means the participant was interrupted, which can be
useful for quality control.
:::

### Organizing Data for DataFrame Extraction

::: warning Important
For `to_page_data_df()` and `to_trials_df(page=...)` to work correctly, the data
you record must be organized consistently.
:::

#### Consistent Field Names

Each data entry recorded on a page should have the **same field names** across
all entries and all participants. This ensures the resulting DataFrame has
consistent columns:

```javascript
// Good: Consistent field names across all trials
recordPageData({
  trial_num: 1,
  stimulus: 'imageA.png',
  response: 'left',
  rt: 523,
  correct: true,
})

recordPageData({
  trial_num: 2,
  stimulus: 'imageB.png',
  response: 'right',
  rt: 612,
  correct: false,
})
```

```javascript
// Bad: Inconsistent field names (will create sparse columns)
recordPageData({
  trialNumber: 1, // Different name
  stim: 'imageA.png', // Different name
  response: 'left',
  reactionTime: 523, // Different name
})

recordPageData({
  trial_num: 2,
  stimulus: 'imageB.png',
  response: 'right',
  rt: 612,
})
```

#### Consistent Data Types

Keep data types consistent for each field:

```javascript
// Good: rt is always a number
recordPageData({ rt: 523 })
recordPageData({ rt: 612 })

// Bad: rt is sometimes a number, sometimes a string
recordPageData({ rt: 523 })
recordPageData({ rt: 'timeout' }) // Will cause issues
```

If you need to handle special cases like timeouts, use a consistent approach:

```javascript
// Better: Use null for missing values, add a separate status field
recordPageData({ rt: null, status: 'timeout' })
recordPageData({ rt: 523, status: 'responded' })
```

#### Flat Structure Preferred

Keep your data entries flat (not deeply nested) for easier DataFrame conversion:

```javascript
// Good: Flat structure
recordPageData({
  trial_num: 1,
  stimulus_type: 'congruent',
  stimulus_position: 'left',
  response: 'left',
  rt: 523,
})

// Avoid: Deeply nested structure
recordPageData({
  trial: {
    num: 1,
    stimulus: {
      type: 'congruent',
      position: 'left',
    },
  },
  response: {
    key: 'left',
    rt: 523,
  },
})
```

If you do use nested structures, you may need to flatten them during analysis:

```python
from smiledata.transforms import flatten_nested

# Flatten nested dict
flat = flatten_nested({"a": {"b": 1, "c": 2}})
# Result: {"a.b": 1, "a.c": 2}
```

### Working with Individual Participants

The `Participant` class wraps a single participant's data:

```python
# Access participants by index
first = data[0]

# Iterate over participants
for participant in data:
    print(participant.id)

# Key properties
print(participant.id)           # participant ID in the database
print(participant.seed_id)      # UUID for random seeding
print(participant.consented)    # True/False
print(participant.withdrawn)    # True/False
print(participant.done)         # True/False
print(participant.is_complete)  # True if consented, done, and not withdrawn

# Access data fields
print(participant.demographics)  # demographicForm data (most recent)
print(participant.device_info)   # deviceForm data (most recent)
print(participant.feedback)      # feedbackForm data (most recent)
print(participant.quiz)          # quiz data (final attempt)
print(participant.conditions)    # Experimental conditions
print(participant.config)        # smileConfig
print(participant.study_data)    # studyData array (legacy)
print(participant.trial_count)   # Number of trials

# Data provenance (GitHub info)
print(participant.github_info)       # Full github provenance dict
print(participant.git_commit)        # Commit hash that generated this data
print(participant.git_branch)        # Branch name
print(participant.git_repo)          # Repository name
print(participant.git_owner)         # Repository owner
print(participant.git_commit_url)    # URL to the commit on GitHub
print(participant.git_commit_message) # Commit message

# Access arbitrary fields
value = participant.get("customField", default=None)
```

#### Flexible Form Data Access

The `get_form()` method provides flexible access to form data with support for
multiple visits (useful when participants can retake a quiz or revisit a form):

```python
# Get the most recent submission (default)
demographics = participant.get_form("demograph")

# Get a specific visit (0-indexed)
first_quiz_attempt = participant.get_form("quiz", visit=0)
second_quiz_attempt = participant.get_form("quiz", visit=1)

# Get all attempts as a list (with visit/index metadata)
all_quiz_attempts = participant.get_form("quiz", all_visits=True)
```

#### Page Data Access

Access raw page data or flattened entries:

```python
# Raw page data with visit structure
page_data = participant.get_page_data("experiment")
# Returns: {"visit_0": {"data": [...], "timestamps": [...]}, ...}

# All entries flattened into a list
entries = participant.get_page_data_entries("experiment")
# Returns: [{"visit": 0, "index": 0, "timestamp": ..., ...}, ...]

# Get all pageData_* fields
all_page_data = participant.get_all_page_data()
```

#### Route Order and Timing

See how participants navigated through the experiment:

```python
# Text summary of routes and time spent
print(participant.route_order_summary())
# Output:
# Route Order:
#    1. consent                        2.5s
#    2. instructions                  15.3s
#    3. experiment                   5m 23.1s
#    4. feedback                       45.2s
#    5. thanks                         current
#   Total:                           6m 26.1s

# Visual subway-style timeline
ax = participant.plot_route_order()

# With explicit dark mode
ax = participant.plot_route_order(mode="dark")
```

#### Converting Individual Data to DataFrame

```python
# Convert individual's study_data to DataFrame (legacy format)
trials_df = participant.study_data_to_polars()
```

### Analyzing Trial Data

```python
import polars as pl
from smiledata import load_json

# Load and filter data
data = load_json("data/experiment.json")
complete = data.complete_only()

# Get trials DataFrame
trials = complete.to_trials_df()

# Basic statistics with Polars
mean_rt = trials.group_by("participant_id").agg(
    pl.col("rt").mean().alias("mean_rt"),
    pl.col("correct").mean().alias("accuracy")
)

# Filter trials
correct_trials = trials.filter(pl.col("correct") == 1)

# Analyze by condition
by_condition = trials.group_by("condition").agg(
    pl.col("rt").mean().alias("mean_rt"),
    pl.col("rt").std().alias("std_rt"),
    pl.col("correct").mean().alias("accuracy")
)
```

### Plotting

The library includes built-in plotting functions using seaborn and matplotlib.
All plots support dark mode and automatically adapt their colors to the current
theme.

#### Dark Mode Support

Plots automatically detect the current theme when used in marimo notebooks. You
can also manually specify the theme:

```python
from smiledata import detect_theme, get_theme_colors

# Auto-detect current theme (works in marimo)
theme = detect_theme()  # Returns "light" or "dark"

# Get theme-appropriate colors
colors = get_theme_colors()  # Auto-detect
colors = get_theme_colors("dark")  # Force dark mode

# Available color keys:
# - text_color: Primary text color
# - muted_color: Secondary/muted text
# - node_fill: Fill color for chart elements
# - edge_color: Border/edge colors
# - grid_color: Grid line color
```

All built-in plotting functions:

- Make figure and axes backgrounds transparent
- Automatically style text, ticks, and spines for the current theme
- Work seamlessly in both light and dark notebook environments

#### Available Plot Types

```python
import matplotlib.pyplot as plt
from smiledata.plotting import (
    plot_completion_rate,
    plot_trial_rt_distribution,
    plot_accuracy_by_condition,
    plot_rt_by_condition,
    plot_participant_timeline,
)
```

**`plot_completion_rate(dataset)`** - Horizontal bar chart showing the number of
complete, withdrawn, and incomplete participants.

```python
ax = plot_completion_rate(data)
```

**`plot_trial_rt_distribution(trials_df, rt_column="rt")`** - Histogram showing
the distribution of reaction times across all trials.

```python
trials = data.complete_only().to_trials_df(page="experiment")
ax = plot_trial_rt_distribution(trials, rt_column="rt", bins=50)
```

**`plot_accuracy_by_condition(trials_df, condition_col)`** - Bar chart with
standard error bars showing accuracy across experimental conditions.

```python
ax = plot_accuracy_by_condition(trials, condition_col="condition", correct_col="correct")
```

**`plot_rt_by_condition(trials_df, condition_col)`** - Box plot showing reaction
time distributions across experimental conditions.

```python
ax = plot_rt_by_condition(trials, condition_col="condition", rt_column="rt")
```

**`plot_participant_timeline(dataset)`** - Line plot showing cumulative
participant enrollment over time.

```python
ax = plot_participant_timeline(data)
```

#### Participant Route Visualization

Individual participants have a method to visualize their route through the
experiment:

```python
participant = data[0]

# Text summary of routes and time spent
print(participant.route_order_summary())

# Subway-style visual timeline
ax = participant.plot_route_order()

# With explicit theme control
ax = participant.plot_route_order(mode="dark")
```

#### Composing Multi-Panel Figures

All plotting functions accept an optional `ax` parameter, allowing you to
compose multiple plots into a single figure:

```python
fig, axes = plt.subplots(1, 2, figsize=(12, 5))
plot_trial_rt_distribution(trials, ax=axes[0])
plot_accuracy_by_condition(trials, condition_col="condition", ax=axes[1])
plt.tight_layout()
```

### Using with Notebooks

#### Marimo

```bash
uv run marimo edit notebooks/analysis.py
```

```python
import marimo as mo
from smiledata import load_json

data = load_json("../data/experiment.json")
mo.md(f"Loaded {len(data)} participants")
```

#### Jupyter

```bash
uv run jupyter lab
```

```python
from smiledata import load_json

data = load_json("data/experiment.json")
data.summary()
```

### Running Tests

Run the tests from the `analysis` folder:

```bash
cd analysis

# Run all tests
uv run pytest

# Run with coverage report
uv run pytest --cov=smiledata --cov-report=term-missing

# Run specific test file
uv run pytest tests/test_participant.py
```

::: tip Why Polars instead of Pandas?

The `smiledata` library uses [Polars](https://pola.rs/) rather than Pandas for
several reasons:

1. **Performance**: Polars is significantly faster, especially for large
   datasets
2. **Memory efficiency**: Uses Apache Arrow for zero-copy data access
3. **Modern API**: Cleaner, more consistent syntax
4. **Type safety**: Better type inference and validation

If you need Pandas compatibility, you can easily convert:

```python
pandas_df = trials_df.to_pandas()
```

:::
