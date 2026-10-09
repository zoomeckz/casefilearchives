import {
  DEFAULT_SETTINGS,
  type Condition, type DecisionOption, type Effect, type InteractiveGraph, type NotebookEntry, type Route, type StoryNode,
} from "@/lib/interactive";

// "Chain of Custody" — Chapter 1: the intro (~20 minutes). Harrow Street
// Precinct, November 1974. The reader is an Internal Affairs investigator:
// nobody in the building wants them there. Loaded from the admin editor's
// template menu; every line, choice and variable stays editable there.
//
// This repository is public: the case solution is deliberately NOT written
// here. Keep it in the private story bible.
//
// Hidden variables
//   alarm          how much the building has noticed you (drives Brannigan and the endings)
//   coop_frank, coop_horvat, coop_lou, coop_marsh, coop_zora, coop_hale   cooperation (+ / −)
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
const setTo = (v: string, value: string): Effect => ({ var: v, op: "set", value });

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

interface DecisionExtra { timeLimit?: number; warning?: string; content?: string }

const decision = (id: string, title: string, context: string, options: DecisionOption[], extra: DecisionExtra = {}): StoryNode => ({
  id, type: "decision", title, content: extra.content ?? "", context, options,
  ...(extra.timeLimit ? { timeLimit: extra.timeLimit } : {}),
  ...(extra.warning ? { warning: extra.warning } : {}),
});

const option = (id: string, label: string, next: string, extra: Partial<DecisionOption> = {}): DecisionOption => ({
  id, label, next, ...extra,
});

const ending = (id: string, endingTitle: string, endingText: string): StoryNode => ({
  id, type: "ending", content: "", endingTitle, endingText,
});

// ── Evidence cage: three looks out of five, against the clock ──
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
    option("o_look_ledger", "Find the empty slot where the Kessler ledger was kept.", "cage_ledger",
      { effects: [flag("ledger_moved_early"), add("looks", 1)], ...hide("ledger_moved_early") }),
    option("o_look_gun", "Check the firearms drawer.", "cage_gun",
      { effects: [flag("saw_gun_drawer"), add("looks", 1)], ...hide("saw_gun_drawer") }),
    option("o_look_desk", "Go through Walt’s desk.", "cage_desk",
      { effects: [flag("napkin"), flag("watch_missing"), add("looks", 1)], ...hide("napkin") }),
  ];
  if (!firstRound) opts.push(option("o_look_done", "Step back and let Hale’s people work.", "cage_time_up"));
  return opts;
};

