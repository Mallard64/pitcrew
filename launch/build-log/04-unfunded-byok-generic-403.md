**Type:** Build log

**Title:** An unfunded BYOK key fails every model with a bare 403, so setup feels broken

**Building:** Pit Crew's first HarnessRouter call was a smoke test before wiring the agent into our video pipeline.

**Blocked:** Three config failures came before our first green call. The first was our mistake; better errors would have saved the most time on the other two:

1. Our HarnessRouter key was sent to TokenRouter's base URL (copied env) → **401**. Fair, though a hint like "this looks like a HarnessRouter key" would help.
2. Auth and Harness ID were fine: we got HTTP 200 and a `hsess…` session was created. But **every model then failed with 403**. The cause was a $0.00 quota on the TokenRouter account behind BYOK. We only found that by calling TokenRouter directly and seeing `insufficient_user_quota`.
3. After adding credit to a new TokenRouter key, the old key was still saved in HarnessRouter's BYOK settings, so we got the same failure again.

**Cost to us:** about 1.5 hours on Nov 17, the evening we planned to start building.

**Loved:** the session and Harness ID were created and reported correctly even while the model call failed. That told us auth was fine and narrowed the search.

**Want:**
- Pass the provider's reason through on BYOK failures: `{"type":"provider_error","code":"insufficient_quota","provider":"tokenrouter","hint":"Add credit or update the key under Profile → Bring Your Own Key"}`.
- In the console, show the BYOK key's last check ("quota OK / empty / invalid") and when it was saved, so a stale key is obvious.
- In the onboarding checklist, include "fund the TokenRouter key" before "run your first task".

**Who benefits:** every new team during onboarding, which is the moment they decide whether the platform works.

**Labels:** The Big Hack Game, byok, onboarding, errors

**Roadmap:** Related: #R?

