import {
  DEFAULT_SETTINGS,
  type Condition, type DecisionOption, type Effect, type InteractiveGraph, type NotebookEntry, type Route, type StoryNode,
} from "@/lib/interactive";

// "Chain of Custody" — intro (~15–20 minutes). Loaded from the admin editor's
// template menu; every line, choice and variable stays editable there.
//
// Hidden variables
//   heat           Brannigan's alarm. Rises when you show him what you know.
//   t_frank, t_reyes, t_lou, t_marsh, t_clara, t_hale   trust (+ open, − guarded)
//   objectivity    rises when you stay neutral instead of picking a side
//   looks          things examined in the evidence cage (max 3)
// Everything else is a true/false flag for something seen, said or done.
//
// Adaptive text = scenes with "Show this scene only if…" conditions, chained
// one after another. When one option needs different hidden effects depending
// on earlier choices, it appears twice with opposite "Only show if…" rules.

const p = (...paras: string[]) => paras.map((t) => `<p>${t}</p>`).join("");

const is = (v: string): Condition => ({ var: v, op: "truthy" });
const not = (v: string): Condition => ({ var: v, op: "falsy" });
const gte = (v: string, n: number): Condition => ({ var: v, op: "gte", value: String(n) });
const lt = (v: string, n: number): Condition => ({ var: v, op: "lt", value: String(n) });
const eq = (v: string, n: number): Condition => ({ var: v, op: "eq", value: String(n) });

const flag = (v: string): Effect => ({ var: v, op: "set", value: "true" });
const add = (v: string, n: number): Effect => ({ var: v, op: "add", value: String(n) });

const note = (text: string): NotebookEntry => ({ kind: "note", text });
const evidence = (text: string): NotebookEntry => ({ kind: "evidence", text });

interface SceneExtra {
  label?: string;
  title?: string;
  conditions?: Condition[];
  routes?: Route[];
  notebook?: NotebookEntry[];
}

const scene = (id: string, content: string, next: string, extra: SceneExtra = {}): StoryNode => ({
  id, type: "narrative", content, next, ...extra,
});

const decision = (id: string, title: string, context: string, options: DecisionOption[]): StoryNode => ({
  id, type: "decision", title, content: "", context, options,
});

const option = (id: string, label: string, next: string, extra: Partial<DecisionOption> = {}): DecisionOption => ({
  id, label, next, ...extra,
});

// ── Evidence cage: three looks out of five ──
// Each look leads back to the next round until three have been used.
const afterLook: Route[] = [
  { conditions: [eq("looks", 1)], to: "cage_tick1" },
  { conditions: [eq("looks", 2)], to: "cage_tick2" },
];

const cageOptions = (firstRound: boolean): DecisionOption[] => {
  const hide = (v: string) => (firstRound ? {} : { visibleIf: [not(v)] });
  const opts: DecisionOption[] = [
    option("o_look_body", "Kneel by the body and look at the wound.", "cage_wound",
      { effects: [flag("saw_wound"), add("looks", 1)], ...hide("saw_wound") }),
    option("o_look_shelf", "Look at the shelving above where he fell.", "cage_shelf",
      { effects: [flag("saw_shelf_blood"), add("looks", 1)], ...hide("saw_shelf_blood") }),
    option("o_look_ledger", "Find the empty slot where the Kessler Ledger was kept.", "cage_ledger",
      { effects: [flag("ledger_moved_early"), add("looks", 1)], ...hide("ledger_moved_early") }),
    option("o_look_gun", "Check the firearms drawer.", "cage_gun",
      { effects: [flag("saw_gun_drawer"), add("looks", 1)], ...hide("saw_gun_drawer") }),
    option("o_look_desk", "Go through Ames’s desk.", "cage_desk",
      { effects: [flag("napkin"), flag("watch_missing"), add("looks", 1)], ...hide("napkin") }),
  ];
  if (!firstRound) opts.push(option("o_look_done", "Step back and let Hale’s people work.", "cage_time_up"));
  return opts;
};