const nodes: StoryNode[] = [
  // ════════ 06:48 — Outside ════════
  scene("opening", p(
    "In this city they call Internal Affairs the rat squad, and they don’t say it behind your back. They say it to your face, in doorways, in elevators, in the men’s room, as if it were your rank.",
    "On Tuesday a complaint landed on your lieutenant’s desk in a Harrow Street Precinct envelope. Handwritten. Walter Ames, evidence custodian, thirty-one years in the same basement, asking for an IA investigator. Your lieutenant sat on it for two days.",
    "At 6:10 this morning they found Walter Ames on the floor of that basement. At 6:30 the precinct captain herself phoned IA and asked for <em>someone neutral</em>.",
    "You are what they sent. The letter is in your coat pocket. The precinct steps are still wet from the night, and the radiators in the windows above you are already knocking.",
  ), "d_letter", { label: "06:48 · Harrow Street · Tuesday, 12 November 1974", title: "The Rat Squad" }),

  decision("d_letter", "Before you go in", "A dead man asked for Internal Affairs. Nobody inside asked for you.", [
    option("o_letter_read", "Read the letter one more time.", "letter_read", { effects: [flag("letter_full")] }),
    option("o_letter_pocket", "Leave it in your pocket. Walk in clean.", "letter_pocket", { effects: [add("objectivity", 1)] }),
    option("o_letter_seal", "Seal it in an evidence envelope and sign across the flap.", "letter_seal",
      { effects: [flag("letter_sealed")], consequence: "The letter is now evidence, with your signature and the time across the seal." }),
  ]),

  scene("letter_read", p(
    "You read it under the streetlight. Blue ink, a careful hand, the hand of a man who did not trust his own writing with anything important.",
    "<em>I am writing to Internal Affairs because nobody in this building can look at this straight, and that includes me. There is a book that proves my son never took a dime. There are people here who would rather it burned. I am sending this through the front desk mail book, because that is the only way that counts as official. Somebody will see the envelope. Let them. If anything happens before you arrive: trust the ledger, not the log. — W. Ames</em>",
    "Squeezed into the margin, smaller than the rest: <em>P.S. Everyone here keeps very careful time. Ask yourself who needs to.</em>",
    "You fold it back along creases that are starting to wear through, and go up the steps.",
  ), "front_desk", { notebook: [
    note("Ames’s letter: “Trust the ledger, not the log.” P.S.: “Everyone here keeps very careful time. Ask yourself who needs to.”"),
    note("Ames sent his letter through the front desk mail book. “Somebody will see the envelope.”"),
  ] }),

  scene("letter_pocket", p(
    "You leave it where it is. Whatever Walter Ames believed, you’d rather meet the building before you meet his version of it.",
    "You go up the steps.",
  ), "front_desk"),

  scene("letter_seal", p(
    "Habit. In your line of work, the first thing anyone says about a document is that you forged it.",
    "You slide the letter into a manila evidence envelope, lick the flap, and write across the seal: <em>06:51, 12/11/74</em>, and your initials.",
    "You go up the steps.",
  ), "front_desk", { notebook: [evidence("Ames’s letter to IA, sealed in an evidence envelope at 06:51")] }),

  // ════════ 06:58 — Front desk ════════
  scene("front_desk", p(
    "The front desk is a fortress of scarred oak and carbon paper. Behind it sits a broad man in his fifties, reading glasses pushed up into grey hair, a cigarette burning itself out in a Ford Motor Company ashtray. The nameplate says SGT. L. BRANNIGAN.",
    "He looks at your shield for a long time before he looks at you.",
    "“IA.” He doesn’t lower his voice. “Rat squad’s up early.” Then, louder, for the benefit of the room: “Captain’s expecting you. Coffee? We’re all very helpful this morning. Captain’s orders.”",
    "At his elbow, a short wooden shelf of battered paperbacks with a handwritten card: TAKE ONE, LEAVE ONE.",
  ), "d_desk", { label: "06:58 · Front desk", title: "The Front Desk" }),

  decision("d_desk", "Sergeant Brannigan", "He’s holding the coffee pot. He’s also sitting on the sign-in book.", [
    option("o_desk_coffee", "Accept the coffee.", "desk_coffee", { effects: [flag("coffee"), add("coop_lou", 1), flag("heard_librarian")] }),
    option("o_desk_log", "Decline. Ask to see last night’s sign-in book.", "desk_log",
      { effects: [flag("saw_logbook"), add("alarm", 1)], consequence: "Brannigan noted what you asked for first." }),
    option("o_desk_room", "Say nothing for a moment. Take in the room.", "desk_room", { effects: [add("objectivity", 1), flag("noticed_polish"), flag("saw_mailbook")] }),
  ]),

  scene("desk_coffee", p(
    "He pours it into a chipped mug: HARROW ST. BOOK CLUB, EST. 1961. The coffee has been on the hotplate since midnight and tastes like it.",
    "“Frank Dellacourt and Walt had words last week. Loud ones. I’m not saying anything to <em>you</em>, understand. I’m saying it to the coffee.”",
    "You glance at the paperbacks.",
    "“I run the shelf. The young ones call me the Librarian.” He lights a fresh cigarette off the old one. “Somebody’s got to make them read something that isn’t a racing form.”",
  ), "captain", { notebook: [note("Brannigan runs the precinct’s paperback shelf. Nickname: “the Librarian.”")] }),

  scene("desk_room", p(
    "You let the silence sit. In a precinct, somebody always fills it.",
    "A corkboard: a retirement card for Walter Ames, TWO WEEKS!!, dense with signatures. A wall clock with a cracked face. The paperback shelf. Beside the stamp tray, the outgoing mail book, open. Every page is initialled at the bottom in green ink: <em>H.M.</em>",
    "And Brannigan’s shoes. Black, mirror-shined, the polish still tacky along the welt. Fresh, at the end of a night shift.",
    "“Long night, Sergeant?”",
    "“The longest.” He doesn’t look at you. “We all feel it.”",
  ), "captain", { notebook: [
    note("Brannigan’s shoes were freshly polished at the end of a night shift."),
    note("The outgoing mail book is initialled every day in green ink: “H.M.”"),
  ] }),

  scene("desk_log", p(
    "Something crosses his face, quick as a draught under a door.",
    "“Course. Rat squad wants the book, rat squad gets the book.” He slides a green, ledger-ruled log across the oak and keeps two fingers on the corner.",
    "Last night’s page is short. A Con Ed man, 19:30 to 19:55. W. AMES, custodian, in at 07:00 yesterday, never signed out. I. HORVAT, 22:15 in, 22:48 out.",
    "Then nothing until this morning. Brannigan’s fingers haven’t moved.",
  ), "d_log"),

  decision("d_log", "The sign-in book", "He wants it back. He’s already reaching.", [
    option("o_log_thumb", "Run your thumb down the page.", "log_thumb", { effects: [flag("noticed_erasure")] }),
    option("o_log_copy", "Ask him to run it through the Xerox.", "log_copy", { effects: [flag("has_log_copy")] }),
    option("o_log_back", "Hand it back. Thank him.", "log_back", { effects: [add("coop_lou", 1)] }),
  ], { timeLimit: 20 }),

  scene("log_thumb", p(
    "Just below Horvat’s line, the paper feels different. Softer, furred, like it’s been worked at with an ink eraser. Nothing you can read. Not in this light.",
    "“Something wrong?” Brannigan asks.",
  ), "d_log_thumb", { notebook: [note("Sign-in book: the paper just below Horvat’s entry has been rubbed with an eraser.")] }),

  decision("d_log_thumb", "“Something wrong?”", "Brannigan is watching your thumb.", [
    option("o_log_reading", "“Just reading.”", "log_reading"),
    option("o_log_touched", "“Has anyone touched this book since midnight?”", "log_touched",
      { effects: [add("alarm", 1)], consequence: "Brannigan will remember that question." }),
  ]),

  scene("log_reading", p(
    "“Just reading.”",
    "He nods. He doesn’t look away. He takes the book back and squares it against the edge of the desk.",
  ), "captain"),

  scene("log_touched", p(
    "“Only me.” His smile doesn’t move. “Chain of custody. We do it properly here, whatever they tell you downtown.”",
    "He takes the book back and squares it against the edge of the desk.",
  ), "captain"),

  scene("log_copy", p(
    "The Xerox in the back room takes four minutes to warm up and smells of hot toner. Brannigan stands over it the whole time.",
    "The copy is grey and clean. Very clean. A copier only sees ink.",
  ), "captain", { notebook: [evidence("Xerox of last night’s sign-in page")] }),

  scene("log_back", p(
    "You hand it back. “Thank you, Sergeant.”",
    "He blinks, as if politeness from IA were a trick he hasn’t seen before. “Third floor,” he says. “Captain’s waiting.”",
  ), "captain"),

  // ════════ 07:10 — Captain Marsh ════════
  scene("captain", p(
    "Captain Helen Marsh is the only person in the building who smiles at you. That alone should tell you something.",
    "Her office is warm, wood-panelled, tidy. An IBM Selectric sits on the return of her desk, humming, its cover off. A fresh pot of coffee. A box of files propping the door open.",
    "“I asked for IA,” she says, “because I have a dead employee in my basement and two detectives who would each like to see the other in a cell. If I investigate my own people, the papers say cover-up. If you do it, they say thorough.”",
    "She slides a parking garage stub across the blotter. Entry 23:41.",
    "“Frank Dellacourt’s car. Last night. He isn’t in the sign-in book.” She lets that sit. “I’m not telling you what to find. The department just needs it found quickly.”",
  ), "d_captain", { label: "07:10 · Captain Marsh’s office", title: "Captain Marsh", notebook: [evidence("Parking garage stub: Dellacourt’s car, entry 23:41")] }),

  decision("d_captain", "What do you tell the Captain?", "She asked for IA. She’s waiting to see what kind she got.", [
    option("o_cap_evidence", "“I go where the evidence goes. Including away from Dellacourt.”", "cap_evidence",
      { effects: [add("objectivity", 1), add("coop_marsh", -1)] }),
    option("o_cap_history", "“Tell me about Dellacourt and Ames.”", "cap_history",
      { effects: [add("coop_marsh", 1), add("objectivity", -1), flag("knows_danny")] }),
    // Same line twice: Brannigan overhears more if he came up with the coffee.
    option("o_cap_letter_coffee", "“Walter Ames wrote to IA before he died. Did you know?”", "cap_letter",
      { visibleIf: [is("coffee")], effects: [flag("told_marsh_letter"), add("alarm", 2)] }),
    option("o_cap_letter", "“Walter Ames wrote to IA before he died. Did you know?”", "cap_letter",
      { visibleIf: [not("coffee")], effects: [flag("told_marsh_letter"), add("alarm", 1)] }),
    option("o_cap_show", "Hand her the sealed letter and watch her read it through the window.", "cap_show",
      { lockedIf: [not("letter_sealed")], effects: [flag("told_marsh_letter"), flag("marsh_read_letter"), add("alarm", 2)],
        consequence: "Captain Marsh now knows exactly what Walter Ames wrote." }),
  ]),

  scene("cap_evidence", p(
    "She studies you for a long moment.",
    "“Good,” she says. “That’s what I’d say, in your chair.” It isn’t approval. It’s a note being made.",
  ), "d_office"),

  scene("cap_history", p(
    "She’s glad you asked. That should bother you more than it does.",
    "“Walt had a son. Danny. Patrolman, good kid, or everyone thought so. In ’71 he was fired for taking Kessler money. Eight months later he drove his Plymouth into the river.” She taps the parking stub. “Walt never believed it. Frank was Danny’s training officer. Frank testified.”",
    "“Do the arithmetic.”",
  ), "d_office", { notebook: [note("Danny Ames was fired in 1971 for taking Kessler money. Frank Dellacourt testified against him. Danny died eight months later.")] }),

  scene("cap_letter", p(
    "Marsh doesn’t move. “Did he,” she says.",
    "Not a question. Not surprise either. She reaches for her coffee and finds the cup already empty.",
  ), "cap_door_lou", { notebook: [note("When I mentioned Ames’s letter to IA, Marsh said “Did he.” She didn’t sound surprised.")] }),

  scene("cap_show", p(
    "You hold the envelope up, flap towards her, the time across the seal. She reads the address through the glassine window. Then she reads your initials. Then she reads the time.",
    "“Mail book,” she says quietly, to nobody. Then, to you: “Keep that somewhere safe.”",
  ), "cap_door_lou", { notebook: [note("Marsh, reading the envelope: “Mail book.” Then: “Keep that somewhere safe.”")] }),

  scene("cap_door_lou", p(
    "Behind you, the door is still propped open. Brannigan is standing in it with a cup of coffee for the Captain. You don’t know how long he’s been there.",
    "He sets it down without a word and goes.",
  ), "cap_door_steps", { conditions: [is("coffee")] }),

  scene("cap_door_steps", p(
    "Behind you the door is still propped open. Out in the corridor, footsteps that had stopped start moving again.",
  ), "d_office", { conditions: [not("coffee")] }),

  decision("d_office", "Her phone rings", "Marsh turns her chair to the window to take the call. You have a few seconds alone with her office.", [
    option("o_office_typewriter", "Look at the humming typewriter.", "office_typewriter", { effects: [flag("saw_selectric")] }),
    option("o_office_papers", "Read the papers on her blotter, upside down.", "office_papers", { effects: [flag("saw_roster"), add("alarm", 1)] }),
    option("o_office_wait", "Look at the window like a polite guest.", "office_wait", { effects: [add("coop_marsh", 1), add("objectivity", 1)] }),
  ], { timeLimit: 15 }),

  scene("office_typewriter", p(
    "An IBM Selectric II, the good model, cream-coloured, the kind the department doesn’t buy for anyone below captain. The golf-ball typeface is not the station’s Courier. It’s a slanted, elegant one you don’t recognise.",
    "The ribbon cartridge is brand new: the film in the window is clean, black, barely a line used. The white correction spool beside it is half full.",
    "Who changes a typewriter ribbon at six in the morning, on the day a man is found dead?",
  ), "captain_close", { notebook: [note("Marsh’s Selectric II: unusual slanted typeface, brand-new ribbon cartridge, half-used correction spool.")] }),

  scene("office_papers", p(
    "The top sheet is last night’s duty roster, signed in green ink: <em>H.M.</em> Brannigan alone on the desk from 22:00. The basement patrol that should walk past the cage at midnight is struck through. Beside it: <em>Not needed tonight. H.M.</em>",
    "Marsh’s chair begins to turn back. You look up a second too late, and she sees exactly where your eyes were.",
  ), "captain_close", { notebook: [evidence("Last night’s duty roster: midnight basement patrol cancelled, “Not needed tonight. H.M.”")] }),

  scene("office_wait", p(
    "You look out at the wet roofs of Harrow Street. Marsh finishes her call and turns back, and something in her shoulders has eased.",
    "“Thank you for that,” she says. You aren’t sure what you did.",
  ), "captain_close"),

  scene("captain_close", p(
    "She hands you a visitor’s badge and the basement key on a brass ring.",
    "“Dr. Hale is finishing up downstairs. My door is open.” She’s already reaching for her coffee. “And try not to start a war in my hallway.”",
  ), "hallway"),

  // ════════ 07:24 — The corridor ════════
  scene("hallway", p(
    "You hear them before you see them.",
    "“…signed in like a human being, Frank, which is more than…”",
    "“Keep your voice down.”",
    "They stop when you turn the corner. Two detectives standing a step too close to each other, both pretending they weren’t.",
    "Irena Horvat: thirties, dark blazer, hair scraped back, one of three women detectives in the building and the only one who isn’t typing somebody else’s reports. Frank Dellacourt: sixty or near it, big, gone soft at the edges, a fresh white bandage across the knuckles of his right hand.",
    "They both look at your badge. Frank’s lip curls. Horvat recovers first.",
    "“IA. Of course.” She doesn’t offer a hand. “For your notes: I was in the evidence cage last night from 22:17 to 22:46. The book says 22:15. The book is wrong.”",
  ), "d_horvat_time", { label: "07:24 · Second-floor corridor", title: "Twenty-Two Seventeen" }),

  decision("d_horvat_time", "Horvat has given you a time", "She corrected the log before anyone asked her to.", [
    option("o_horvat_point", "Point out that she’s being very precise.", "horvat_point",
      { effects: [flag("horvat_alerted"), add("coop_horvat", -1), add("coop_frank", 1)] }),
    option("o_horvat_jot", "Ignore it and just jot it down.", "horvat_jot",
      { effects: [flag("horvat_precision_noted")] }),
    option("o_horvat_pause", "Take a long pause and double-check the time.", "horvat_pause",
      { effects: [add("objectivity", 1), flag("clock_fast"), flag("horvat_payphone")] }),
  ]),

  scene("horvat_point", p(
    "“That’s very precise,” you say. “Most people round.”",
    "A beat. “Most people are sloppy.”",
    "But her hand has gone still on the strap of her bag.",
    "Frank laughs, short and ugly. “She does that. Time-stamps her own lunch. Write that down, rat.”",
    "Horvat looks at him the way you’d look at a stain. After that, every word she gives you is chosen.",
  ), "frank_turn_alerted", { notebook: [note("Horvat knows I noticed how precise she was. She’s guarded now.")] }),

  scene("horvat_jot", p(
    "You write it down. <em>22:17 to 22:46.</em> No underline. No look.",
    "She watches the pencil. Then she relaxes, very slightly, the way people do when they decide you’re the kind of investigator who writes things down and never thinks about them.",
    "Let her think that.",
  ), "frank_turn_alerted", { notebook: [note("Horvat, unprompted: “22:17 to 22:46. The book says 22:15. The book is wrong.”")] }),

  scene("horvat_pause", p(
    "You don’t write anything. You look up at the corridor clock, then down at your wristwatch.",
    "The corridor clock is three minutes fast.",
    "The silence stretches. Horvat fills it.",
    "“I went by my own watch. Not that thing. Everyone knows that clock is fast.” She shifts her bag to the other shoulder. “I made a call on the way out. Lobby payphone, ten to eleven. Personal.”",
    "Nobody asked her about a phone call. And there are four phones on this floor that cost nothing to use, except that every call on them goes through the switchboard log.",
  ), "frank_turn_alerted", { notebook: [
    note("The corridor clock runs three minutes fast."),
    note("Horvat volunteered that she called someone from the lobby payphone at 22:50. Station phones are logged by the switchboard. The payphone isn’t."),
  ] }),

  scene("frank_turn_alerted", p(
    "Frank turns on you. “Don’t mind her,” he says. “Walt was a friend, kid. Thirty years. You do what you need to.”",
  ), "frank_turn", { conditions: [is("horvat_alerted")] }),

  scene("frank_turn", p(
    "Frank turns on you. “Walt was a friend, kid,” he says. “Thirty years. You do what you need to. Rat.”",
  ), "d_frank", { conditions: [not("horvat_alerted")] }),

  decision("d_frank", "Detective Dellacourt", "Horvat is watching Frank. Frank is watching your notebook.", [
    option("o_frank_hand", "Ask about the bandage on his hand.", "frank_bandage",
      { effects: [flag("frank_hand"), add("coop_frank", -1)] }),
    option("o_frank_where", "Ask where he was last night.", "frank_where",
      { effects: [flag("frank_admits_visit"), add("coop_frank", -1)] }),
    option("o_frank_log", "Ask why his name isn’t in the sign-in book.", "frank_log",
      { lockedIf: [not("saw_logbook")], effects: [flag("frank_admits_visit"), flag("frank_note"), add("alarm", 1)],
        consequence: "Frank knows you’ve seen the book." }),
    option("o_frank_sorry", "Offer your condolences and leave it there.", "frank_sorry",
      { effects: [add("coop_frank", 1), flag("frank_grief_real")] }),
  ]),

  scene("frank_bandage", p(
    "He glances down at it like it belongs to someone else.",
    "“Caught it in a car door. Kid, at my age you bleed if the wind changes.”",
    "Horvat says nothing. She’s looking at his hand too.",
  ), "hallway_exit", { notebook: [note("Frank’s right knuckles are bandaged. Says he caught them in a car door.")] }),

  scene("frank_where", p(
    "“Home.” Fast. Then: “Mostly.”",
    "He glances at Horvat and seems to decide something.",
    "“I came by around half eleven. Left my reading glasses in my desk. Never went downstairs.”",
    "“You’re not in the book.”",
    "“Lou buzzed me in. Ask Lou.”",
  ), "frank_where_horvat", { notebook: [note("Frank admits coming in around 23:30 “for his reading glasses.” Says Brannigan let him in. Says he never went downstairs.")] }),

  scene("frank_where_horvat", p("Horvat’s eyes flick to the stairwell, then back."), "hallway_exit", { conditions: [gte("alarm", 1)] }),

  scene("frank_log", p(
    "His jaw works. For a second you think he’ll swing.",
    "“Because somebody put a note in my pigeonhole yesterday,” he says, low. “Typed. No name. <em>Walt’s handing the book to IA tonight. Your name’s in it.</em> So I came in. Lou let me in quiet, because Lou owes me. I wanted to talk to Walt. That’s all.”",
    "“Where’s the note?”",
    "“Burned it. What would you have done?” He looks at you with real hatred. “Typed nice, too. Fancy letters. Not the station machines.”",
  ), "hallway_exit", { notebook: [
    note("Frank got an anonymous typed note in his pigeonhole: “Walt’s handing the book to IA tonight. Your name’s in it.” He burned it."),
    note("Frank: the note was “typed nice. Fancy letters. Not the station machines.”"),
  ] }),

  scene("frank_sorry", p(
    "“I’m sorry for your loss.”",
    "He wasn’t ready for that, not from IA. For a second the whole act drops off him and he’s just an old man in a corridor that smells of floor wax.",
    "“Yeah,” he says. “Yeah. Me too.”",
    "Short. Nothing folksy about it. That one, you believe.",
  ), "hallway_exit", { notebook: [note("Frank’s grief looked real when I offered condolences.")] }),

  scene("hallway_exit", p(
    "Horvat is already walking away. “Hale’s waiting for you downstairs,” she says over her shoulder. “He doesn’t like waiting. Neither do I.”",
  ), "cage"),

  // ════════ 07:41 — The evidence cage ════════
  scene("cage", p(
    "The basement smells of dust and Lysol and something underneath both.",
    "The evidence cage is a long room of steel shelving behind a chain-link wall. The gate is propped open with a fire bucket. Above it hangs an electric wall clock, its cord pulled out of the socket and dangling. Its hands have stopped at 12:52.",
    "Walter Ames lies on his side between two shelving units, one arm folded under him. Grey cardigan. A brass watch chain loops from his waistcoat button down into his pocket.",
    "Dr. Yusuf Hale, the medical examiner, kneels beside him with the stillness of someone who has knelt beside a great many people. He doesn’t look up at your badge. He doesn’t need to.",
    "“IA,” he says. “You’ve got about ten minutes before my people bag everything that isn’t bolted down. Spend them well.”",
  ), "d_cage1", { label: "07:41 · Basement, evidence cage", title: "The Cage", notebook: [note("The cage’s wall clock was unplugged. It stopped at 12:52.")] }),

  decision("d_cage1", "Ten minutes", "You have time to look properly at three things. Hale’s people are on the stairs.", cageOptions(true), { timeLimit: 60 }),
  scene("cage_tick1", p("Hale’s assistant starts laying out brown paper evidence bags along the wall."), "d_cage2"),
  decision("d_cage2", "Keep looking", "Two more things. The bags are open.", cageOptions(false), { timeLimit: 45 }),
  scene("cage_tick2", p("“Five minutes,” Hale says."), "d_cage3"),
  decision("d_cage3", "One last look", "One more. Then it’s Hale’s room again.", cageOptions(false), { timeLimit: 30 }),

  scene("cage_wound", p(
    "Left side of the head, above and behind the ear. The grey hair is matted dark and stiff.",
    "“Bled for a while,” Hale says. “Longer than I’d expect, for where he’s lying.”",
  ), "d_wound"),

  decision("d_wound", "“Bled for a while”", "Hale hasn’t looked up.", [
    option("o_wound_long", "“How long is a while?”", "wound_long", { effects: [flag("hale_pressed"), add("coop_hale", -1)] }),
    option("o_wound_fell", "“Could he have just fallen?”", "wound_fell", { effects: [flag("hale_fell_once")] }),
    option("o_wound_quiet", "Say nothing. Let him work.", "wound_quiet", { effects: [add("coop_hale", 1), flag("hale_will_call")] }),
  ]),

  scene("wound_long", p(
    "He sighs through his nose. “An hour. Maybe more. And don’t write that down, I haven’t opened him yet.”",
    "You write it down.",
  ), "cage_time_up", { routes: afterLook, notebook: [note("Hale, unofficially: Ames bled for an hour or more before he died.")] }),

  scene("wound_fell", p(
    "Hale looks at the shelving, then at the wound, then, for the first time, at you.",
    "“He could have fallen,” he says. “Once.”",
  ), "cage_time_up", { routes: afterLook, notebook: [note("Hale: “He could have fallen. Once.”")] }),

  scene("wound_quiet", p(
    "You leave him to it. He notices. People who work with the dead tend to notice who lets them.",
    "“Call me after the post-mortem,” he says. “I don’t talk to IA. But I’ll have something for you.”",
  ), "cage_time_up", { routes: afterLook, notebook: [note("Hale will talk to me after the post-mortem.")] }),

  scene("cage_shelf", p(
    "The steel upright has a smear at about shoulder height, brown now, a few grey hairs caught in the joint. The box on the shelf below is dented in at one corner. Someone hit this hard, or was put into it hard.",
    "But the smear is high. And Walter Ames is lying a full yard away from it.",
  ), "cage_time_up", { routes: afterLook, notebook: [note("Blood and hair on a shelf upright at shoulder height. The body lies a yard away from it.")] }),

  scene("cage_ledger", p(
    "Shelf C-4. The typed inventory card is still taped to the steel: KESSLER, M. / ITEM 4471 / LEDGER, BOUND, x1.",
    "In the dust, a clean rectangle where it used to sit.",
    "Not quite clean, though. You tilt your head and catch the bulb’s light across it. A fine new skin of dust inside the rectangle. If the ledger had been taken last night, that patch would be bare.",
    "It’s been gone for days.",
  ), "cage_time_up", { routes: afterLook, notebook: [note("Dust has settled in the ledger’s empty slot. It was moved days ago, not last night.")] }),

  scene("cage_gun", p(
    "Drawer F-2 is shut but not locked. Inside, tagged handguns in a row of cardboard cut-outs. One cut-out is empty.",
    "The tag string is still tied to the drawer handle. Its end is cut clean. Scissors, not a tear.",
    "The drawer manifest names it: ITEM 2291 / REVOLVER .38 / DELLACOURT, F. — POLICE SHOOTING, 1969 — RULED JUSTIFIED.",
    "Whoever took it came prepared.",
  ), "cage_time_up", { routes: afterLook, notebook: [note("The .38 from Dellacourt’s 1969 shooting is missing. The tag string was cut with scissors.")] }),

  scene("cage_desk", p(
    "A small steel desk by the gate. A gooseneck lamp still burning. A retirement card. A foil takeaway tray with half a meal in it, lamb gone cold and grey.",
    "Folded under it, a paper napkin. On it, in pencil, in that same careful hand: <em>14 — L</em>",
    "As you straighten up you look back at the body and see what has been bothering you. The watch chain runs from his waistcoat button into his pocket. The pocket is flat.",
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
    "“Captain wants the basement locked until the lab’s done. Procedure,” he says, and holds out his hand for the brass key ring. “We’ll get you back down here soon as we can.”",
    "He doesn’t move out of the doorway until you’ve given it to him.",
  ), "cage_shout", { conditions: [gte("alarm", 3)], notebook: [note("The Captain had the basement locked “until the lab’s done.” Brannigan took back my key.")] }),

  scene("cage_shout", p("Somewhere above you, someone is shouting."), "zora"),

  // ════════ 08:02 — Zora ════════
  scene("zora", p(
    "A woman in her thirties is standing in the middle of the lobby with her coat buttoned wrong, shouting at a young patrolman who is backing away from her with his palms out.",
    "“I brought him dinner. I was <em>here</em>. I was here last night, and nobody in this building will tell me…”",
    "Zora Ames. You’d know it from the jaw alone.",
  ), "zora_lou_moving", { label: "08:02 · Lobby", title: "Zora Ames" }),

  scene("zora_lou_moving", p(
    "Brannigan is already coming round the end of the desk towards her, hand out, voice low and warm.",
  ), "zora_lou_reading", { conditions: [gte("alarm", 2)] }),

  scene("zora_lou_reading", p(
    "Behind the desk, Brannigan looks up from his paperback.",
  ), "d_zora", { conditions: [lt("alarm", 2)] }),

  decision("d_zora", "Zora Ames", "Every cop in the lobby is pretending not to watch. Brannigan is closer than you are.", [
    option("o_zora_go", "Go to her yourself.", "zora_go", { effects: [add("coop_zora", 1), flag("zora_met")] }),
    option("o_zora_lou", "Let Brannigan handle her.", "zora_lou",
      { effects: [flag("lou_with_zora"), add("alarm", 1), add("coop_zora", -1)], consequence: "Brannigan got to Zora Ames before you did." }),
    option("o_zora_later", "Catch her eye and mouth the word “later.”", "zora_later", { effects: [flag("zora_visit"), add("objectivity", 1)] }),
  ], { timeLimit: 30 }),

  scene("zora_go", p(
    "You get there first. You show her the shield, and for once it works in your favour.",
    "“IA,” she says. “Internal Affairs.” She almost laughs. “Dad wrote to you. He said you were the only ones in this city who get paid to dislike policemen. He said…” She stops herself.",
  ), "d_zora_go"),

  decision("d_zora_go", "“He said…”", "She stopped herself mid-sentence.", [
    option("o_zora_said", "“What did your father say?”", "zora_said"),
    option("o_zora_statement", "Ask her to come back later and give a proper statement.", "zora_statement", { effects: [add("coop_zora", -1)] }),
  ]),

  scene("zora_said", p(
    "“He said it would be over soon. Last night. I brought him lamb from the Greek place on Pell Street and he didn’t eat half of it, and he said, <em>It’ll be over soon, Zorka,</em> and I thought he meant retiring.” Her voice cracks on the last word.",
  ), "zora_else", {
    routes: [{ conditions: [is("napkin")], to: "zora_napkin" }],
    notebook: [note("Zora: at dinner (around 20:00), Ames said “It’ll be over soon.”")],
  }),

  scene("zora_napkin", p("You think of the napkin in your pocket. <em>14 — L.</em>"), "d_zora_napkin"),

  decision("d_zora_napkin", "The napkin", "Grief makes people talk. In this building, talk travels.", [
    // Same line twice: if Brannigan is already watching, showing it costs you.
    option("o_napkin_show_watched", "Show her the napkin.", "zora_show",
      { visibleIf: [gte("alarm", 2)], effects: [flag("knows_locker"), add("alarm", 1)] }),
    option("o_napkin_show", "Show her the napkin.", "zora_show",
      { visibleIf: [lt("alarm", 2)], effects: [flag("knows_locker")] }),
    option("o_napkin_keep", "Keep it to yourself, for now.", "zora_keep"),
  ]),

  scene("zora_show", p(
    "She stares at it. “That’s his writing.” She frowns. “Fourteen… his locker at the Y on Carver Street was fourteen. He’s had the same locker since I was a little girl. He’d never let anyone else have it.”",
  ), "zora_show_watched", { notebook: [note("Zora: Ames has had locker 14 at the Carver Street Y for decades.")] }),

  scene("zora_show_watched", p(
    "Over her shoulder, Brannigan is reading his paperback. He hasn’t turned a page since you came over.",
  ), "zora_invite", { conditions: [gte("alarm", 3)] }),

  scene("zora_keep", p(
    "You leave it where it is. Grief makes people talk, and in this building talk travels.",
  ), "zora_invite"),

  scene("zora_else", p(
    "“Nothing else. He held my hand too long at the door. He never does that.” She wipes her face with the heel of her hand. “Did. Never did that.”",
  ), "zora_invite"),

  scene("zora_invite", p(
    "“Come to the house,” she says. “Twenty-two Hollis Road. I’ll tell you everything about my brother. Nobody in that building ever wanted to hear it.”",
  ), "desk_summary", { notebook: [note("Zora invited me to 22 Hollis Road to talk about her brother, Danny.")] }),

  scene("zora_statement", p(
    "“Later,” she repeats. “Everyone here says later.”",
    "She lets the patrolman lead her to a bench, and she looks at you the way she must have looked at all of them, years ago, when nobody would listen about Danny.",
  ), "desk_summary"),

  scene("zora_lou", p(
    "Brannigan gets there with his arm already out and steers her gently to a bench. “We’ll take care of you, sweetheart. We’ll get whoever did this. We will.”",
    "From across the lobby you watch him crouch beside her, nodding, listening hard. She’s telling him something. He’s very interested in it. Then he takes her out to a squad car himself.",
  ), "desk_summary", { notebook: [note("Brannigan took Zora aside, listened hard, then drove her home himself.")] }),

  scene("zora_later", p(
    "Across the lobby, over the patrolman’s shoulder, you catch her eye and shape the word. <em>Later.</em>",
    "She goes quiet mid-sentence. She looks at your shield, at the cops pretending not to watch, and something in her understands. On her way out she drops a folded bus transfer on the floor by your shoe.",
    "On the back, in eyeliner pencil: <em>22 Hollis Rd. After 3. Alone.</em>",
  ), "desk_summary", { notebook: [evidence("Bus transfer from Zora Ames: “22 Hollis Rd. After 3. Alone.”")] }),

  // ════════ 08:20 — What you have (each line appears only if you found it) ════════
  scene("desk_summary", p(
    "Marsh has given you a desk in the squad room, somebody’s old one with the drawers emptied and a typewriter with a dead ribbon. Nobody looks at you. Everybody watches you.",
    "You lay out what you have.",
  ), "sum_erasure", { label: "08:20 · Squad room", title: "What You Have" }),

  scene("sum_erasure", p("The sign-in book has been rubbed out under Horvat’s line."), "sum_copy", { conditions: [is("noticed_erasure")] }),
  scene("sum_copy", p("The Xerox of the sign-in book says nothing at all. That’s its own kind of statement."), "sum_ledger", { conditions: [is("has_log_copy")] }),
  scene("sum_ledger", p("The ledger left its shelf days before Walter Ames died. So who moved it?"), "sum_gun", { conditions: [is("ledger_moved_early")] }),
  scene("sum_gun", p("A revolver from Frank Dellacourt’s old shooting walked out of a drawer last night, cut free with scissors."), "sum_falls", { conditions: [is("saw_gun_drawer")] }),
  scene("sum_falls", p("Walter Ames didn’t die of a single fall."), "sum_falls_b", { conditions: [is("hale_pressed")] }),
  scene("sum_falls_b", p("Walter Ames didn’t die of a single fall."), "sum_shelf", { conditions: [is("hale_fell_once")] }),
  scene("sum_shelf", p("The blood is on a shelf a yard from where the body lay."), "sum_watch",
    { conditions: [is("saw_shelf_blood"), not("hale_pressed"), not("hale_fell_once")] }),
  scene("sum_watch", p("His watch is gone, and nobody has mentioned it."), "sum_note", { conditions: [is("watch_missing")] }),
  scene("sum_note", p("Somebody typed Frank an invitation to the basement. On a better typewriter than the station owns."), "sum_selectric", { conditions: [is("frank_note")] }),
  scene("sum_selectric", p("The Captain changed her typewriter ribbon this morning. You keep coming back to that and you don’t know why."), "sum_roster", { conditions: [is("saw_selectric")] }),
  scene("sum_roster", p("The only patrol that would have walked past the cage at midnight was cancelled. In green ink."), "sum_horvat", { conditions: [is("saw_roster")] }),
  scene("sum_horvat", p("Horvat made a phone call she didn’t want logged, and wanted you to know she’d made it."), "sum_frank", { conditions: [is("horvat_payphone")] }),
  scene("sum_frank", p("Frank was in the building, and says he never went downstairs."), "sum_letter", { conditions: [is("frank_admits_visit")] }),
  scene("sum_letter", p("<em>Trust the ledger, not the log.</em> You’re starting to see why he wrote it."), "sum_close", { conditions: [is("letter_full")] }),

  scene("sum_close", p(
    "Five people this morning. Each of them told you something. Each of them hates what you are. At least three of them lied.",
  ), "d_first"),

  decision("d_first", "Who first?", "The order you talk to people in will change what they say to you.", [
    option("o_first_frank", "Detective Frank Dellacourt.", "first_frank_grief", { effects: [setTo("first_interview", "frank")] }),
    option("o_first_horvat", "Detective Irena Horvat.", "first_horvat_alerted", { effects: [setTo("first_interview", "horvat")] }),
    option("o_first_lou", "Sergeant Lou Brannigan.", "first_lou_alarm", { effects: [setTo("first_interview", "lou")] }),
    option("o_first_marsh", "Captain Helen Marsh.", "first_marsh", { effects: [setTo("first_interview", "marsh"), add("alarm", 1)] }),
    option("o_first_zora", "Zora Ames.", "first_zora_locker",
      { lockedIf: [is("lou_with_zora")], effects: [setTo("first_interview", "zora")] }),
  ], { warning: "This is the last decision of the intro. It will be filed to your record and cannot be changed." }),

  // Frank
  scene("first_frank_grief", p(
    "You find him in the stairwell, sitting on a step, staring at nothing. He doesn’t get up. “Sit down, then, rat,” he says, and moves his coat. It almost sounds friendly.",
  ), "first_frank_hand", { conditions: [is("frank_grief_real")] }),
  scene("first_frank_hand", p(
    "He’s put a new bandage on the hand since this morning. A smaller one. Less noticeable.",
  ), "first_frank_plain", { conditions: [is("frank_hand")] }),
  scene("first_frank_plain", p(
    "He sees you coming, and his face does the folksy thing before he’s said a word.",
  ), "closing_high", { conditions: [not("frank_grief_real"), not("frank_hand")] }),

  // Horvat
  scene("first_horvat_alerted", p(
    "She’s waiting for you at her desk with a typed timeline, two pages, carbon copy attached. She slides it across before you’ve sat down.",
  ), "first_horvat_phone", { conditions: [is("horvat_alerted")] }),
  scene("first_horvat_phone", p(
    "Her desk phone rings as you sit down. She looks at it, lets it ring four times, and doesn’t answer.",
  ), "first_horvat_plain", { conditions: [is("horvat_payphone")] }),
  scene("first_horvat_plain", p(
    "She doesn’t look up from her typewriter. “Ten minutes,” she says. “I’m busy being a suspect.”",
  ), "closing_high", { conditions: [not("horvat_alerted"), not("horvat_payphone")] }),

  // Brannigan
  scene("first_lou_alarm", p(
    "The sign-in book is no longer on the desk. “Sent it up to the Captain,” he says, before you ask. “Procedure. We want it safe.”",
  ), "first_lou_coffee", { conditions: [gte("alarm", 3)] }),
  scene("first_lou_coffee", p(
    "He’s already pouring you a second cup. “Thought you’d come back,” he says. “They always do.”",
  ), "first_lou_plain", { conditions: [lt("alarm", 3), is("coffee")] }),
  scene("first_lou_plain", p(
    "He takes his glasses off and folds them carefully. “Ask me anything,” he says. “We’re all on the same side here. Even you.”",
  ), "closing_high", { conditions: [lt("alarm", 3), not("coffee")] }),

  // Marsh
  scene("first_marsh", p(
    "Her door is open, as promised. The Selectric is quiet now, its cover back on. She smiles at you as you knock, the only smile in the building, and pours you a coffee before you’ve asked.",
  ), "closing_high"),

  // Zora
  scene("first_zora_locker", p(
    "You drive past the Carver Street Y on the way. Through the glass doors you can see the corridor to the locker room. You keep driving. For now.",
  ), "first_zora_plain", { conditions: [is("knows_locker")] }),
  scene("first_zora_plain", p(
    "Twenty-two Hollis Road is a narrow brick row house with the curtains drawn in the middle of the day.",
  ), "closing_high", { conditions: [not("knows_locker")] }),

  // How much attention you've drawn decides which ending is filed. A skipped
  // scene passes straight to its "next"; a shown one takes its route first.
  scene("closing_high", p(
    "Somewhere upstairs, in a room you’re not in, someone is very quietly making a plan.",
  ), "closing_mid", { conditions: [gte("alarm", 3)], routes: [{ conditions: [gte("alarm", 3)], to: "end_watched" }] }),
  scene("closing_mid", p(
    "Somewhere in the building, someone has started paying attention to you.",
  ), "closing_low", { conditions: [gte("alarm", 1), lt("alarm", 3)], routes: [{ conditions: [gte("alarm", 1)], to: "end_noticed" }] }),
  scene("closing_low", p(
    "Nobody in this building is worried about you yet. That won’t last.",
  ), "end_unseen", { conditions: [lt("alarm", 1)] }),

  ending("end_watched", "Doors Closing",
    "By noon the building has decided what you are. Records are being moved. Keys are being collected. Whatever you found this morning, you will have to fight to see it again."),
  ending("end_noticed", "Noted",
    "You have their attention now, and not all of it is hostile. Some doors are closing. One or two are opening a crack. Chapter Two picks up with the person you chose."),
  ending("end_unseen", "Unseen",
    "You moved through the building like weather, and nobody thought to lock anything. That won’t last. Chapter Two picks up with the person you chose."),
];

export function chainOfCustodyGraph(): InteractiveGraph {
  return {
    startNodeId: "opening",
    settings: {
      ...DEFAULT_SETTINGS,
      // One attempt per account; admins can still replay to test.
      replay: "admin_only",
      maxAttempts: 1,
      guestAccess: "two_choices",
      endingVisibility: "own",
      conclusionPrompt: "Interim report for Internal Affairs: who in that building do you suspect, and what would you look at next?",
    },
    nodes: JSON.parse(JSON.stringify(nodes)),
  };
}
