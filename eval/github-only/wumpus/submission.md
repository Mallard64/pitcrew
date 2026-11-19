**Hunt the Wumpus — AI Edition** is a Unity remake of the 1973 cave game Hunt the Wumpus. The twist is that hazards don't kill you outright. They start a trivia duel, and answering the question is how you climb out of a pit or drive off the monster.

**Problem:** In the original game, one wrong room ends the hunt.

**How it works:** You explore a 30-room hex cave holding a Wumpus, two pits and two bat colonies. You sense only the rooms next to you, with clues like "I feel a breeze". A hazard loads an encounter scene on top of the cave, and a language model writes the trivia question. Questions come back as schema-constrained JSON, are validated and are retried once. If that fails, the game falls back to an offline question bank, so it plays with no API key. It is built with Unity 2022.3, C#, UGUI and TextMeshPro, with EditMode tests and a WebGL CI workflow.

**Try it:** github.com/Mallard64/Wumpus