# Question library and topic selection

The original 263-question pool was reviewed for clarity, repetition and how easily a player can answer with a reaction image or a short caption. The reviewed library was then expanded from 160 to 1,000 questions in `lib/questions.ts`, with 125 questions and 25 editorially featured choices in each topic. The expansion preserves the existing question IDs and 80 featured choices, adding 840 new situations and 120 new featured picks:

- Everyday Life
- Work & School
- Friends & Social
- Dating & Relationships
- Food
- Technology
- Money & Shopping
- Travel

The initial cleanup consolidates repeated situations (autocorrect, fridge checking, alarms, deliveries, typos, calls and app updates), removes vague or incomplete setups, and adds concrete situations to underrepresented topics. It avoids medical anxiety and body-size jokes. The eight player-name templates were also rewritten where the setup was unclear.

Examples of editorial changes:

| Previous wording | Revised wording or disposition |
| --- | --- |
| Me trying to remember why I entered | When you walk into a room and forget why |
| When your to-do list adds itself | Retired in favor of a concrete task or deadline situation |
| That moment when your seat reclines into snacks | When the person in front of you reclines during your meal |
| When your tiny scratch sounds catastrophic | Retired: unclear setup |
| When your notes app saves your chaos | Retired: unclear stakes |
| Me discovering autocorrect changed my boss message | When autocorrect changes the message after you press send |
| When your food arrives and no utensils | Retired in favor of clearer food situations |
| That moment when your alarm is PM | Replaced with an alarm going off on a day off |
| When your pizza arrives with no ranch | When the restaurant forgets the sauce you wanted most |
| That moment when Haris starts and Dubala escalates | When Haris blames Dubala for eating the last slice |

## Host controls

The lobby defaults to **All topics**. A host can select multiple topics; the selection is a union, not an intersection. The first specific selection replaces All topics. Removing the final selected topic restores All topics. Guests see the selected buttons and matching counts but cannot edit them. Topic choices are stored in room state, preserved by Play Again, and cannot be changed during an active game. Older rooms without the setting use All topics.

Topic filters apply to built-in questions. Custom questions and player-name rounds remain separate, as explained in the lobby. At least one custom question is included when custom questions exist. If the selected pool cannot supply enough unique questions for all heats, the host must select more topics or reduce the round count; the game does not silently draw from unselected topics.

## Sampling

A draw favors the featured bucket with 70% probability while both buckets have available questions. This is a preference, not a guaranteed 70/30 quota for every small game. Once a bucket is exhausted, sampling uses the remaining bucket. Previously played questions are considered only after fresh questions in the selected pool are exhausted. No question repeats within the same game, including personalized questions and custom questions with equivalent case or punctuation.

Featured means an editorial pick. There is no question popularity tracking or player rating system in this change. Meme-image categories and image engagement metrics are independent of question topics.

## Editing

Each runtime question has an ID, text, topic list and featured flag. Keep existing IDs stable when editing wording. Each topic group has an explicit `featuredIds` list containing the numeric suffixes of its featured question IDs. Append new questions rather than reordering entries, and edit existing wording in place to preserve IDs. Change `featuredIds` when revising editorial picks. Keep questions self-contained and under 120 characters, prefer familiar situations, and avoid multiple versions of the same setup. Tests cover catalog integrity, topic isolation, weighting, recent-question avoidance, exhaustion, authorization and the lobby/game flow.
