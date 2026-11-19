# Hunt the Wumpus: pitch script

**problem** (big-statement): You creep through a dark cave and step into a pit. In the classic game, that one wrong step ends the hunt, and you can't do anything about it.

**solution** (big-statement): Hunt the Wumpus remakes the 1973 cave game in Unity. Now a hazard starts a trivia duel, with a question a language model writes on the spot.

**demo** (full-frame): The hex map of the 30-room cave. Colour tells you about your room, and text warns of neighbouring rooms, like a smell of wumpus.

**demo** (full-frame): A hazard opens a trivia duel. A right answer gets you out of the pit or drives the monster off.

**built** (diagram): The cave stays loaded in one scene. A hazard loads the trivia scene on top, which asks OpenAI, or falls back to offline questions.

**ask** (big-statement): Try it at github dot com slash Mallard64 slash Wumpus.

**end** (end-card): _(no narration)_
