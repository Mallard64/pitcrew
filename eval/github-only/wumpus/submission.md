Hunt the Wumpus – AI Edition is a Unity remake of the 1973 cave game Hunt the Wumpus. Players are dropped into a 30-room hex cave holding a Wumpus, two pits and two colonies of bats. They can't see any of it, and sense only what is in neighbouring rooms ("I smell a wumpus!", "I feel a breeze..."). They use those clues to find the Wumpus and shoot it.

What changes from the original: hazards don't kill you outright, they start a trivia duel. A language model writes the question on the spot, and answering it is how you climb out of the pit or drive the monster off.

How it works: the cave lives in one scene that stays loaded for the whole run. A hazard loads an encounter scene on top of it, which reports its result back to the player script. Questions come from OpenAI chat completions as schema-constrained JSON, are validated, and are retried once. If that still fails, the game falls back to an offline question bank on disk. It is fully playable offline and with no API key. Stack: Unity 2022.3 (2D, built-in pipeline), C#, UGUI and TextMeshPro, UnityWebRequest coroutines, JsonUtility for saves. EditMode tests and WebGL CI workflows are included.

Limits (from the README): this is a finished student project. Cave size, hazard count and arrow count are compile-time constants, and each trivia question costs an API round trip, so there is a short pause at the start of an encounter.

Repo: https://github.com/Mallard64/Wumpus