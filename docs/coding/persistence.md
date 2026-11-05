---
description: "How SMILE keeps the experiment's state across page reloads, so participants pick up where they left off, and how to zap it in the dev tools."
---

# Persistence

A key concept in Smile is the idea of _persistence_. Persistence refers to the
fact that information about the application is preserved across page reloads.

It is fairly common for participants to reload their browser window, or to close
a window and reopen it at another time. In most experiment frameworks, the task
begins anew when a participant does this, which can be problematic for certain
research questions. Instead, Smile makes it easy to persist variables in a way
that they will survive page reloads.

Persistence has several important effects on how Smile applications behave both
during development and during "live" data collection.

The first is that if you reload the webpage in live or developer mode, it will
tend to return to the same state as when it was left off.

If you want to start the app over completely (removing all persistence), zap
the local state: press the lightning bolt icon
(<i-f7-bolt-fill class="inline vp-raw" />, "Zap local state") in the developer
tools, or press `Ctrl` + `R`, or type `:zap` on the local dev server.