const nodes: StoryNode[] = [
  // ════════ 06:48 — The letter ════════
  scene("opening", p(
    "The letter is still in your coat pocket. You’ve read it four times since it arrived on Tuesday, and you still don’t know why a man you never met asked for you by name.",
    "Walter Ames. Evidence custodian, Harrow Street Precinct. Thirty-one years in the same basement.",
    "At 6:10 this morning, they found him on the floor of that basement. At 6:30, your phone rang.",
    "The rain has stopped. The precinct steps haven’t dried.",
  ), "d_letter", { label: "06:48 · Harrow Street, outside the precinct", title: "The Letter" }),

  decision("d_letter", "Before you go in", "A dead man asked for you by name. His letter is the only thing in this building that is on your side.", [
    option("o_letter_read", "Read the letter one more time.", "letter_read", { effects: [flag("letter_full")] }),
    option("o_letter_pocket", "Leave it in your pocket. Walk in clean.", "letter_pocket", { effects: [add("objectivity", 1)] }),
    option("o_letter_seal", "Photograph it, then seal it in an evidence sleeve.", "letter_seal", { effects: [flag("letter_sealed")] }),
  ]),

  scene("letter_read", p(
    "You unfold it under the streetlight. Blue ink. A careful hand, the hand of a man who doesn’t trust his own writing with anything that matters.",
    "<em>I’ve asked for someone from outside because nobody in this building can look at this straight, and that includes me. There is a book that proves something about my son. There are people here who would rather it burned. If anything happens before you arrive: trust the ledger, not the log. — W. A.</em>",
    "You almost miss the postscript. It’s squeezed in sideways along the margin, smaller than the rest.",
    "<em>P.S. Everyone here keeps very careful time. Ask yourself who needs to.</em>",
    "You fold it back along its creases. It’s starting to wear through. You take the steps two at a time.",
  ), "front_desk", { notebook: [note("Ames’s letter: “Trust the ledger, not the log.” P.S.: “Everyone here keeps very careful time. Ask yourself who needs to.”")] }),

  scene("letter_pocket", p(
    "You leave it where it is. Whatever Walter Ames believed, you’d rather meet the building before you meet his version of it.",
    "You take the steps two at a time.",
  ), "front_desk"),

  scene("letter_seal", p(
    "Habit. If this letter turns out to matter, someone will say you wrote it yourself.",
    "You photograph both sides, slide it into a clear sleeve, and write the time across the seal: 06:51.",
    "You take the steps two at a time.",
  ), "front_desk", { notebook: [evidence("Ames’s letter, sealed in a sleeve at 06:51")] }),

  // ════════ 06:58 — Front desk ════════
  scene("front_desk", p(
    "The front desk is a fortress of laminate and paper. Behind it sits a broad man in his fifties, reading glasses pushed up into grey hair. The nameplate says SGT. L. BRANNIGAN.",
    "At his elbow, a short wooden shelf holds two dozen battered paperbacks and a handwritten card: TAKE ONE, LEAVE ONE.",
    "“You’ll be the outside help.” He’s already on his feet, hand out. “Lou Brannigan. Terrible morning. Terrible. Walt was the best of us.”",
    "“Captain’s expecting you. Coffee first? We keep the good stuff hidden from day shift.”",
  ), "d_desk", { label: "06:58 · Front desk", title: "The Front Desk" }),

  decision("d_desk", "Sergeant Brannigan", "He’s holding the coffee pot. He’s also standing between you and the sign-in book.", [
    option("o_desk_coffee", "Accept the coffee.", "desk_coffee", { effects: [flag("coffee"), add("t_lou", 1), flag("heard_librarian")] }),
    option("o_desk_log", "Decline. Ask to see last night’s sign-in book.", "desk_log", { effects: [flag("saw_logbook"), add("heat", 1)] }),
    option("o_desk_room", "Say nothing for a moment. Take in the room.", "desk_room", { effects: [add("objectivity", 1), flag("noticed_polish")] }),
  ]),

  scene("desk_coffee", p(
    "He brightens. While the machine groans, he talks, easily, the way people talk about something they’ve already told a few times.",
    "“Frank Dellacourt and Walt had words last week. Loud ones. I’m not saying anything, you understand. I’m saying we should look at everything. Procedure.”",
    "He hands you a chipped mug: HARROW ST. BOOK CLUB, EST. 2009. You raise an eyebrow at it.",
    "“I run the shelf.” He nods at the paperbacks. “The young ones call me the Librarian. Somebody’s got to make them read something that isn’t a screen.”",
    "The coffee is good. He watches you drink it.",
  ), "captain", { notebook: [note("Brannigan runs the precinct’s paperback shelf. Nickname: “the Librarian.”")] }),

  scene("desk_room", p(
    "You let the silence sit. People always fill it.",
    "A corkboard: a retirement card for Walter Ames, TWO WEEKS!!, dense with signatures. A wall clock. The paperback shelf.",
    "And Brannigan’s shoes. Black, mirror-shined, the polish still tacky along the welt. Fresh, at the end of a night shift.",
    "“Long night?” you ask.",
    "“The longest.” He rubs his eyes. “We all feel it. Every one of us.”",
  ), "captain", { notebook: [note("Brannigan’s shoes were freshly polished at the end of a night shift.")] }),

  scene("desk_log", p(
    "Something crosses his face, quick as a draught under a door. Then he smiles.",
    "“Course. We keep it right here, by the book.” He slides a green, ledger-ruled log across the counter and doesn’t take his hand off the corner.",
    "Last night’s page is short. A facilities tech, 19:30 to 19:55. W. AMES, custodian, signed in at 07:00 yesterday morning and never signed out. N. REYES, 22:15 in, 22:48 out.",
    "Then nothing until this morning.",
  ), "d_log"),

  decision("d_log", "The sign-in book", "Brannigan hasn’t let go of the corner.", [
    option("o_log_thumb", "Run your thumb down the page.", "log_thumb", { effects: [flag("noticed_erasure")] }),
    option("o_log_copy", "Ask for a photocopy and move on.", "log_copy", { effects: [flag("has_log_copy")] }),
  ]),

  scene("log_thumb", p(
    "Just below Reyes’s line, the paper feels different. Softer, slightly furred, like it’s been worked at with an eraser. You can’t see anything there. Not in this light.",
    "“Something wrong?” Brannigan asks.",
  ), "d_log_thumb", { notebook: [note("Sign-in book: the paper just below Reyes’s entry has been rubbed. Possibly erased.")] }),

  decision("d_log_thumb", "“Something wrong?”", "Brannigan is watching your thumb.", [
    option("o_log_reading", "“Just reading.”", "log_reading"),
    option("o_log_touched", "“Has anyone touched this book since midnight?”", "log_touched", { effects: [add("heat", 1)] }),
  ]),

  scene("log_reading", p(
    "“Just reading,” you say.",
    "He nods. He doesn’t look away. Then he takes the book back and squares it neatly against the edge of the counter.",
  ), "captain"),

  scene("log_touched", p(
    "“Only me.” The smile doesn’t move. “Chain of custody. We do it properly here.”",
    "He takes the book back and squares it neatly against the edge of the counter.",
  ), "captain"),

  scene("log_copy", p(
    "He copies it without a word and hands it over still warm.",
    "The copy is clean. Very clean. A photocopier only sees ink.",
  ), "captain", { notebook: [evidence("Photocopy of last night’s sign-in page")] }),

  // ════════ 07:10 — Captain Marsh ════════
  scene("captain", p(
    "Captain Helen Marsh looks like she’s been awake since the call and has already decided how today ends. Her door is propped open with a box of files.",
    "“I’ll be direct,” she says. “I have a dead employee in my basement, two detectives who’d each like to see the other in a cell, and a press office that wants a sentence by noon. You’re here because I need someone to say it out loud who doesn’t drink with anyone on this floor.”",
    "She slides a slip of paper across the desk. A parking garage ticket. Entry 23:41.",
    "“Frank Dellacourt’s car. Last night. He’s not on the log.” She lets that land. “Walt and Frank had history. I’m not telling you what to find. The department just needs this clean.”",
  ), "d_captain", { label: "07:10 · Captain Marsh’s office", title: "Captain Marsh", notebook: [evidence("Parking garage ticket: Dellacourt’s car, entry 23:41")] }),

  decision("d_captain", "What do you tell the Captain?", "Marsh has decided how today ends. She wants to know whether you have.", [
    option("o_cap_evidence", "“I go where the evidence goes. Including away from Dellacourt.”", "cap_evidence",
      { effects: [add("objectivity", 1), add("t_marsh", -1)] }),
    option("o_cap_history", "“Tell me about Dellacourt and Ames.”", "cap_history",
      { effects: [add("t_marsh", 1), add("objectivity", -1), flag("knows_danny")] }),
    // Same line twice: Brannigan overhears more if he brought the coffee up.
    option("o_cap_letter_coffee", "“Walter Ames wrote to me before he died. Did you know?”", "cap_letter",
      { visibleIf: [is("coffee")], effects: [flag("told_marsh_letter"), add("heat", 2)] }),
    option("o_cap_letter", "“Walter Ames wrote to me before he died. Did you know?”", "cap_letter",
      { visibleIf: [not("coffee")], effects: [flag("told_marsh_letter"), add("heat", 1)] }),
  ]),

  scene("cap_evidence", p(
    "She studies you for a long moment.",
    "“Good,” she says. “That’s what I’d say, in your chair.” It isn’t approval. It’s a note being made.",
  ), "captain_close"),

  scene("cap_history", p(
    "She’s glad you asked. That should bother you more than it does.",
    "“Walt had a son. Danny. Uniform, good kid, or everyone thought so. In 2017 he was fired for taking money from the Kessler outfit. Eight months later he drove into the river.” She taps the parking ticket. “Walt never believed Danny was dirty. Frank was Danny’s training officer. Frank testified.”",
    "“Do the maths.”",
  ), "captain_close", { notebook: [note("Ames’s son Danny was fired in 2017 for taking Kessler money. Frank Dellacourt testified against him. Danny died eight months later.")] }),

  scene("cap_letter", p("Marsh goes very still. “He what?”"), "cap_letter_sealed"),

  scene("cap_letter_sealed", p(
    "You hold up the sleeve, the time written across the seal. She reads it through the plastic without touching it. Something in her face settles.",
    "“All right,” she says quietly. “That’s real.”",
  ), "cap_letter_open", { conditions: [is("letter_sealed")] }),

  scene("cap_letter_open", p(
    "She holds out her hand for it. You hesitate long enough that she draws it back.",
    "“Fine. Keep it. Everybody else in this building has secrets. Why not you.”",
  ), "cap_door_lou", { conditions: [not("letter_sealed")] }),

  scene("cap_door_lou", p(
    "Behind you, the door is still open. Brannigan is standing in it with two mugs. You don’t know how long he’s been there.",
    "“Thought the Captain could use one,” he says. He sets them down, and goes.",
  ), "cap_door_steps", { conditions: [is("coffee")] }),

  scene("cap_door_steps", p(
    "Behind you, the door is still open. Somewhere down the corridor, footsteps that had stopped start moving again.",
  ), "captain_close", { conditions: [not("coffee")] }),

  scene("captain_close", p(
    "Marsh hands you a visitor’s badge and a keycard.",
    "“Basement’s open to you. Dr. Hale is finishing up.” She’s already reaching for the phone. “And try not to start a war in my hallway.”",
  ), "hallway"),

  // ════════ 07:24 — The corridor ════════
  scene("hallway", p(
    "You hear them before you see them.",
    "“…signed in like a human being, Frank, which is more than…”",
    "“Keep your voice down.”",
    "They stop when you turn the corner. Two detectives standing a step too close to each other, both pretending they weren’t.",
    "Nadia Reyes: thirties, dark blazer, hair scraped back, a phone face-down in her hand. Frank Dellacourt: sixty or near it, big, gone soft at the edges, a fresh white bandage across the knuckles of his right hand.",
    "Reyes recovers first. She doesn’t offer a hand.",
    "“You’re the outsider. For your notes: I was in evidence last night from 22:17 to 22:46. The book says 22:15. The book is wrong.”",
  ), "d_reyes_time", { label: "07:24 · Second-floor corridor", title: "Twenty-Two Seventeen" }),

  decision("d_reyes_time", "Reyes has given you a time", "She corrected the log before anyone asked her to.", [
    option("o_reyes_point", "Point out that she’s being very precise.", "reyes_point",
      { effects: [flag("reyes_alerted"), add("t_reyes", -1), add("t_frank", 1)] }),
    option("o_reyes_jot", "Ignore it and just jot it down.", "reyes_jot",
      { effects: [flag("reyes_precision_noted")] }),
    option("o_reyes_pause", "Take a long pause and double-check the time.", "reyes_pause",
      { effects: [add("objectivity", 1), flag("clock_fast"), flag("reyes_phone")] }),
  ]),

  scene("reyes_point", p(
    "“That’s very precise,” you say. “Most people round.”",
    "A beat. “Most people are sloppy.”",
    "But her thumb has stopped moving on the edge of the phone.",
    "Frank lets out a short bark of a laugh. “She does that. Time-stamps her own lunch.”",
    "Reyes looks at him the way you’d look at a stain. After that, every word she says to you is chosen.",
  ), "frank_turn_alerted", { notebook: [note("Reyes knows I noticed how precise she was. She’s guarded now.")] }),

  scene("reyes_jot", p(
    "You write it down. <em>22:17 to 22:46.</em> No underline, no look.",
    "She watches the pen. Then she relaxes, very slightly, the way people do when they decide you’re the kind of investigator who writes things down and doesn’t think about them.",
    "Let her think that.",
  ), "frank_turn_alerted", { notebook: [note("Reyes, unprompted: “22:17 to 22:46. The book says 22:15. The book is wrong.”")] }),

  scene("reyes_pause", p(
    "You don’t write anything. You look up at the corridor clock, then down at your own watch.",
    "The clock on the wall is three minutes fast.",
    "The silence stretches. Reyes fills it.",
    "“I went by my phone. Not that thing. Everyone knows that clock’s fast.” She turns the phone over in her hand, then catches herself and turns it face-down again. “I was messaging someone. About a different case.”",
    "Nobody asked who she was messaging.",
  ), "frank_turn_alerted", { notebook: [
    note("The corridor clock runs three minutes fast."),
    note("Reyes timed her visit by her phone. Volunteered that she was “messaging someone about a different case.”"),
  ] }),

  scene("frank_turn_alerted", p(
    "Frank turns to you. “Don’t mind her,” he says. “Walt was a friend, kid. Thirty years. You do what you need to.”",
  ), "frank_turn", { conditions: [is("reyes_alerted")] }),

  scene("frank_turn", p(
    "Frank turns to you. “Walt was a friend, kid,” he says. “Thirty years. You do what you need to.”",
  ), "d_frank", { conditions: [not("reyes_alerted")] }),

  decision("d_frank", "Detective Dellacourt", "Reyes is watching Frank. Frank is watching you.", [
    option("o_frank_hand", "Ask about the bandage on his hand.", "frank_bandage",
      { effects: [flag("frank_hand"), add("t_frank", -1)] }),
    option("o_frank_where", "Ask where he was last night.", "frank_where",
      { effects: [flag("frank_admits_visit"), add("t_frank", -1)] }),
    option("o_frank_sorry", "Offer your condolences and leave it there.", "frank_sorry",
      { effects: [add("t_frank", 1), flag("frank_grief_real")] }),
  ]),

  scene("frank_bandage", p(
    "He glances down at it like it belongs to someone else.",
    "“Caught it in a car door. Kid, at my age you bleed if the wind changes.”",
    "Reyes says nothing. She’s looking at his hand too.",
  ), "hallway_exit", { notebook: [note("Frank’s right knuckles are bandaged. Says he caught them in a car door.")] }),

  scene("frank_where", p(
    "“Home.” Fast. Then: “Mostly.”",
    "He glances at Reyes and seems to decide something.",
    "“I came by around half eleven. Left my reading glasses in my desk. Never went downstairs.”",
    "“You’re not on the log.”",
    "“Lou buzzed me in. Ask Lou.”",
  ), "frank_where_reyes", { notebook: [note("Frank admits coming in around 23:30 “for his reading glasses.” Says Brannigan let him in. Says he never went downstairs.")] }),

  scene("frank_where_reyes", p("Reyes’s eyes flick to the stairwell, then back."), "hallway_exit", { conditions: [gte("heat", 1)] }),

  scene("frank_sorry", p(
    "“I’m sorry for your loss.”",
    "He wasn’t ready for that. For a second the whole act drops off him and he’s just an old man in a corridor.",
    "“Yeah,” he says. “Yeah. Me too.”",
    "Short. Nothing folksy about it. That one, you believe.",
  ), "hallway_exit", { notebook: [note("Frank’s grief looked real when I offered condolences.")] }),

  scene("hallway_exit", p(
    "Reyes is already walking away. “Hale’s waiting for you downstairs,” she says over her shoulder. “He doesn’t like waiting.”",
  ), "cage"),

  // ════════ 07:41 — The evidence cage ════════
  scene("cage", p(
    "The basement smells of dust and bleach and something underneath both.",
    "The evidence cage is a long room of steel shelving behind a chain-link wall. The gate is propped open with an orange cone. Above it, a camera with a yellowed work order taped to the housing: OUT OF SERVICE, REPORTED 14/03.",
    "Walter Ames lies on his side between two shelving units, one arm folded under him. Grey cardigan. A brass watch chain loops from his waistcoat button down into his pocket.",
    "Dr. Yusuf Hale, the medical examiner, kneels beside him with the stillness of someone who has knelt beside a great many people.",
    "“You’ve got about ten minutes,” he says without turning round, “before my people bag everything that isn’t bolted down. Spend them well.”",
  ), "d_cage1", { label: "07:41 · Basement, evidence cage", title: "The Cage" }),

  decision("d_cage1", "Ten minutes", "You have time to look properly at three things. Choose carefully.", cageOptions(true)),
  scene("cage_tick1", p("Hale’s assistant starts laying out evidence bags along the wall."), "d_cage2"),
  decision("d_cage2", "Keep looking", "Two more things. Hale’s people are getting ready.", cageOptions(false)),
  scene("cage_tick2", p("“Five minutes,” Hale says."), "d_cage3"),
  decision("d_cage3", "One last look", "One more. Then it’s Hale’s room again.", cageOptions(false)),

  scene("cage_wound", p(
    "Left side of the head, above and behind the ear. The grey hair is matted dark and stiff.",
    "“Bled for a while,” Hale says. “Longer than I’d expect, for where he’s lying.”",
  ), "d_wound"),

  decision("d_wound", "“Bled for a while”", "Hale hasn’t looked up.", [
    option("o_wound_long", "“How long is a while?”", "wound_long", { effects: [flag("hale_pressed"), add("t_hale", -1)] }),
    option("o_wound_fell", "“Could he have just fallen?”", "wound_fell", { effects: [flag("hale_fell_once")] }),
    option("o_wound_quiet", "Say nothing. Let him work.", "wound_quiet", { effects: [add("t_hale", 1), flag("hale_will_call")] }),
  ]),

  scene("wound_long", p(
    "He sighs through his nose. “An hour. Maybe more. And don’t write that down, I haven’t opened him yet.”",
    "You write it down.",
  ), "cage_time_up", { routes: afterLook, notebook: [note("Hale, unofficially: Ames bled for an hour or more before he died.")] }),

  scene("wound_fell", p(
    "Hale looks at the shelving, then at the wound, then at you.",
    "“He could have fallen,” he says. “Once.”",
  ), "cage_time_up", { routes: afterLook, notebook: [note("Hale: “He could have fallen. Once.”")] }),

  scene("wound_quiet", p(
    "You leave him to it. He notices. People who work with the dead tend to notice who lets them.",
    "“Call me after the post-mortem,” he says. “I’ll have something for you.”",
  ), "cage_time_up", { routes: afterLook, notebook: [note("Hale will talk to me after the post-mortem.")] }),

  scene("cage_shelf", p(
    "The steel upright has a smear at about shoulder height, brown now, with a few grey hairs caught in the joint. The box on the shelf below is dented in at one corner. Someone hit this hard, or was put into it hard.",
    "But the smear is high. And Walter Ames is lying a full metre away from it.",
  ), "cage_time_up", { routes: afterLook, notebook: [note("Blood and hair on a shelf upright at shoulder height. The body is lying a metre away from it.")] }),

  scene("cage_ledger", p(
    "Shelf C-4. The inventory label is still there: KESSLER, M. / ITEM 4471 / LEDGER, BOUND, x1.",
    "In the dust, a clean rectangle where it used to sit.",
    "Not quite clean, though. You tilt your head and catch the light across it. There’s a fine new layer of dust inside the rectangle. If the ledger had been taken last night, that patch would be bare.",
    "It’s been gone for days.",
  ), "cage_time_up", { routes: afterLook, notebook: [note("Dust has started to settle in the ledger’s empty slot. It was moved days ago, not last night.")] }),

  scene("cage_gun", p(
    "Drawer F-2 is shut but not locked. Inside, a row of tagged handguns sits in foam cut-outs. One cut-out is empty.",
    "The tag string is still tied to the drawer handle. Its end is cut clean. Scissors, not a tear.",
    "The drawer manifest names it: ITEM 2291 / REVOLVER .38 / DELLACOURT OFFICER-INVOLVED SHOOTING, 2019. RULED JUSTIFIED.",
    "Whoever took it came prepared.",
  ), "cage_time_up", { routes: afterLook, notebook: [note("The .38 from Dellacourt’s 2019 shooting is missing. The tag string was cut with scissors.")] }),

  scene("cage_desk", p(
    "A small steel desk by the gate. The reading lamp is still on. A retirement card. A takeaway container with half a meal in it, lamb gone cold and grey.",
    "Folded under it is a paper napkin. On it, in pencil, in that same careful hand: <em>14 — L</em>",
    "As you straighten up you look back at the body, and see what’s been bothering you. The watch chain runs from his waistcoat button into his pocket. The pocket is flat.",
    "The chain is there. The watch isn’t.",
  ), "cage_time_up", { routes: afterLook, notebook: [
    evidence("Napkin from Ames’s desk, in pencil: “14 — L”"),
    note("Ames’s watch chain is still attached, but the watch is gone."),
  ] }),

  scene("cage_time_up", p(
    "“That’s time,” Hale says. His people move in with bags and tags, and the cage stops being a room and starts being evidence.",
  ), "cage_sealed"),

  scene("cage_sealed", p(
    "At the top of the stairs, Brannigan is waiting. Helpful as ever.",
    "“Captain wants the basement sealed until forensics are done. Procedure,” he says. “We’ll get you back down here soon as we can.”",
    "He doesn’t move out of the doorway until you’ve passed him.",
  ), "cage_shout", { conditions: [gte("heat", 3)], notebook: [note("Brannigan had the basement sealed “until forensics are done.”")] }),

  scene("cage_shout", p("Somewhere above you, someone is shouting."), "clara"),

  // ════════ 08:02 — Clara ════════
  scene("clara", p(
    "A woman in her thirties is standing in the middle of the lobby with her coat buttoned wrong, shouting at a young uniform who is backing away from her with his palms out.",
    "“I brought him dinner. I was <em>here</em>. I was here last night and nobody will tell me…”",
    "Clara Ames. You’d know it from the jaw alone.",
  ), "clara_lou_moving", { label: "08:02 · Front desk", title: "Clara Ames" }),

  scene("clara_lou_moving", p(
    "Brannigan is already coming round the end of the counter toward her, hand out, voice low and warm.",
  ), "clara_lou_reading", { conditions: [gte("heat", 2)] }),

  scene("clara_lou_reading", p(
    "Behind the desk, Brannigan looks up from his paperback.",
  ), "d_clara", { conditions: [lt("heat", 2)] }),

  decision("d_clara", "Clara Ames", "Everyone in the lobby is pretending not to watch.", [
    option("o_clara_go", "Go to her yourself.", "clara_go", { effects: [add("t_clara", 1), flag("clara_met")] }),
    option("o_clara_lou", "Let Brannigan handle her.", "clara_lou", { effects: [flag("lou_with_clara"), add("heat", 1), add("t_clara", -1)] }),
    option("o_clara_later", "Tell her you’ll come to her house this afternoon.", "clara_later", { effects: [flag("clara_visit"), add("objectivity", 1)] }),
  ]),

  scene("clara_go", p(
    "You get there first. “I’m the one they brought in from outside.”",
    "The word lands. “Outside,” she repeats. “Good. Good. Dad said…” She stops herself.",
  ), "d_clara_go"),

  decision("d_clara_go", "“Dad said…”", "She stopped herself mid-sentence.", [
    option("o_clara_said", "“Your father said what?”", "clara_said"),
    option("o_clara_statement", "Ask her to come back later for a proper statement.", "clara_statement", { effects: [add("t_clara", -1)] }),
  ]),

  scene("clara_said", p(
    "“He said it would be over soon. Last night. I brought him lamb from the place on Pell Street and he didn’t eat half of it, and he said, <em>It’ll be over soon, Clary,</em> and I thought he meant retiring.” Her voice cracks on the last word.",
  ), "clara_else", {
    routes: [{ conditions: [is("napkin")], to: "clara_napkin" }],
    notebook: [note("Clara: at dinner (around 20:00), Ames said “It’ll be over soon.”")],
  }),

  scene("clara_napkin", p("You think of the napkin in your pocket. <em>14 — L.</em>"), "d_clara_napkin"),

  decision("d_clara_napkin", "The napkin", "Grief makes people talk. In this building, talk travels.", [
    // Same line twice: if Brannigan is already watching, showing it costs you.
    option("o_napkin_show_watched", "Show her the napkin.", "clara_show",
      { visibleIf: [gte("heat", 2)], effects: [flag("knows_locker"), add("heat", 1)] }),
    option("o_napkin_show", "Show her the napkin.", "clara_show",
      { visibleIf: [lt("heat", 2)], effects: [flag("knows_locker")] }),
    option("o_napkin_keep", "Keep it to yourself, for now.", "clara_keep"),
  ]),

  scene("clara_show", p(
    "She stares at it. “That’s his writing.” She frowns. “Fourteen… his locker at the Y on Carver Street was fourteen. He’s had the same locker since I was a little girl. He’d never let anyone else have it.”",
  ), "clara_show_watched", { notebook: [note("Clara: Ames has had locker 14 at the Carver Street Y for decades.")] }),

  scene("clara_show_watched", p(
    "Over her shoulder, Brannigan is reading his paperback. He hasn’t turned a page since you came over.",
  ), "clara_invite", { conditions: [gte("heat", 3)] }),

  scene("clara_keep", p(
    "You leave it where it is. Grief makes people talk, and in this building talk travels.",
  ), "clara_invite"),

  scene("clara_else", p(
    "“Nothing else. He held my hand too long at the door. He never does that.” She wipes her face with the heel of her hand. “Did. Never did that.”",
  ), "clara_invite"),

  scene("clara_invite", p(
    "“Come to the house,” she says. “Twenty-two Hollis Road. I’ll tell you everything about my brother. Nobody here ever wanted to hear it.”",
  ), "desk_summary", { notebook: [note("Clara invited me to 22 Hollis Road to talk about her brother, Danny.")] }),

  scene("clara_statement", p(
    "“Later,” she repeats. “Everyone here says later.”",
    "She lets the uniform lead her to a bench, and she looks at you the way she must have looked at all of them, years ago, when nobody would listen about Danny.",
  ), "desk_summary"),

  scene("clara_lou", p(
    "Brannigan gets there with his arm already out, and steers her gently to a bench. “We’ll take care of you, love. We’ll get whoever did this. We will.”",
    "From across the lobby you watch him crouch beside her, nodding, listening hard. She’s telling him something. He’s very interested in it.",
  ), "desk_summary", { notebook: [note("Brannigan took Clara aside. She told him something. I don’t know what.")] }),

  scene("clara_later", p(
    "“Not here,” you say quietly. “I’ll come to you. This afternoon.”",
    "She starts to argue. Then she looks past you, at the lobby, at the officers pretending not to watch. Something in her understands.",
    "“Twenty-two Hollis Road,” she says. “After three. Come alone.”",
  ), "desk_summary", { notebook: [note("Visit Clara Ames at 22 Hollis Road, after 15:00. Alone.")] }),

  // ════════ 08:20 — What you have (each line appears only if you found it) ════════
  scene("desk_summary", p(
    "Marsh gives you a desk by the window, someone’s old one with the drawers emptied. You lay out what you have.",
    "It’s less than you’d like, and more than anyone in this building wanted you to have.",
  ), "sum_erasure", { label: "08:20 · A borrowed desk", title: "What You Have" }),

  scene("sum_erasure", p("The log has been rubbed out under Reyes’s line."), "sum_copy", { conditions: [is("noticed_erasure")] }),
  scene("sum_copy", p("The log, photocopied, says nothing at all. That’s its own kind of statement."), "sum_ledger", { conditions: [is("has_log_copy")] }),
  scene("sum_ledger", p("The ledger left its shelf days before Walter Ames died. So who moved it?"), "sum_gun", { conditions: [is("ledger_moved_early")] }),
  scene("sum_gun", p("A revolver from Frank Dellacourt’s old shooting walked out of a drawer last night, cut free with scissors."), "sum_two_falls", { conditions: [is("saw_gun_drawer")] }),
  scene("sum_two_falls", p("Walter Ames didn’t die of a single fall."), "sum_two_falls_b", { conditions: [is("hale_pressed")] }),
  scene("sum_two_falls_b", p("Walter Ames didn’t die of a single fall."), "sum_shelf", { conditions: [is("hale_fell_once")] }),
  scene("sum_shelf", p("The blood is on a shelf a metre from where the body lay."), "sum_watch",
    { conditions: [is("saw_shelf_blood"), not("hale_pressed"), not("hale_fell_once")] }),
  scene("sum_watch", p("His watch is gone, and nobody has mentioned it."), "sum_reyes", { conditions: [is("watch_missing")] }),
  scene("sum_reyes", p("Reyes timed her visit by her phone, and wanted you to know she was talking to someone."), "sum_frank", { conditions: [is("reyes_phone")] }),
  scene("sum_frank", p("Frank was in the building, and says he never went downstairs."), "sum_letter", { conditions: [is("frank_admits_visit")] }),
  scene("sum_letter", p("<em>Trust the ledger, not the log.</em> You’re starting to see why he wrote it."), "sum_close", { conditions: [is("letter_full")] }),

  scene("sum_close", p(
    "Four people this morning. Each of them told you something. At least three of them lied.",
  ), "d_first"),

  decision("d_first", "Who first?", "The order you talk to people in will change what they say to you.", [
    option("o_first_frank", "Detective Frank Dellacourt.", "first_frank_grief", { effects: [{ var: "first_interview", op: "set", value: "frank" }] }),
    option("o_first_reyes", "Detective Nadia Reyes.", "first_reyes_alerted", { effects: [{ var: "first_interview", op: "set", value: "reyes" }] }),
    option("o_first_lou", "Sergeant Lou Brannigan.", "first_lou_heat", { effects: [{ var: "first_interview", op: "set", value: "lou" }] }),
    option("o_first_clara", "Clara Ames.", "first_clara_locker",
      { visibleIf: [not("lou_with_clara")], effects: [{ var: "first_interview", op: "set", value: "clara" }] }),
  ]),

  // Frank
  scene("first_frank_grief", p(
    "You find him in the stairwell, sitting on a step, staring at nothing. He doesn’t get up. “Sit down, then,” he says, and moves his coat.",
  ), "first_frank_hand", { conditions: [is("frank_grief_real")] }),
  scene("first_frank_hand", p(
    "He’s put a new bandage on the hand since this morning. A smaller one. Less noticeable.",
  ), "first_frank_plain", { conditions: [is("frank_hand")] }),
  scene("first_frank_plain", p(
    "He sees you coming, and his face does the folksy thing before he’s said a word.",
  ), "closing_high", { conditions: [not("frank_grief_real"), not("frank_hand")] }),

  // Reyes
  scene("first_reyes_alerted", p(
    "She’s waiting for you at her desk with a typed timeline, two pages, in a plastic sleeve. She slides it across before you’ve sat down.",
  ), "first_reyes_phone", { conditions: [is("reyes_alerted")] }),
  scene("first_reyes_phone", p(
    "Her phone buzzes as you sit down. She looks at the screen, turns it face-down, and doesn’t answer it.",
  ), "first_reyes_plain", { conditions: [is("reyes_phone")] }),
  scene("first_reyes_plain", p(
    "She doesn’t look up from her screen. “Ten minutes,” she says. “I’m busy being a suspect.”",
  ), "closing_high", { conditions: [not("reyes_alerted"), not("reyes_phone")] }),

  // Brannigan
  scene("first_lou_heat", p(
    "The sign-in book is no longer on the counter. “Sent it up to records,” he says, before you ask. “Procedure. We want it safe.”",
  ), "first_lou_coffee", { conditions: [gte("heat", 3)] }),
  scene("first_lou_coffee", p(
    "He’s already pouring you a second cup. “Thought you’d come back,” he says. “Everyone does.”",
  ), "first_lou_plain", { conditions: [lt("heat", 3), is("coffee")] }),
  scene("first_lou_plain", p(
    "He takes his glasses off and folds them carefully. “Ask me anything,” he says. “We’re all on the same side here.”",
  ), "closing_high", { conditions: [lt("heat", 3), not("coffee")] }),

  // Clara
  scene("first_clara_locker", p(
    "You drive past the Carver Street Y on the way. Through the glass doors you can see the corridor to the locker room. You keep driving. For now.",
  ), "first_clara_plain", { conditions: [is("knows_locker")] }),
  scene("first_clara_plain", p(
    "Twenty-two Hollis Road is a narrow terraced house with the curtains drawn in the middle of the day.",
  ), "closing_high", { conditions: [not("knows_locker")] }),

  // How much attention you've drawn
  scene("closing_high", p(
    "Somewhere in the building, in a room you’re not in, someone is very quietly making a plan.",
  ), "closing_mid", { conditions: [gte("heat", 3)] }),
  scene("closing_mid", p(
    "Somewhere in the building, someone has started paying attention to you.",
  ), "closing_low", { conditions: [gte("heat", 1), lt("heat", 3)] }),
  scene("closing_low", p(
    "Nobody in this building is worried about you yet. That won’t last.",
  ), "end_intro", { conditions: [lt("heat", 1)] }),

  {
    id: "end_intro", type: "ending", content: "",
    endingTitle: "To Be Continued",
    endingText: "End of the intro. Chapter One picks up with the person you chose to talk to first, and everything you did this morning comes with you.",
  },
];

export function chainOfCustodyGraph(): InteractiveGraph {
  return {
    startNodeId: "opening",
    settings: {
      ...DEFAULT_SETTINGS,
      conclusionPrompt: "Before Chapter One: who in that building do you trust least so far, and why?",
    },
    nodes: JSON.parse(JSON.stringify(nodes)),
  };
}
