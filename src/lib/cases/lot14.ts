import {
  DEFAULT_SETTINGS,
  type Condition, type DecisionOption, type Effect, type InteractiveGraph, type MapPlacement, type NotebookEntry, type Route, type StoryNode,
} from "@/lib/interactive";

// "Lights Out at the Meridian: Lot 14". Interactive Case File, 1974.
// Four separate investigations that play differently:
//   A · The Body      forensic: examine, collect physical evidence, rebuild the timeline
//   B · The Room      interrogation: interview in rounds, read each statement, build doubt
//   C · The Money     paper trail: documents, a combination lock, the switchboard, the safe
//   D · The Painting  pursuit: fast timed choices across the hotel and the city
// The paths only meet at the very end (Platform 4 or Pier 9), and each one proves
// what happened with its own evidence. 10 endings; each path reaches only some.
// Loaded from the admin editor's template menu (lazy-loaded, so readers never
// download it). This repository is public: the solution is deliberately NOT
// written here. Keep it in the private story bible.

const p = (...paras: string[]) => paras.map((t) => `<p>${t}</p>`).join("");
const is = (v: string): Condition => ({ var: v, op: "truthy" });
const not = (v: string): Condition => ({ var: v, op: "falsy" });
const gte = (v: string, n: number): Condition => ({ var: v, op: "gte", value: String(n) });
const lt = (v: string, n: number): Condition => ({ var: v, op: "lt", value: String(n) });
const eq = (v: string, n: number): Condition => ({ var: v, op: "eq", value: String(n) });
const pathIs = (path: "a" | "b" | "c" | "d"): Condition => ({ var: "path", op: "eq", value: path });
const flag = (v: string): Effect => ({ var: v, op: "set", value: "true" });
const add = (v: string, n: number): Effect => ({ var: v, op: "add", value: String(n) });
const setPath = (path: "a" | "b" | "c" | "d"): Effect => ({ var: "path", op: "set", value: path });
const give = (item: string): Effect => ({ var: `item_${item}`, op: "set", value: "1" });
const note = (text: string): NotebookEntry => ({ kind: "note", text });
const evidence = (text: string): NotebookEntry => ({ kind: "evidence", text });

interface SceneExtra { label?: string; title?: string; routes?: Route[]; notebook?: NotebookEntry[]; conditions?: Condition[] }
const scene = (id: string, content: string, next: string, extra: SceneExtra = {}): StoryNode => ({ id, type: "narrative", content, next, ...extra });
const decision = (id: string, title: string, context: string, options: DecisionOption[], timeLimit?: number): StoryNode => ({
  id, type: "decision", title, context, content: "", options, ...(timeLimit ? { timeLimit } : {}),
});
let optSeq = 0;
const option = (label: string, next: string, extra: Partial<DecisionOption> = {}): DecisionOption => ({ id: `o${++optSeq}`, label, next, ...extra });
/** Item choice: only for readers carrying the item (drawn in the item's colour, redacted for everyone else). */
const needs = (item: string, more: Condition[] = []): Partial<DecisionOption> => ({ requiresItem: item, visibleIf: [is(`item_${item}`), ...more] });
const ending = (id: string, endingTitle: string, endingText: string, content: string): StoryNode => ({ id, type: "ending", content, endingTitle, endingText });

// After each look in the body path, go to the next round, or to the reconstruction.
const afterLookA: Route[] = [
  { conditions: [eq("looks", 1)], to: "a_tick1" },
  { conditions: [eq("looks", 2)], to: "a_tick2" },
];
const lookOptionsA = (round: 1 | 2 | 3): DecisionOption[] => {
  const hide = (v: string) => (round === 1 ? {} : { visibleIf: [not(v)] });
  const opts: DecisionOption[] = [
    option("Kneel down and examine the body.", "a_body", { effects: [flag("a_body"), add("looks", 1), give("watch")], ...hide("a_body") }),
    option("Climb to the landing he fell from.", "a_landing", { effects: [flag("a_landing"), add("looks", 1), give("lace")], ...hide("a_landing") }),
    option("Question the porter at the top of the stairs.", "a_porter", { effects: [flag("teddy_met"), add("looks", 1)], ...hide("teddy_met") }),
    option("Go through his pockets.", "a_pockets", { effects: [flag("a_pockets"), add("looks", 1)], ...hide("a_pockets") }),
  ];
  if (round === 1) opts.push(option("Let Dr Pell have him. A drunk man and a dark staircase.", "end_accident"));
  else opts.push(option("That's enough. Let Dr Pell's men take him up.", "a_reconstruct"));
  return opts;
};

// The way each path proves it at the end, with that path's own evidence. Each
// path gets its own final decision, so readers only ever see their own proof
// (redacted if they are missing a piece of it).
type PathKey = "a" | "b" | "c" | "d";
const proofOption = (path: PathKey): DecisionOption => ({
  a: option("Lay it out: the watch somebody set, the lace from the rail, the card in violet ink.", "end_celeste",
    needs("watch", [is("item_lace"), is("item_card")])),
  b: option("Lay it out: Mrs Fairweather's notes, Felix's last page, and the new glove on her left hand.", "end_celeste",
    needs("programme", [is("item_sketch")])),
  c: option("Lay it out: the telegram, the house ledger, and the switchboard carbon.", "end_celeste",
    needs("telegram", [is("item_ledger"), is("item_slip")])),
  d: option("Lay it out: the moth on the copy, the luggage ticket, and what Teddy told you.", "end_celeste",
    needs("polaroid", [is("item_ticket"), is("teddy_talked")])),
})[path];
const pathRoutes = (prefix: string, paths: PathKey[]): Route[] => paths.map((k) => ({ conditions: [pathIs(k)], to: `${prefix}_${k}` }));
const platformDecision = (path: PathKey): StoryNode => decision(`d_platform_${path}`, "Platform 4", "The guard is lifting his whistle.", [
  proofOption(path),
  option("Forget her. Get that trunk off the train.", "end_trunk"),
  option("Accuse her of murder, here and now, and hope she breaks.", "end_train"),
], 25);
const harbourDecision = (path: PathKey): StoryNode => decision(`d_harbour_${path}`, "Pier 9", "The gangway is rising.", [
  proofOption(path),
  option("Stop the crane. Get the trunk.", "end_trunk"),
  option("Shout her name across the water.", "end_train"),
], 25);

const nodes: StoryNode[] = [
  // ════════ OPENING ════════
  scene("opening", p(
    "The Hotel Meridian has been dying elegantly for thirty years. Tonight it put on its pearls for the annual charity auction: three hundred guests in the Lantern Room, a string quartet, champagne on silver, and one painting everybody came to see. <em>The Lantern Girl</em>, Ilse Marrow, 1923. Lot 14, the last lot of the night.",
    "At 22:40 the lights went out. Four minutes of darkness, a few screams, a lot of laughter. When the chandeliers came back, the auction carried on as if nothing had happened, and at 22:51 Lot 14 sold for forty-one thousand dollars. A record for the house.",
    "At 22:47, somewhere under all that applause, a night porter found a man at the bottom of the service stairs with his neck broken.",
    "His name is Felix Amsel. He was a painter, and a guest, and nobody can tell you what he was doing below stairs. On the telephone, the manager has already used the word <em>accident</em> four times.",
    "You are the only detective sergeant on duty in the harbour district tonight. You have until the guests get their coats. After that, three hundred witnesses become three hundred taxis.",
  ), "d_start", {
    title: "Lot 14", label: "23:04 · Hotel Meridian, the harbour front · Saturday, 16 November 1974",
    notebook: [
      evidence("Lights out in the Lantern Room from 22:40 to 22:44."),
      evidence("Felix Amsel, painter, found dead at the foot of the B2 service stairs at 22:47."),
      note("Lot 14, The Lantern Girl (Ilse Marrow, 1923), the last lot of the night, sold at 22:51 for $41,000."),
    ],
  }),

  decision("d_start", "Where do you start?", "You can only be in one place at a time, and the hotel will not wait for you.", [
    option("The body. Go down to the service stairs and read what the dead can tell you.", "a_stairs",
      { effects: [setPath("a")], description: "A slow, careful examination. Evidence, timings, small details." }),
    option("The room. Three hundred witnesses are about to go home. Make them talk.", "b_room",
      { effects: [setPath("b")], description: "Conversation. Read people, catch the lies, decide who to believe." }),
    option("The money. Go up to the man who owns all of this, and follow the paper.", "c_hale",
      { effects: [setPath("c")], description: "Documents, numbers and locks. A paper chase." }),
    option("The painting. Lot 14 is being crated for its buyer. Get to it before it leaves.", "d_stage",
      { effects: [setPath("d")], description: "A race against the clock, across the hotel and the city." }),
  ]),

  // ════════════════════════════════════════════════════════════════════
  // A · THE BODY
  // ════════════════════════════════════════════════════════════════════
  scene("a_stairs", p(
    "The service stairs are bare concrete and hospital-green paint, lit by one caged bulb. Felix Amsel lies at the bottom where the stairs turn, one arm folded under him, as if he tried to catch the floor and missed.",
    "He is somewhere in his forties, in a dinner jacket a size too hopeful. Paint under his fingernails, lantern yellow and Prussian blue. He smells of turpentine, and very faintly of gin. There is a gash at his temple, and the iron rail above him has a dark smear on its edge. His wristwatch has stopped at 22:42, the glass shattered.",
    "The house doctor, Dr Pell, has his bag closed and his coat on. “He'd had a drink, the lights went out, he missed his footing. It happens.” The manager, Mr Lindqvist, nods so hard his glasses slip. “Ten minutes, Sergeant,” says Dr Pell. “Then he goes to the cold room. The guests mustn't see a stretcher.”",
    "At the top of the stairs a big porter in a grey uniform stands very still, the way people stand when they would like to be furniture.",
  ), "d_a_look1", {
    title: "The Body", label: "23:09 · Service stairs B2, the bottom flight",
    notebook: [evidence("Felix's watch stopped at 22:42, the glass smashed."), note("Dr Pell, the house doctor: a man who'd been drinking fell in the dark.")],
  }),

  decision("d_a_look1", "Ten minutes", "Dr Pell is watching the clock. You have time to look properly at three things.", lookOptionsA(1), 50),
  scene("a_tick1", p("Dr Pell looks at his watch, then at you. “Five minutes, Sergeant.”"), "d_a_look2"),
  decision("d_a_look2", "Five minutes", "Two more things, if you're quick.", lookOptionsA(2), 40),
  scene("a_tick2", p("Two porters arrive at the top of the stairs with a stretcher and a folded sheet."), "d_a_look3"),
  decision("d_a_look3", "The stretcher", "One more look. Then he's gone.", lookOptionsA(3), 30),

  scene("a_body", p(
    "You kneel. Up close, death is always smaller than you expect.",
    "The gash at his temple matches the rail. Fine. But when you open his shirt there is a second bruise, high on the chest, already darkening: the flat, spread shape of a palm. Dr Pell sees it too, and stops buttoning his coat. “That was made standing up,” he says quietly. “By a hand.”",
    "Then the watch. The glass is smashed, the hands say 22:42, and the winding crown is pulled all the way out. A watch stops when it breaks. It does not pull out its own crown. Somebody set this watch to a time they liked, and then broke it. You slip it into an envelope.",
  ), "a_reconstruct", {
    routes: afterLookA, label: "23:12 · Foot of the stairs",
    notebook: [evidence("A bruise on Felix's chest, the shape of a hand. He was pushed."), evidence("The watch was set to 22:42 and then broken: its crown is pulled out.")],
  }),

  scene("a_landing", p(
    "Eleven steps up, the stairs turn at a small landing beside a door marked <strong>STORAGE · B2</strong>. This is where he fell from. You can see it in the dust, swept clean in one long curve by a sleeve.",
    "On the iron rail, caught on a burr in the metal, a single thread of black lace. Not cheap lace. The kind that comes on a pair of evening gloves. You lift it off with your tweezers.",
    "On the wall at shoulder height, a smear of varnish with a hair of lantern yellow in it, still tacky. Someone carried a freshly varnished painting past this spot tonight, close enough to kiss the wall. The storage door is ajar, and the air behind it smells of turpentine.",
  ), "a_reconstruct", {
    routes: afterLookA, label: "23:13 · The landing, eleven steps up",
    notebook: [evidence("A thread of black evening-glove lace on the rail at the landing where Felix fell."), evidence("Tacky varnish on the landing wall: a freshly varnished painting was carried past tonight.")],
  }),

  scene("a_porter", p(
    "The porter's brass badge says <em>T. Sorensen</em>. Teddy. He is the size of a wardrobe and the colour of milk.",
    "“Found him after the lights came back,” he says. “Quarter to eleven, near enough. I come down for more chairs and there he was.” He says it like a man reading something he wrote on his hand.",
    "His sleeves are damp to the elbow. He smells of laundry starch. There are fresh scratches across both palms, rows of little parallel lines, the kind you get from wrestling with something that has tacks in it. When he sees you looking, his hands go into his pockets. “Can I go? I'm on duty. Mr Lindqvist will have my job.”",
  ), "a_reconstruct", {
    routes: afterLookA, label: "23:11 · Top of the service stairs",
    notebook: [note("Teddy Sorensen, night porter, says he found the body 'after the lights came back'."), evidence("Fresh scratches on Teddy's palms, as if from tacks or a picture frame.")],
  }),

  scene("a_pockets", p(
    "Wallet: eleven dollars and a pawn ticket for a paintbox. A guest card: <em>Mr F. Amsel, guest of Varga &amp; Daughters</em>. A Meridian bar matchbook with a note pencilled inside the flap in his own cramped hand: <em>½ past. Stairs.</em>",
    "On the side of his right hand, a smudge of violet ink, the kind that comes from shaking a hand that has just been writing.",
  ), "a_reconstruct", {
    routes: afterLookA, label: "23:12 · Foot of the stairs",
    notebook: [evidence("Matchbook in Felix's pocket, in his hand: '½ past. Stairs.' He went down to meet someone at 22:30."), note("Felix was a guest of Varga & Daughters. Violet ink on his right hand.")],
  }),

  scene("a_reconstruct", p(
    "Dr Pell's men take him up in a sheet. The bulb buzzes. The quartet starts again somewhere above you, muffled, like a party in another building.",
    "You stay, and do the thing nobody upstairs has time for. You put the night back together, minute by minute, on the back of a laundry docket.",
  ), "d_a_time", { label: "23:24 · Bottom of the B2 stairs" }),

  decision("d_a_time", "The time of death", "Everything upstairs depends on one number.", [
    option("22:42, in the dark. The watch says so.", "a_dark", { effects: [flag("believed_watch")] }),
    option("Before the lights went out. Somebody set that watch.", "a_before", { lockedIf: [not("item_watch")] }),
    option("You can't prove anything. Sign it off as an accident.", "end_accident"),
  ]),

  scene("a_dark", p(
    "If he died at 22:42, he died in the dark, when nobody could see the stairs. Which means nobody saw him fall, or nobody saw who was standing over him.",
    "Somebody made the dark. That much is certain: storms don't come on cue at a charity auction.",
  ), "d_a_dark", { label: "23:26 · Bottom of the B2 stairs" }),

  decision("d_a_dark", "In the dark", "Who was near him when the lights were out?", [
    option("Nobody. He fell. Write it up as misadventure.", "end_accident"),
    option("The porter who 'found' him. Charge Teddy Sorensen.", "end_teddy", { visibleIf: [is("teddy_met")] }),
    option("Find out who made it dark. The fuse room can't be far from the stage.", "a_fuse"),
  ]),

  scene("a_before", p(
    "Somebody stood over him with the lights on and turned the hands to 22:42, to put his death inside the dark. Which means somebody knew there would be a dark.",
    "You write the times in a column. <em>22:30, stairs. 22:40, lights out. 22:47, found.</em> Somewhere in that column is a person.",
  ), "d_a_before", { label: "23:26 · Bottom of the B2 stairs", notebook: [note("Felix died before the blackout. Whoever set his watch knew the lights would go out at 22:40.")] }),

  decision("d_a_before", "Before the dark", "Every door out of this staircase leads somewhere.", [
    option("Find out who planned the dark: the fuse room behind the stage.", "a_fuse"),
    option("Open the storage room on the landing.", "a_storage"),
    option("Find the glove that lost this lace.", "a_glove", needs("lace")),
    option("Take the matchbook up to the bar. Who sent him to the stairs?", "a_bar", { visibleIf: [is("a_pockets")] }),
  ]),

  scene("a_bar", p(
    "The Lantern Room bar is three deep in guests who want one more before the coats. The barman, Rudi, remembers the matchbook because he remembers everything that isn't paid for.",
    "“Telephone call for Mr Amsel, 22:26, on the bar line,” he says. “A lady. She said, ‘Tell him the stairs, half past.’ I told him. He wrote it in that matchbook and went out by the little door next to the stage at 22:28.” He taps the bar. “Didn't finish his gin. One gin all night, and he left half of it.”",
  ), "d_a_bar", {
    label: "23:29 · The Lantern Room bar",
    notebook: [evidence("Rudi the barman: at 22:26 a woman telephoned for Felix: 'Tell him the stairs, half past.' He left at 22:28, after one gin.")],
  }),

  decision("d_a_bar", "The bar", "Rudi is already pouring for someone else.", [
    option("Ask what the lady's voice sounded like.", "a_bar_voice"),
    option("Thank him. The fuse room is ten steps from the stage.", "a_fuse"),
    option("Thank him. Back down to the storage room on the landing.", "a_storage"),
  ]),

  scene("a_bar_voice", p(
    "Rudi thinks about it while he shakes a cocktail. “Like somebody selling something expensive,” he says, “to somebody who can't afford it.”",
    "You know only one person in this building who sells things for a living.",
  ), "a_fuse", { label: "23:30 · The Lantern Room bar", notebook: [note("Rudi: the woman on the phone sounded 'like somebody selling something expensive'.")] }),

  scene("a_fuse", p(
    "The fuse room is a hot cupboard behind the stage, full of humming and old cobwebs: ten steps from the easel, three from the top of the B2 stairs. The main breaker has been thrown by hand; you can see the grey crescent of a thumbprint on the lever. Storms don't leave thumbprints.",
    "On a nail beside the board hangs a porter's cap with <em>T. SORENSEN</em> inked inside the band. Tucked into the band, a small card in violet ink: <em>22:40. Count to 240. Then back on.</em>",
    "Somebody planned four minutes of darkness down to the second. And somebody else is coming down the corridor right now, heavy and in no hurry.",
  ), "d_a_fuse", {
    label: "23:30 · Fuse cupboard behind the stage",
    notebook: [evidence("The main breaker was thrown by hand."), evidence("Card in violet ink in Teddy Sorensen's cap: '22:40. Count to 240. Then back on.'")],
  }),

  decision("d_a_fuse", "Footsteps", "Someone is coming back for his cap.", [
    option("Take the card. Kill your torch and wait for him in the dark.", "a_teddy", { effects: [give("card")] }),
    option("Take the card and slip out to the storage room on the landing.", "a_storage", { effects: [give("card")] }),
    option("Leave everything. When he walks in, charge him.", "end_teddy"),
  ], 25),

  scene("a_teddy", p(
    "The door opens. A big shape fills it, reaches for the nail, and finds nothing. You switch on your torch.",
    "Teddy Sorensen doesn't run. He sits down on an upturned crate as if somebody cut his strings. “I knew,” he says. “I knew someone would come. I just thought it'd be her.”",
  ), "d_a_teddy", { label: "23:33 · Fuse cupboard" }),

  decision("d_a_teddy", "The porter", "Scared men either talk or lie.", [
    option("Show him the card. Ask who wrote it.", "a_teddy_talks", { ...needs("card"), effects: [flag("teddy_talked")] }),
    option("Show him the broken watch. Ask what time he really found Felix.", "a_teddy_talks", { ...needs("watch"), effects: [flag("teddy_talked")] }),
    option("That's enough. Charge him with Felix Amsel's death.", "end_teddy"),
  ], 30),

  scene("a_teddy_talks", p(
    "Teddy stares at what you're holding for a long time. Then he starts talking, fast, like a man who has been holding his breath since half past ten.",
    "“Miss Varga. Five hundred dollars. At ten past ten I brought the other painting up from storage and stood it behind the curtain. At twenty to eleven I throw the switch, walk ten steps to the easel, swap the frames, count to two hundred and forty, lights back on. Then the laundry: cut the real one off its stretcher, roll it, trunk, van, station. The one-fifteen.”",
    "He swallows. “I came down to the fuse cupboard a minute early. I looked down the stairs and he was already lying there, Sergeant. With the lights on. Before I'd touched anything. She never said there'd be a man on the stairs.” He looks at his hands. “She's on that train. She's going with it.”",
  ), "d_a_after", {
    label: "23:36 · Fuse cupboard",
    notebook: [evidence("Teddy: Celeste Varga hired him to swap the frames in the blackout and ship the original on the 01:15."), evidence("Teddy saw Felix already dead at 22:39, with the lights on.")],
  }),

  decision("d_a_after", "A statement", "Teddy will sign whatever you put in front of him.", [
    option("Central Station. The 01:15.", "f_station"),
    option("First, find the glove that lost this lace.", "a_glove", needs("lace")),
    option("Phone the coast police to stop the train, and stay with your witness.", "end_train"),
  ]),

  scene("a_storage", p(
    "Storage B2 is crates, gilt chairs and thirty years of Christmas decorations. In the middle stands a tall crate stencilled <em>MERIDIAN FINE ART · VIA LISBON · FRAGILE</em>.",
    "The lid has been prised off and leaned against the wall. Inside: straw, a felt lining, and nothing else. The straw smells sharply of turpentine. On the shipping label, in violet ink: <em>Consigned by C. Varga.</em>",
    "From the door, two black wheel-scuffs run across the landing and along the service corridor towards the laundry.",
  ), "d_a_storage", {
    label: "23:38 · Storage B2",
    notebook: [evidence("An empty crate in Storage B2, opened tonight, smelling of turpentine. Label in violet ink: consigned by C. Varga.")],
  }),

  decision("d_a_storage", "The empty crate", "Whatever was in here went somewhere on wheels.", [
    option("Follow the wheel tracks to the laundry.", "a_laundry"),
    option("Go up to the auctioneer's office on the mezzanine.", "a_glove"),
  ]),

  scene("a_laundry", p(
    "The laundry is steam, pipes and folded sheets. On the sorting table lies an empty wooden stretcher, a few threads of old canvas still tacked to its edges. Somebody cut a painting off this frame and rolled it up in here.",
    "On a hook hangs a porter's jacket. In the pocket, a railway timetable with the 01:15 night train to the coast circled twice.",
  ), "d_a_laundry", {
    label: "23:45 · Laundry room",
    notebook: [evidence("Empty stretcher in the laundry: an old canvas was cut off it here."), evidence("Porter's jacket: the 01:15 night train circled twice.")],
  }),

  decision("d_a_laundry", "The stretcher", "A painting left this room rolled up like a newspaper.", [
    option("Central Station. Now.", "f_station"),
    option("First, find the glove that lost this lace.", "a_glove", needs("lace")),
    option("Bag the stretcher and phone the coast police about the train.", "end_train"),
  ]),

  scene("a_glove", p(
    "Varga &amp; Daughters keeps a small office on the mezzanine. It is neat as a chapel: a typewriter, a vase of white lilies, a fountain pen full of violet ink, and an open box of evening gloves with one left glove missing.",
    "In the wastepaper basket, something black and soft. On the desk calendar, tonight's date is circled: <em>01:15. Central.</em>",
    "Down the corridor you hear heels, and a voice thanking someone warmly. She will be back in under a minute.",
  ), "d_a_glove", { label: "23:50 · Varga & Daughters office, mezzanine", notebook: [evidence("Celeste Varga's desk calendar: '01:15. Central.'")] }),

  decision("d_a_glove", "Her office", "The heels are getting closer.", [
    option("Lay your thread of lace against whatever is in the basket.", "a_glove_match", { ...needs("lace"), effects: [flag("lace_matched")] }),
    option("Leave before she sees you. Central Station.", "f_station"),
    option("Stay where you are. Let her find you here, and watch her face.", "a_glove_caught", { effects: [flag("alerted")] }),
  ], 30),

  scene("a_glove_caught", p(
    "Celeste Varga stops in the doorway. Her eyes go to you, then to the wastepaper basket, then back to you, and the smile arrives a second late.",
    "“Sergeant. You're lost,” she says. “The cloakroom is downstairs.” She takes her travelling coat from the stand without hurrying and leaves you alone with the lilies.",
  ), "f_station", { label: "23:51 · Varga & Daughters office" }),

  scene("a_glove_match", p(
    "In the basket: a black lace evening glove. Left hand. The lace is torn at the wrist, and a thread is missing.",
    "You lay your thread against the tear. It fits like a key in a lock. Whoever wore this glove was on the B2 landing tonight, close enough to Felix Amsel to leave a piece of herself on the rail.",
    "You put the glove back exactly as it was, and you are out of the door before her heels reach the corner.",
  ), "d_a_glove2", { label: "23:51 · Varga & Daughters office", notebook: [evidence("Celeste Varga's torn left glove: the lace from the rail fits the tear.")] }),

  decision("d_a_glove2", "The glove", "Her calendar says 01:15.", [
    option("Central Station. The 01:15.", "f_station"),
    option("Ring the station master and have the trunk held. Stay with the evidence.", "end_trunk"),
  ]),

  // ════════════════════════════════════════════════════════════════════
  // B · THE ROOM
  // ════════════════════════════════════════════════════════════════════
  scene("b_room", p(
    "The Lantern Room is a gold wedding cake of a ballroom, slowly going stale. Three hundred guests in evening dress are discovering that a death below stairs is the most exciting thing that has happened to them all year.",
    "At the lectern, the auctioneer, Celeste Varga, is stacking bid cards in black lace gloves. In the front row an old woman in pearls is watching you with the look of someone who has waited all evening for a detective. The buyer of Lot 14, a shipping magnate called Erik Brandvold, is shaking hands like a man who has bought the moon.",
    "Mr Lindqvist plucks your sleeve. “The cloakroom closes at midnight, Sergeant. You may have four conversations. Perhaps five. Then I must let my guests go home.”",
  ), "d_b1", {
    title: "The Room", label: "23:07 · The Lantern Room",
    notebook: [note("Celeste Varga, auctioneer, Varga & Daughters. Black lace gloves."), note("Lot 14 was bought by Erik Brandvold, shipping.")],
  }),

  decision("d_b1", "The front row", "Two people saw the most. You only have time to start with one.", [
    option("The old woman in pearls who has been waiting for you.", "b_fair"),
    option("Erik Brandvold, who has just paid forty-one thousand dollars.", "b_brand"),
  ]),

  scene("b_fair", p(
    "Mrs Odile Fairweather is eighty-one, has outlived three husbands and most of her doctors, and has been robbed, she tells you, in far better hotels than this.",
    "“My eyes are useless,” she says, “so I listen. And I write everything down.” She shows you her auction programme. In the margins, in a tiny shaking hand:",
    "<em>22:25 interval. 22:37 a thump behind the little door by the stage. 22:38 Miss V back at her lectern, out of breath. Gloves changed? 22:40 dark. Someone counting by the easel, one two three four, like a waltz. Turpentine. 22:44 light. 22:51 sold.</em>",
    "“Of course,” she adds, “I am a silly old woman, and nobody listens to silly old women.”",
  ), "d_b_fair", { label: "23:10 · The front row" }),

  decision("d_b_fair", "Mrs Fairweather", "Is she a silly old woman?", [
    option("Believe every word. Ask to keep her programme.", "b_round2", { effects: [give("programme"), add("doubt", 1)] }),
    option("Press her: what made her think the gloves changed?", "b_fair_press", { effects: [give("programme"), add("doubt", 1)] }),
    option("Humour her. Old ladies at auctions see ghosts.", "b_round2"),
  ]),

  scene("b_fair_press", p(
    "“Because before the interval her left glove was dull,” says Mrs Fairweather, “a little worn at the wrist, the way a good glove goes. And at 22:38 it shone like a new pin. One doesn't change one glove, Sergeant. Unless one has spoiled it.”",
    "She folds the programme into your hand. “Keep it. I have had a lovely evening. Nobody ever dies at the opera.”",
  ), "b_round2", { notebook: [evidence("Mrs Fairweather: before 22:37 Miss Varga's left glove was worn; at 22:38 it was new.")] }),

  scene("b_brand", p(
    "Erik Brandvold owns eleven ships and stands as if all of them are behind him. His chauffeur is holding his coat.",
    "“I examined her at a quarter past ten,” he says, “before the bidding. Beautiful. Old. She smelled of dust and history.” He frowns. “When they carried her off the stage just now, she smelled like a hardware shop. I assumed it was the hotel.”",
    "He checks his watch. “Sergeant, I have just paid forty-one thousand dollars for a painting, and I would like to take it home before anyone else dies.”",
  ), "d_b_brand", { label: "23:10 · Beside the stage" }),

  decision("d_b_brand", "Erik Brandvold", "A rich man who notices smells.", [
    option("Believe him. Something happened to that painting in the dark.", "b_round2", { effects: [flag("swap_suspected"), add("doubt", 1)] }),
    option("Ask him who handled the painting after the lights came back.", "b_round2", { effects: [flag("swap_suspected"), flag("brandvold_porters")] }),
    option("He's just paid a fortune. He'd say anything. Let him go.", "b_round2"),
  ]),

  scene("b_round2", p(
    "The quartet starts a waltz nobody dances to. Behind the bar, a waiter has been polishing the same glass for five minutes, and Dr Pell, the house doctor, has just come up from below stairs and is helping himself to a large brandy.",
  ), "d_b2", { label: "23:18 · The Lantern Room" }),

  decision("d_b2", "The staff", "One more conversation before the auctioneer.", [
    option("The waiter with red eyes behind the bar.", "b_pim"),
    option("Dr Pell, who signed the poor man off as an accident.", "b_pell"),
  ]),

  scene("b_pim", p(
    "His name is Pim, he is nineteen, and he is not supposed to be crying in front of the guests.",
    "“Felix was teaching me to draw,” he says. “On my breaks. He said I had good hands for it.” He touches the pocket of his apron. “At twenty past ten he gave me his sketchbook. He said, keep this until midnight, and if I don't come back for it, give it to the police. Not to anyone from upstairs.”",
    "He glances at the service door. “Teddy the porter was white as a sheet before the lights went out. Before, Sergeant. And he told me if I talked to anyone tonight I'd never work in this city again.”",
  ), "d_b_pim", { label: "23:21 · Behind the bar", notebook: [note("Pim: Felix gave him his sketchbook at 22:20. 'If I don't come back, give it to the police.'"), note("Pim: Teddy the porter was pale before the blackout, and threatened him.")] }),

  decision("d_b_pim", "Pim", "He has a dead man's sketchbook in his apron.", [
    option("Ask for the sketchbook, gently.", "b_sketch", { effects: [give("sketch"), add("doubt", 1)] }),
    option("He has a dead man's belongings and a reason to cry. Hold him.", "end_pim"),
    option("Leave him be. He's a kid, and he's frightened.", "b_round3"),
  ]),

  scene("b_sketch", p(
    "The sketchbook is soft with use. Page after page of <em>The Lantern Girl</em>: her hands, the lantern, the water. In the margins, over and over, small careful moths.",
    "The last page is a letter that was never sent:",
    "<em>C.V. says the sister stays here and the girl goes to Lisbon. That makes me a forger and her a rich woman. This morning she had me varnish the sister again, so she'd shine like the real one. I told her tonight: after Lot 14 I tell Hale everything. She said she understood. She smiled. I don't like it when she smiles. F.</em>",
  ), "b_round3", { label: "23:24 · Behind the bar", notebook: [evidence("Felix's sketchbook: 'C.V. says the sister stays here and the girl goes to Lisbon.'"), evidence("Felix told C.V. tonight he would tell Hale everything after Lot 14.")] }),

  scene("b_pell", p(
    "Dr Pell has the broken veins of a man who has been the house doctor at a grand hotel for twenty years. He looks at his brandy rather than at you.",
    "“Mr Lindqvist told me it was an accident before I'd seen him,” he says. “So I saw an accident. There is a bruise on his chest, Sergeant, flat, the size of a hand. And I'll tell you something else for nothing. Miss Varga tells everyone he was a dreadful drinker. That man had one gin all night. I could smell it. One.”",
  ), "d_b_pell", { label: "23:21 · The Lantern Room" }),

  decision("d_b_pell", "Dr Pell", "He's had more than one brandy himself.", [
    option("Believe him. A bruise like a hand, and one gin.", "b_round3", { effects: [flag("bruise_known"), add("doubt", 1)] }),
    option("Press him: why did Lindqvist want an accident so badly?", "b_pell_press", { effects: [flag("bruise_known")] }),
    option("He's drunk. Ignore him.", "b_round3"),
  ]),

  scene("b_pell_press", p(
    "“Because Miss Varga asked him to,” says Dr Pell. “I was standing by the lectern when she picked up the house telephone, between Lot 13 and Lot 14. 22:46 by the clock over the stage. ‘Such a sad accident, Mr Lindqvist. Let's not spoil the auction.’” He finishes his brandy. “22:46, Sergeant. The porter didn't find the body until 22:47. I've been wondering all night how she knew.”",
  ), "b_round3", { notebook: [evidence("Dr Pell: at 22:46 Miss Varga told Lindqvist it was 'a sad accident'. The body wasn't found until 22:47.")] }),

  scene("b_round3", p(
    "On the bandstand the quartet is packing up: the first cellist is wiping down her strings and watching you over her spectacles. And at the far door, Augustin Hale, the owner, has finally come down from the eighth floor, grey in the face, a brandy in his hand.",
  ), "d_b3", { label: "23:27 · The Lantern Room" }),

  decision("d_b3", "One more", "The cloakroom is down to its last few rails of coats.", [
    option("The cellist, who has been watching the whole room all night.", "b_cello"),
    option("Augustin Hale, who owns the hotel, the painting and the debts.", "b_hale"),
  ]),

  scene("b_cello", p(
    "Marta Lund has played first cello at the Meridian for nineteen years, and has watched every one of its scandals over the top of her music.",
    "“Miss Varga left her lectern at 22:31,” she says. “Through the little door by the stage. Our second waltz is seven minutes long, and she came back just as it finished. Out of breath. She never leaves her lectern, Sergeant. Not for fires.”",
    "She tightens a peg. “And when the lights went out, someone by the easel counted under his breath. A man. Slow and deep. One, two, three, four. Like a porter counting stairs.”",
  ), "d_b_cello", { label: "23:28 · The bandstand" }),

  decision("d_b_cello", "Marta Lund", "A musician keeps very good time.", [
    option("Believe her. Seven minutes, and a man counting.", "b_round4", { effects: [add("doubt", 1), flag("seven_minutes")] }),
    option("Press her: who else used the little door tonight?", "b_cello_press", { effects: [flag("seven_minutes")] }),
    option("Musicians gossip. Thank her and move on.", "b_round4"),
  ]),

  scene("b_cello_press", p(
    "“The big porter,” says Marta Lund. “At ten past ten, before the interval, pushing something tall on a laundry cart, under a sheet. He went behind the stage curtain with it and came out without it.”",
    "She snaps her case shut. “Something tall, Sergeant. About the size of a painting.”",
  ), "b_round4", { notebook: [evidence("Marta Lund, cellist: at 22:10 the big porter wheeled something tall, under a sheet, behind the stage curtain.")] }),

  scene("b_hale", p(
    "Augustin Hale looks like a man who has been crying in a lift. “Felix is dead,” he says, as if you might not have heard. “I've been upstairs all night. Celeste told me to stay up there, in front of witnesses, so nobody could say I went near the painting.”",
    "He looks at the empty easel. “She suggested the auction. The copy. The insurance. Everything. I thought she was saving my hotel.”",
  ), "d_b_hale", { label: "23:28 · The far door" }),

  decision("d_b_hale", "Augustin Hale", "The owner, the debts, the painting.", [
    option("Believe him. A frightened man, not a clever one.", "b_round4", { effects: [add("doubt", 1)] }),
    option("Note it down. A man with debts and a doubled policy.", "b_round4", { effects: [flag("hale_suspect")] }),
    option("Press him: why would an auctioneer want the owner out of the room?", "b_hale_press", { effects: [add("doubt", 1)] }),
  ]),

  scene("b_hale_press", p(
    "Hale opens his mouth, closes it, and for the first time tonight looks at the question instead of at his brandy.",
    "“So that if anything went wrong with the painting,” he says slowly, “I would be the man who had every reason and no one to vouch for him. Except her.”",
  ), "b_round4", { notebook: [note("Hale: Celeste kept him upstairs all night. If anything went wrong, he'd be the obvious suspect.")] }),

  scene("b_round4", p(
    "The cloakroom queue is down to its last rail of furs. Celeste Varga has finished stacking her bid cards. She looks up and smiles at you, as if she has been waiting for her turn.",
  ), "b_celeste", { label: "23:30 · The Lantern Room" }),

  scene("b_celeste", p(
    "Celeste Varga is somewhere past fifty and has decided not to tell anyone where. Silver hair pinned up, a black velvet dress, black lace gloves, a gold pen that writes in violet ink.",
    "“Poor Felix,” she says. “A lovely painter and a dreadful drinker. I invited him because Augustin asked me to. I wish I hadn't.” Her voice is perfectly sad. Her eyes are perfectly dry.",
    "As she says <em>dreadful drinker</em>, her right hand goes to her left wrist and turns the glove there, as if checking a bracelet that isn't there.",
  ), "d_b_celeste", { label: "23:31 · The lectern" }),

  decision("d_b_celeste", "The auctioneer", "She is being very, very helpful.", [
    option("Thank her. She's been nothing but helpful.", "b_coats"),
    option("Say nothing, and note the hand on her left wrist.", "b_coats", { effects: [add("doubt", 1), flag("tell_celeste")] }),
    option("Tell her the doctor says Felix had one gin all night.", "b_coats", { visibleIf: [is("bruise_known")], effects: [add("doubt", 1), flag("alerted")] }),
  ]),

  scene("b_coats", p(
    "The last fur leaves the cloakroom. Mr Lindqvist claps his hands for the guests' attention.",
  ), "b_lantern", { routes: [{ conditions: [gte("doubt", 3)], to: "b_offer" }] }),

  scene("b_offer", p(
    "Before Lindqvist can begin, a gloved hand rests on your arm. “Sergeant. A word.”",
    "In the corridor behind the stage, Celeste Varga takes an envelope from her evening bag. It is thick. “Varga &amp; Daughters looks after its friends,” she says. “A finder's fee, for a sensible report. <em>Misadventure</em> is such a kind word. Nobody's life gets any worse.”",
    "Behind the curtain, three hundred people are waiting for you to come back.",
  ), "d_b_offer", { label: "23:42 · Behind the stage" }),

  decision("d_b_offer", "The envelope", "She holds it out as if it were a programme.", [
    option("Take the envelope.", "end_commission"),
    option("Refuse, and tell her you'll see her in the Lantern Room.", "b_lantern", { effects: [flag("refused"), flag("alerted")] }),
    option("Pretend to consider it. Ask what the painting is really worth.", "b_offer_slip", { effects: [add("doubt", 1)] }),
  ], 30),

  scene("b_offer_slip", p(
    "“Far more than forty-one thousand, I assure you,” she says, and then hears herself, and smiles a fraction too late. “To the right buyer.”",
    "She puts the envelope away. “Think about it, Sergeant. The offer stands until midnight.”",
  ), "b_lantern", { notebook: [evidence("Celeste, offering a bribe: the painting is worth 'far more than forty-one thousand… to the right buyer'.")] }),

  scene("b_lantern", p(
    "You have them all in the Lantern Room: Augustin Hale down from the eighth floor, Pim, Dr Pell, Mrs Fairweather, Erik Brandvold, and three hundred guests who will remember this for the rest of their lives.",
    "Celeste Varga stands at her lectern, gloves folded, like an auctioneer waiting for the final bid.",
    "Three hundred faces turn towards you. Somebody here killed Felix Amsel. Point.",
  ), "d_b_name", { label: "23:50 · The Lantern Room" }),

  decision("d_b_name", "Name the killer", "Everyone is waiting for you to point.", [
    option("Point at Pim, the waiter who had the dead man's sketchbook.", "end_pim"),
    option("Point at Augustin Hale: the debts, the doubled policy, the empty suite.", "end_hale", { visibleIf: [is("hale_suspect")] }),
    option("Tell them it was an accident, and let them all go home.", "end_accident"),
    option("Name Celeste Varga.", "b_name_celeste", { lockedIf: [lt("doubt", 4)] }),
  ], 60),

  scene("b_name_celeste", p(
    "You say her name, and you say why, one piece at a time, the way she sells a lot. Three hundred people turn from you to her.",
    "Celeste Varga does not argue. She bows slightly, the way she bows when a lot is sold. “You'll forgive me, Sergeant. A telephone call.” She is through the stage door before the first guest finds their voice.",
    "By the time you reach the street, a taxi is pulling away into the rain. The doorman heard her say one word to the driver. <em>Docks.</em>",
  ), "d_b_chase", { label: "23:56 · Hotel entrance" }),

  decision("d_b_chase", "She's running", "The doorman is holding a taxi door open for you.", [
    option("The docks. Pier 9: the night steamer.", "f_harbour"),
    option("Central Station. The docks could be a trick.", "f_station", { effects: [flag("alerted")] }),
    option("Let her go. Nobody runs far in black lace gloves.", "end_train"),
  ], 20),

  // ════════════════════════════════════════════════════════════════════
  // C · THE MONEY
  // ════════════════════════════════════════════════════════════════════
  scene("c_hale", p(
    "Augustin Hale owns the Meridian, or the Meridian owns him; at this point the bank is not sure. He is a big, soft man in a velvet jacket, standing at the window of the owner's suite, watching the rain on the harbour with a brandy he isn't drinking.",
    "“Felix?” he says. “Celeste's friend. The painter. He was charming at dinner. He was charming at everything.” His voice cracks on the last word, and he doesn't explain why.",
    "A woman in a grey suit leans in the doorway with a notebook. “Rosalind Achter,” she says, not offering a hand. “Insurance. That painting was insured by my company until 22:51, when it became Mr Brandvold's problem. I'm here to make sure nothing about tonight costs us money.”",
    "On Hale's desk: bills, a policy document, unopened letters, and a framed photograph of a young woman on a quay.",
  ), "d_c1", { title: "The Money", label: "23:06 · Owner's suite, eighth floor" }),

  decision("d_c1", "The owner's suite", "Paper is patient. You have to start somewhere.", [
    option("Go through the papers on his desk.", "c_desk", { effects: [give("letter")] }),
    option("Ask him about the girl in the photograph.", "c_photo", { effects: [flag("moth_known"), flag("year_known")] }),
    option("Let the insurance investigator talk.", "c_ros"),
  ]),

  scene("c_desk", p(
    "Hale's desk is a museum of bad news. Final demands. The brewery. The bank, twice. And a new insurance policy for <em>The Lantern Girl</em>, value doubled, signed three weeks ago.",
    "Under it, unopened until you open it, a letter on cheap paper in a cramped hand:",
    "<em>Dear Mr Hale, the copy is finished, and Miss Varga tells me it will travel to Lisbon. I must say I am uneasy. Copies have a way of becoming originals when nobody is looking. I would like to speak to you privately after the auction. Yours, Felix Amsel.</em>",
    "Hale reads it over your shoulder and turns the colour of his brandy. “It came this morning,” he says. “I never opened it. I never open anything.”",
  ), "d_c_desk", {
    label: "23:09 · Hale's desk",
    notebook: [evidence("Hale doubled the insurance on The Lantern Girl three weeks ago."), evidence("Felix's letter to Hale: the copy is going to Lisbon. 'Copies have a way of becoming originals.'")],
  }),

  decision("d_c_desk", "The letter", "Felix wanted to talk. He never got the chance.", [
    option("Ask Hale who told him to double the policy.", "c_truth"),
    option("Ask where the copy's paperwork is. The bottom drawer is locked.", "c_lock"),
    option("Ask the insurance investigator what she makes of it.", "c_ros"),
  ]),

  scene("c_photo", p(
    "Hale picks up the photograph. “My mother. Signe. 1923, on the old quay, waiting for my father's ship. It came in the next morning, but Ilse Marrow didn't paint that part.” He smiles. “She preferred the waiting.”",
    "Then, quieter: “Felix made a copy this autumn. Celeste's idea, for travelling exhibitions. He worked in my attic for six weeks. He told me he hides a little moth in the dark corner of every copy he paints, so nobody can ever sell one as the real thing. So he could sleep at night, he said.” Hale looks at the rain. “I don't think he slept much.”",
  ), "d_c_photo", {
    label: "23:10 · Owner's suite",
    notebook: [note("The girl in the painting is Signe Hale, Augustin's mother, painted in 1923."), evidence("Felix hid a tiny moth in the dark corner of every copy he painted.")],
  }),

  decision("d_c_photo", "Signe on the quay", "Somewhere in this building there are two Lantern Girls.", [
    option("Ask where the copy's paperwork is.", "c_lock"),
    option("Ask why he doubled the insurance.", "c_truth"),
    option("Ask the insurance investigator about the copy.", "c_ros"),
  ]),

  scene("c_ros", p(
    "Rosalind Achter walks you out into the corridor, out of Hale's hearing.",
    "“Three weeks ago he doubled the policy on that painting,” she says. “He owes the bank, the brewery, and a man on Atlantic Avenue who doesn't send letters. Tonight the lights go out during his lot, and a man dies in his basement. I've done this job for twenty-two years, Sergeant. When it looks like this, it's usually exactly what it looks like.”",
    "She says it with total confidence. She also says it a little too fast, the way people do when the obvious answer is also the cheapest one for their employer.",
  ), "d_c_ros", { label: "23:12 · Corridor, eighth floor", notebook: [note("Rosalind Achter, insurance: Hale doubled the policy and is badly in debt. She wants it to be fraud.")] }),

  decision("d_c_ros", "The insurer", "Her company pays nothing if this is fraud.", [
    option("Ask her to lay out her whole theory.", "c_ros_theory"),
    option("Ask her who else makes money if a painting disappears.", "c_lock", { effects: [flag("premium")] }),
    option("She's right about the money. Charge Hale with insurance fraud.", "end_fraud"),
  ]),

  scene("c_ros_theory", p(
    "“Hale needed money. Hale doubled the policy. Hale had a copy made in his own attic. The lights go out, the copy goes up, the original goes somewhere quiet, and he claims on whichever one the buyer complains about. Felix Amsel was going to tell someone, and now he can't.”",
    "She snaps her notebook shut. “Arrest him, Sergeant, and we can all go to bed.”",
  ), "d_c_ros2", { label: "23:14 · Corridor, eighth floor" }),

  decision("d_c_ros2", "A convenient story", "It's a good story. It's also cheap for her company.", [
    option("She's right. Arrest Augustin Hale.", "end_hale"),
    option("Ask to see the copy's paperwork before you arrest anyone.", "c_lock"),
  ]),

  scene("c_lock", p(
    "The bottom drawer of Hale's desk has a brass combination lock, four little wheels. Hale stares at it as if it belongs to another man. “Signe chose the number,” he says. “Years ago. I've had three brandies, Sergeant. I'm sorry.”",
    "Rosalind Achter checks her watch, loudly.",
  ), "d_c_lock", { label: "23:16 · Hale's desk" }),

  decision("d_c_lock", "Four wheels", "A number his mother chose.", [
    option("1923.", "c_contract", { effects: [give("contract")] }),
    option("1958.", "c_jam"),
    option("1974.", "c_jam"),
  ], 40),

  scene("c_contract", p(
    "The wheels click home and the drawer slides open. Inside, a contract on Varga &amp; Daughters paper:",
    "<em>Copy of The Lantern Girl, by F. Amsel, commissioned by Varga &amp; Daughters on behalf of A. Hale, for a travelling exhibition. To be crated in Storage B2 and shipped via Lisbon, consigned by C. Varga.</em>",
    "Clipped behind it, the insurance rider. Coverage for the original only. The copy is insured for nothing at all. Whoever ends up holding the copy holds a very expensive piece of canvas that nobody will pay for.",
  ), "c_truth", { label: "23:18 · Hale's desk", notebook: [evidence("Copy contract: commissioned by Varga & Daughters, crated in Storage B2, consigned via Lisbon by C. Varga. The copy is uninsured.")] }),

  scene("c_jam", p(
    "The wheels turn, the drawer doesn't. On the third try something inside goes <em>clunk</em>, and the lock jams solid.",
    "Rosalind Achter sighs. “While you play with that, I'll be telephoning my office.” She leaves. Hale pours a fourth brandy.",
  ), "c_truth", { label: "23:18 · Hale's desk" }),

  scene("c_truth", p(
    "Hale sits down as if somebody pulled the chair out from under him.",
    "“Yes, I'm broke. Yes, I doubled the policy. Celeste said a careful man protects his assets. She said the copy was for exhibitions, and that I should put the painting in the charity auction because the publicity would save the hotel.” He laughs, badly. “She also told me to stay up here all evening, in front of witnesses, so nobody could ever say I went near the painting. I thought she was protecting me.”",
    "He looks at his hands. “Everything I did tonight, Celeste suggested. Everything.”",
  ), "d_c_truth", { label: "23:21 · Owner's suite", notebook: [evidence("Hale: Celeste suggested the auction, the copy, the doubled policy, and his alibi.")] }),

  decision("d_c_truth", "Everything she suggested", "Hale is telling the truth, or he is very good.", [
    option("He had every reason. Arrest Augustin Hale.", "end_hale"),
    option("Read Felix's letter aloud to him.", "c_letter_read", needs("letter")),
    option("Ask the switchboard who telephoned whom tonight.", "c_switch"),
    option("Follow the money downstairs: the house safe.", "c_safe"),
  ]),

  scene("c_letter_read", p(
    "You read it slowly. <em>Copies have a way of becoming originals when nobody is looking.</em>",
    "Hale puts his face in his hands. “He tried to tell me. At dinner. He kept looking at Celeste and saying, after the auction, Augustin, after the auction.” He looks up. “Ask the switchboard. If Celeste wanted him somewhere, she'd have telephoned. She telephones everybody.”",
  ), "c_switch", { label: "23:23 · Owner's suite" }),

  scene("c_switch", p(
    "The switchboard is a cupboard off the lobby with a girl in it. Miss Dunne has worked nights for six years and remembers everything, because nothing else ever happens.",
    "She runs a red fingernail down the log. “Here. 22:26: the auction office on the mezzanine, extension 114, to the Lantern Room bar. The caller asked for Mr Amsel. One minute.” The fingernail moves. “And 22:58: extension 114 again, to Central Station, left luggage and parcels. Two minutes.”",
    "She tears you a carbon of the page without being asked. “I like a man who reads,” she says.",
  ), "d_c_switch", {
    label: "23:27 · Hotel switchboard",
    notebook: [evidence("Switchboard: 22:26, the auction office called the bar and asked for Mr Amsel."), evidence("Switchboard: 22:58, the auction office called Central Station, left luggage and parcels.")],
  }),

  decision("d_c_switch", "The switchboard", "Two calls from the same office.", [
    option("Take the carbon. Then the house safe.", "c_safe", { effects: [give("slip")] }),
    option("Take the carbon. Straight up to the auction office.", "c_office", { effects: [give("slip")] }),
  ]),

  scene("c_safe", p(
    "Mr Okafor, the night clerk, opens the house safe on Mr Hale's word, with the air of a man who will be blaming you later. Inside: the house copy of tonight's auction ledger, written up by Miss Varga's office in the afternoon, before anyone bid on anything. Her junior clerk copied it straight from her working notes, the way junior clerks do: every word, including the ones that were never meant to leave her desk.",
    "It does not match the ledger at her lectern. Beside Lot 14, in her violet ink: <em>Reserve not met. Private treaty, Lisbon. Commission 40%, C.V.</em>",
    "Lot 14 was sold to Lisbon this afternoon. Then it was sold to Brandvold tonight. One painting can't be sold twice. Two can.",
  ), "d_c_safe", { label: "23:36 · The house safe", notebook: [evidence("House ledger: Lot 14 privately sold to Lisbon before the auction. 40% to C.V.")] }),

  decision("d_c_safe", "Sold twice", "Two buyers, one painting, and one of them is getting a copy.", [
    option("Take the ledger. Up to the auction office while she's on the floor.", "c_office", { effects: [give("ledger")] }),
    option("Take the ledger, and check the guest register while the clerk is here.", "c_register", { effects: [give("ledger"), flag("two_tickets")] }),
    option("Take the ledger and think it through.", "c_final", { effects: [give("ledger")] }),
  ]),

  scene("c_register", p(
    "Mr Okafor turns the guest register round with two fingers. <em>Miss C. Varga, Suite 610, one night.</em> Beside it, in the travel desk's column, two bookings made this afternoon on the Varga &amp; Daughters account:",
    "<em>One sleeping compartment, 01:15 night train to the coast. One first-class cabin, Santa Lucia, Pier 9, sailing 01:30 for Lisbon.</em>",
    "“Two tickets, one lady,” says Mr Okafor. “Belt and braces, my mother would have said.”",
  ), "c_final", {
    label: "23:39 · Front desk",
    notebook: [evidence("Travel desk: Celeste booked both the 01:15 night train and a cabin on the Santa Lucia, Pier 9, 01:30.")],
  }),

  scene("c_office", p(
    "Varga &amp; Daughters keeps a small office on the mezzanine, extension 114. It is neat as a chapel: a typewriter, a vase of white lilies, a fountain pen full of violet ink.",
    "Under the blotter, the corner of a telegram:",
    "<strong>DUARTE CONFIRMS. FUNDS LISBON ON DELIVERY. BOAT SAILS SUNDAY. COME ALONE. LEAVE THE SISTER.</strong>",
    "The sister. The copy. Somebody in Lisbon is paying for the original, and doesn't want the copy anywhere near it. Down the corridor, her heels, and her voice thanking someone warmly.",
  ), "d_c_office", { label: "23:44 · Varga & Daughters office, mezzanine", notebook: [evidence("Telegram: 'Duarte confirms. Funds Lisbon on delivery. Boat sails Sunday. Leave the sister.'")] }),

  decision("d_c_office", "Her office", "The heels are almost at the door.", [
    option("Pocket the telegram and slip out before she sees you.", "c_final", { effects: [give("telegram")] }),
    option("Wait for her with the telegram in your hand, and ask her about Lisbon.", "c_confront", { effects: [give("telegram"), flag("alerted")] }),
  ], 25),

  scene("c_confront", p(
    "Celeste Varga stops in the doorway and looks at the telegram in your hand the way she might look at a forged signature.",
    "“Lisbon is a client,” she says pleasantly. “Varga &amp; Daughters has many clients. You'll excuse me, Sergeant. I have a train to catch.” She takes her coat from the stand and walks out past you, unhurried, smelling of lilies.",
  ), "c_final", { label: "23:46 · Varga & Daughters office" }),

  scene("c_final", p(
    "You spread it out on the lobby writing desk under a green lamp: the policy, the contract, the ledger, the carbons. Paper is patient. Trains are not.",
  ), "d_c_final", { label: "23:52 · The lobby writing desk" }),

  decision("d_c_final", "The paper trail", "Every document points at money. Not all of them point at murder.", [
    option("Cable the Lisbon police: Duarte, Sunday's boat, a stolen Marrow.", "end_cable", needs("telegram")),
    option("Give Rosalind Achter her fraud case: Hale doubled the policy.", "end_fraud"),
    option("Show Rosalind the copy contract, and ask who really profits.", "c_ros_turn", needs("contract")),
    option("Central Station. The 01:15.", "f_station"),
    option("Pier 9. The second ticket: the Santa Lucia.", "c_pier", { visibleIf: [is("two_tickets")] }),
  ]),

  scene("c_pier", p(
    "You take a taxi to the docks through the rain.",
  ), "c_pier_empty", { label: "00:20 · The harbour road", routes: [{ conditions: [is("alerted")], to: "f_harbour" }] }),

  scene("c_pier_empty", p(
    "Pier 9 is cold and very long. You wait among the cranes for an hour and ten minutes. At half past one the <em>Santa Lucia</em> sails for Lisbon, lit up like a wedding cake, and the purser tells you cabin 4 was never claimed.",
    "Belt and braces. If nobody frightens her off the train, she takes the train.",
  ), "end_train", { label: "01:30 · Pier 9" }),

  scene("c_ros_turn", p(
    "Rosalind Achter reads the contract twice. Then she reads the rider. “The copy's uninsured,” she says. “So my company was never on the hook for the copy. Only the original.” She looks up. “And the original isn't in this hotel, is it?”",
    "For the first time tonight, she sounds like she's on your side. “My car's outside. Where are we going?”",
  ), "f_station", { label: "23:55 · The lobby" }),

  // ════════════════════════════════════════════════════════════════════
  // D · THE PAINTING
  // ════════════════════════════════════════════════════════════════════
  scene("d_stage", p(
    "You reach the stage as two porters lower Lot 14 into a crate lined with felt.",
    "Up close, <em>The Lantern Girl</em> is better than her reputation. A girl on a dark quay at night, holding up a paper lantern, waiting for a ship. The black water under the quay has twenty colours in it.",
    "And yet. There is a smell coming off the canvas, faint and sharp, like a painter's studio. And the varnish is too bright, like a new car in an old garage.",
    "“Mr Brandvold's property,” says a porter. “He wants it in his car in two minutes.”",
  ), "d_d1", { title: "The Painting", label: "23:07 · The auction stage" }),

  decision("d_d1", "Two minutes", "The crate lid is coming down.", [
    option("Put your nose to the canvas and look into the dark water.", "d_moth", { effects: [give("polaroid"), flag("moth_seen")] }),
    option("Let it go. Follow the porters who carried the easel tonight.", "d_corridor"),
    option("Stop the crate. Tell Brandvold, loudly, that he's bought a fake.", "d_brand_angry", { effects: [flag("alerted")] }),
  ], 20),

  scene("d_moth", p(
    "Black water. Twenty colours of it. And there, low in the corner where the lantern gives up, so small you could cover it with a fingernail: a moth. Wings folded. Patient.",
    "Painters in 1923 didn't sign their work with insects. Somebody painted this moth recently, and somebody varnished over it this week.",
    "A photographer from the <em>Harbour Gazette</em> is packing up his flash. You borrow his Polaroid without asking and take one picture. In the flash, the moth seems to move.",
  ), "d_d_moth", { label: "23:08 · The auction stage", notebook: [evidence("Lot 14 has a tiny moth painted in the dark corner of the water: a modern addition. You have a Polaroid of it.")] }),

  decision("d_d_moth", "The moth", "If this is the copy, the real one is already moving.", [
    option("Follow the smell of turpentine backstage.", "d_corridor"),
    option("Ask Brandvold when he last saw her up close.", "d_brand"),
  ], 20),

  scene("d_brand", p(
    "“A quarter past ten,” says Erik Brandvold. “Before the bidding. She smelled of dust and history.” He looks at your Polaroid, then at the crate, and his face goes still the way rich men's faces do when they smell a loss.",
    "“If you're right,” he says, “I want the real one. My car is outside, my chauffeur used to drive for the harbour police. He's yours until morning.”",
  ), "d_d_brand", { label: "23:10 · Beside the stage", notebook: [evidence("Brandvold: at 22:15 the painting smelled of dust. After the blackout it smells of turpentine.")] }),

  decision("d_d_brand", "A car and a chauffeur", "Brandvold wants his forty-one thousand dollars' worth.", [
    option("Take his car, and go backstage first.", "d_corridor", { effects: [flag("car")] }),
    option("Take his car, and go straight to the loading dock.", "d_dock", { effects: [flag("car")] }),
  ], 20),

  scene("d_brand_angry", p(
    "Brandvold turns purple. The porters freeze. Three hundred guests discover something even more exciting than a death below stairs.",
    "At the lectern, Celeste Varga looks up from her bid cards. When you look back a moment later, the lectern is empty.",
  ), "d_corridor", { label: "23:08 · The auction stage" }),

  scene("d_corridor", p(
    "Behind the stage curtain, a narrow door. Behind the door, the service corridor: bare bulbs, hot pipes, a laundry chute, and two black scuffs on the linoleum where a heavy cart was pushed fast.",
    "The tracks run past the top of the B2 stairs, past the laundry, towards the loading dock. A smell of turpentine hangs in the steam.",
  ), "d_d_corr", { label: "23:13 · Service corridor", notebook: [evidence("Cart tracks run from the stage door past the laundry to the loading dock.")] }),

  decision("d_d_corr", "Two ways", "The tracks split at the laundry door.", [
    option("Into the laundry.", "d_laundry"),
    option("Straight on to the loading dock.", "d_dock"),
  ], 15),

  scene("d_laundry", p(
    "Steam, pipes, folded sheets. On the sorting table lies an empty wooden stretcher, a few threads of old canvas still tacked to its edges. Somebody cut a painting off this frame and rolled it up in here.",
    "On a hook hangs a porter's jacket, a railway timetable in the pocket with the 01:15 night train to the coast circled twice.",
    "The handle on the far door begins to turn.",
  ), "d_d_laundry", { label: "23:15 · Laundry room", notebook: [evidence("Empty stretcher in the laundry: an old canvas was cut off it here."), evidence("Porter's jacket: the 01:15 night train circled twice.")] }),

  decision("d_d_laundry", "The handle turns", "Someone is coming in.", [
    option("Grab whoever comes through.", "d_teddy"),
    option("Duck behind the linen carts and listen.", "d_overheard", { effects: [flag("heard_train")] }),
  ], 15),

  scene("d_teddy", p(
    "He is the size of a wardrobe, and you take him by surprise anyway. A porter, brass badge, <em>T. Sorensen</em>. Teddy. He doesn't fight. He sits down on the laundry floor as if somebody cut his strings.",
    "“I moved a box,” he says. “That's all I did. You can't hang a man for a box.”",
  ), "d_d_teddy", { label: "23:16 · Laundry room" }),

  decision("d_d_teddy", "The porter", "He won't look at you.", [
    option("Show him the Polaroid of the moth.", "d_teddy_talks", { ...needs("polaroid"), effects: [flag("teddy_talked")] }),
    option("Cuff him. Charge him with Felix Amsel's death.", "end_teddy"),
    option("Let him go, and follow him.", "d_dock"),
  ], 20),

  scene("d_teddy_talks", p(
    "Teddy looks at the little moth for a long time. Then he starts talking, fast.",
    "“Miss Varga. Five hundred dollars. I brought the copy up from storage at ten past ten. At twenty to eleven I threw the switch, swapped the frames at the easel, counted to two hundred and forty. Then in here: cut the real one off the stretcher, roll it, trunk, van, station. Sample books, do not tilt. The one-fifteen.”",
    "He swallows. “There was a man at the bottom of the stairs, Sergeant. Before the lights went out. Already dead. She never told me about him.” He looks up. “She's on that train with it.”",
  ), "d_dock", { label: "23:18 · Laundry room", notebook: [evidence("Teddy: Celeste Varga hired him to swap the frames and send the original on the 01:15."), evidence("Teddy saw Felix already dead before the blackout.")] }),

  scene("d_overheard", p(
    "It's a big porter. He picks up the laundry's wall telephone and dials without looking.",
    "“It's done, Miss. The trunk's at the station.” A pause. “No. Nobody saw me.” A longer pause, and his voice goes thin. “You didn't tell me about him. You didn't tell me there'd be a man on the stairs.” He listens. He closes his eyes. “Yes, Miss. The one-fifteen. I know.”",
    "He hangs up and goes out the way he came. The cart tracks lead the other way, to the dock.",
  ), "d_dock", { label: "23:17 · Laundry room", notebook: [evidence("The porter on the phone: 'You didn't tell me there'd be a man on the stairs. Yes, Miss. The one-fifteen.'")] }),

  scene("d_dock", p(
    "The loading dock is open to the rain. The hotel's laundry van has just come back, and its driver, Doyle, is smoking under the awning.",
    "“Took a trunk to Central at five to eleven,” he says. “Varga account. <em>Sample books, do not tilt.</em> Light as a picture.” He hands you the pink carbon from his clipboard without being asked. <em>Booked through on the 01:15.</em>",
  ), "d_d_dock", { label: "23:22 · Loading dock", notebook: [evidence("Luggage ticket: a Varga & Daughters trunk of 'sample books' booked on the 01:15 night train.")] }),

  decision("d_d_dock", "Central Station", "Across the city, in the rain.", [
    option("Brandvold's car. Tell the chauffeur not to spare it.", "d_drive", { visibleIf: [is("car")], effects: [give("ticket")] }),
    option("Find a taxi in the rain.", "d_taxi", { effects: [give("ticket")] }),
    option("The van driver says a lady in black gloves asked about Pier 9. Go there.", "f_harbour", { visibleIf: [is("alerted")], effects: [give("ticket")] }),
  ], 20),

  scene("d_drive", p(
    "Brandvold's chauffeur drives like the harbour is on fire. Red lights become suggestions. You reach Central Station with an hour to spare, and nobody has seen a lady in black gloves yet.",
  ), "d_concourse", { label: "23:41 · The harbour road" }),

  scene("d_concourse", p(
    "Central Station concourse: a clock the size of a cartwheel, pigeons asleep in the iron roof, a newspaper stand with its shutters down. The left luggage office is a brown room with a brown man in it, and behind him, on the bottom shelf, a steamer trunk stencilled <em>VARGA &amp; DAUGHTERS · SAMPLE BOOKS · DO NOT TILT</em>.",
    "The 01:15 won't board for more than an hour. Whoever collects that trunk will come to this window.",
  ), "d_d_left", { label: "23:52 · Central Station concourse" }),

  decision("d_d_left", "Left luggage", "The clerk is watching your badge.", [
    option("Badge on the counter. Open the Varga trunk.", "d_trunk", { effects: [flag("trunk_seen")] }),
    option("Don't touch anything. Wait for her on Platform 4.", "f_station"),
    option("Ring the Meridian from the call box to make sure she's still there.", "d_phone", { effects: [flag("alerted")] }),
  ], 25),

  scene("d_phone", p(
    "The Meridian's switchboard puts you through to the lobby. “Miss Varga? She's just this minute stepping into a taxi, sir. I can catch her. Who shall I say is calling?”",
    "You tell him. You hear him call it across the marble, and somewhere under the awning a woman in black gloves hears it too.",
  ), "f_station", { label: "23:54 · Central Station call box" }),

  scene("d_trunk", p(
    "The clerk prises the lid with a screwdriver, muttering about regulations. Under the tissue paper there are no sample books. There is a roll of old canvas, and when you ease back the first turn of it, a corner of black water with twenty colours in it, and no moth.",
    "The real <em>Lantern Girl</em> is in your hands. Somewhere between here and the Meridian, the woman who put her here is on her way.",
  ), "d_d_trunk", { label: "23:55 · Left luggage office", notebook: [evidence("The Varga trunk holds the original Lantern Girl: no moth in the dark water.")] }),

  decision("d_d_trunk", "A bird in the hand", "If you take it now, she'll see an empty shelf and never come to the window.", [
    option("Take the canvas now. Get it somewhere safe.", "end_trunk"),
    option("Close the lid, put it back exactly as it was, and wait for whoever comes to claim it.", "f_station"),
  ], 30),

  scene("d_taxi", p(
    "The rank outside the Meridian is three hundred guests long. Every taxi in the city has a fur coat in it.",
  ), "d_d_taxi", { label: "23:24 · Hotel entrance" }),

  decision("d_d_taxi", "The rank", "The queue isn't moving.", [
    option("Show your badge and commandeer the first cab.", "d_concourse"),
    option("Wait your turn like everyone else.", "d_late"),
  ], 15),

  scene("d_late", p(
    "By the time a cab comes for you, it is half past one. Central Station is fog and pigeons. Platform 4 is empty.",
  ), "end_train", { label: "01:31 · Central Station" }),

  // ════════════════════════════════════════════════════════════════════
  // THE END OF THE NIGHT (where the paths meet)
  // ════════════════════════════════════════════════════════════════════
  scene("f_station", p(
    "Central Station at night is fog, steam, and a voice on the loudspeaker that nobody can understand. The 01:15 to the coast stands at Platform 4, long and dark, its windows yellow.",
  ), "f_platform", { label: "Central Station", routes: [{ conditions: [is("alerted")], to: "f_station_empty" }] }),

  scene("f_platform", p(
    "You take up a place behind a pillar and wait for the boarding call. At five past one it comes.",
    "Halfway down the platform, two porters are lifting a steamer trunk into the baggage car. <em>Sample books. Do not tilt.</em> Beside them, in a dark travelling coat and a fresh pair of black lace gloves, Celeste Varga is tipping them a dollar each.",
    "She sees you. For the first time tonight, the smile arrives a second late. “Sergeant,” she says. “You've come to see me off. How kind.”",
    "Down the platform, the guard lifts his whistle.",
  ), "d_platform_a", { label: "01:09 · Platform 4", routes: pathRoutes("d_platform", ["c", "d"]) }),

  platformDecision("a"),
  platformDecision("c"),
  platformDecision("d"),

  scene("f_station_empty", p(
    "Platform 4 is nearly empty. A porter tells you that a lady in black gloves came in not long ago, had her trunk taken off the 01:15, and left again in a taxi.",
    "“Said she'd gone off trains,” he says. “Asked the driver for the docks.”",
  ), "d_empty", { label: "Central Station" }),

  decision("d_empty", "Gone to the sea", "Whatever she's on, it isn't a train.", [
    option("Pier 9. The night steamer.", "f_harbour"),
    option("Wire the coast police and hope.", "end_train"),
  ], 20),

  scene("f_harbour", p(
    "Pier 9 smells of diesel and open sea. The <em>Santa Lucia</em>, the night steamer for Lisbon, is lit up like a wedding cake. You find a place among the cranes and wait. At twenty past one, her gangway starts to rise, and a crane swings a steamer trunk over her rail. <em>Sample books. Do not tilt.</em>",
    "At the top of the gangway Celeste Varga turns, one gloved hand on the rail, and watches you run the length of the pier. She doesn't move. She has never needed to run from anything.",
    "“Sergeant,” she calls down. “Lisbon is lovely in winter. You should see it.”",
  ), "d_harbour_b", { label: "01:24 · Pier 9", routes: pathRoutes("d_harbour", ["a", "c", "d"]) }),

  harbourDecision("a"),
  harbourDecision("b"),
  harbourDecision("c"),
  harbourDecision("d"),

  // ════════ ENDINGS (in map order: END 1 … END 10) ════════
  ending("end_accident", "Misadventure",
    "Felix Amsel's death is recorded as an accident. The guests go home. The file is closed.",
    p("The coroner agrees with the house doctor: a man who had been drinking, a steep staircase, four minutes of darkness. Mr Lindqvist thanks you for your discretion. The Meridian sends flowers to a funeral attended by six people.",
      "Lot 14 leaves in Erik Brandvold's car before midnight. By morning the Lantern Room has been swept, the gilt chairs stacked, and the service stairs washed down.")),
  ending("end_teddy", "Teddy Sorensen",
    "Teddy Sorensen is charged with the death of Felix Amsel. The file is closed.",
    p("Teddy doesn't fight it. He signs his statement at ten past three in a slow, careful hand, and asks if someone can tell his mother before the newspapers do.",
      "On Monday the Meridian reopens the service stairs. By the end of the week, Lot 14 hangs in Erik Brandvold's front hall.")),
  ending("end_pim", "Pim",
    "Pim is charged with the death of Felix Amsel. The file is closed.",
    p("Pim doesn't cry in the car. He holds Felix's sketchbook on his knees the whole way, the way Felix asked him to.",
      "At the station house the desk sergeant takes it from him, writes EVIDENCE on a brown envelope, and locks it in a drawer.")),
  ending("end_hale", "Augustin Hale",
    "Augustin Hale is arrested for fraud and the death of Felix Amsel. The file is closed.",
    p("The newspapers love it: the broke hotelier, the doubled policy, the body in the basement. Rosalind Achter's company pays nothing.",
      "Hale says very little. His lawyers ask for six months to prepare, and the Meridian closes its doors before Christmas.")),
  ending("end_fraud", "The Policy",
    "Augustin Hale is charged with insurance fraud. Felix Amsel's death is recorded as an accident.",
    p("Rosalind Achter writes a very tidy report. Her company pays nothing, and sends you a Christmas card.",
      "Hale pleads guilty to the policy and nothing else. Lot 14 hangs in Erik Brandvold's front hall, and the file on Felix Amsel is closed with a single word.")),
  ending("end_cable", "The Lisbon Cable",
    "A painting is seized from a buyer in Lisbon. Nobody in this city is charged.",
    p("Nine days later the Lisbon police cable back: a Mr Duarte, a steamer trunk, a rolled canvas of a girl on a quay. The painting comes home in a diplomatic bag.",
      "Celeste Varga writes to the newspapers about the shocking deception practised on her client, and the auction house sends Augustin Hale a very kind letter. Felix Amsel's death stays an accident on paper.")),
  ending("end_commission", "The Commission",
    "You accept a fee from Varga & Daughters. Felix Amsel's death is recorded as an accident.",
    p("The envelope holds ten thousand dollars in new notes. Your report uses the word <em>misadventure</em> three times.",
      "In the spring a postcard arrives at the station house with a Lisbon postmark and no signature. Just a drawing of a lantern, and a very small moth.")),
  ending("end_trunk", "The Trunk",
    "You recover a rolled canvas from a steamer trunk. Nobody is charged tonight.",
    p("The trunk comes open on the cold boards: tissue paper, an auction catalogue, and a roll of old canvas. Unrolled under a lamp, it shows a girl on a dark quay, holding up a lantern.",
      "By the time you look up, the crowd has thinned to porters and fog. Augustin Hale identifies the painting at four in the morning. The file on Felix Amsel stays open.")),
  ending("end_train", "Last Train",
    "Celeste Varga leaves the city before dawn. Nobody is charged tonight.",
    p("You watch the lights go: a red lamp shrinking into the fog, or a ship's stern sliding out past the breakwater.",
      "Felix Amsel's file stays on your desk, under the telephone, for a long time.")),
  ending("end_celeste", "Celeste Varga",
    "Celeste Varga is arrested for the death of Felix Amsel. The file is closed.",
    p("You don't raise your voice. You hold each thing up in the light, one after the other, the way she held up lots all evening.",
      "She listens to all of it without interrupting. Then she peels off her gloves, finger by finger, and hands them to you like a lot she is withdrawing from sale. “You'll want these, Sergeant,” she says. It is the last thing she says to you.",
      "When they open the trunk, there is a roll of old canvas inside, wrapped in tissue paper: a girl on a quay at night, holding up a lantern, waiting for her ship.")),
];

// Endings in the order they should read on the map: END 1 … END 10.
const ENDING_ORDER = ["end_accident", "end_teddy", "end_pim", "end_hale", "end_fraud", "end_cable", "end_commission", "end_trunk", "end_train", "end_celeste"];

// Hand-placed Story map. Four columns of play (A body, B room, C money,
// D painting) that meet at Platform 4 and Pier 9, with END 1–10 along the
// bottom. Every arrow points down the page. Adding a section in the editor
// makes the map lay itself out automatically until it is placed here too.
const LOT14_MAP: Record<string, MapPlacement> = {
  __start: { row: 0, col: 5.5 },
  d_start: { row: 1, col: 5.5, code: "?" },
  // A · The Body (columns 0–2)
  d_a_look1: { row: 2, col: 1, code: "A" }, d_a_look2: { row: 3, col: 1, code: "A2" }, d_a_look3: { row: 4, col: 1, code: "A3" },
  d_a_time: { row: 5, col: 1, code: "T" },
  d_a_dark: { row: 6, col: 0, code: "DK" }, d_a_before: { row: 6, col: 2, code: "BF" },
  d_a_bar: { row: 7, col: 2, code: "RB" },
  d_a_fuse: { row: 8, col: 1, code: "FR" },
  d_a_teddy: { row: 9, col: 0, code: "TS" }, d_a_storage: { row: 9, col: 2, code: "B2" },
  d_a_after: { row: 10, col: 0, code: "ST" }, d_a_laundry: { row: 10, col: 2, code: "L" },
  d_a_glove: { row: 11, col: 1, code: "VO" }, d_a_glove2: { row: 12, col: 1, code: "GL" },
  // B · The Room (columns 3–5)
  d_b1: { row: 2, col: 4, code: "B" },
  d_b_fair: { row: 3, col: 3, code: "OF" }, d_b_brand: { row: 3, col: 5, code: "EB" },
  d_b2: { row: 4, col: 4, code: "R2" },
  d_b_pim: { row: 5, col: 3, code: "P" }, d_b_pell: { row: 5, col: 5, code: "DP" },
  d_b3: { row: 6, col: 4, code: "R3" },
  d_b_cello: { row: 7, col: 3, code: "ML" }, d_b_hale: { row: 7, col: 5, code: "AH" },
  d_b_celeste: { row: 8, col: 4, code: "CV" },
  d_b_offer: { row: 9, col: 4, code: "$" },
  d_b_name: { row: 10, col: 4, code: "LR" },
  d_b_chase: { row: 11, col: 4, code: "TX" },
  // C · The Money (columns 6–8)
  d_c1: { row: 2, col: 7, code: "C" },
  d_c_desk: { row: 3, col: 6, code: "DS" }, d_c_photo: { row: 3, col: 7.5, code: "PH" },
  d_c_ros: { row: 4, col: 8, code: "RA" }, d_c_ros2: { row: 5, col: 8, code: "R2" },
  d_c_lock: { row: 6, col: 7, code: "#" },
  d_c_truth: { row: 7, col: 7, code: "H" },
  d_c_switch: { row: 8, col: 6, code: "SW" },
  d_c_safe: { row: 9, col: 7, code: "HL" },
  d_c_office: { row: 10, col: 8, code: "VO" },
  d_c_final: { row: 11, col: 7, code: "PT" },
  // D · The Painting (columns 9–11)
  d_d1: { row: 2, col: 10, code: "D" },
  d_d_moth: { row: 3, col: 9, code: "M" },
  d_d_brand: { row: 4, col: 11, code: "EB" },
  d_d_corr: { row: 5, col: 10, code: "SC" },
  d_d_laundry: { row: 6, col: 9, code: "L" },
  d_d_teddy: { row: 7, col: 9, code: "TS" },
  d_d_dock: { row: 8, col: 10, code: "LD" },
  d_d_taxi: { row: 9, col: 11, code: "TX" },
  d_d_left: { row: 10, col: 10, code: "LL" },
  d_d_trunk: { row: 11, col: 10.5, code: "TR" },
  // Where the paths meet: Platform 4, an empty station, Pier 9
  d_platform_a: { row: 13, col: 1, code: "P4" }, d_empty: { row: 13, col: 4.5, code: "CS" },
  d_platform_c: { row: 13, col: 7, code: "P4" }, d_platform_d: { row: 13, col: 10, code: "P4" },
  d_harbour_a: { row: 14, col: 1.5, code: "P9" }, d_harbour_b: { row: 14, col: 4, code: "P9" },
  d_harbour_c: { row: 14, col: 7, code: "P9" }, d_harbour_d: { row: 14, col: 9.5, code: "P9" },
  // Endings
  end_accident: { row: 15, col: 0 }, end_teddy: { row: 15, col: 1.22 }, end_pim: { row: 15, col: 2.44 },
  end_hale: { row: 15, col: 3.67 }, end_fraud: { row: 15, col: 4.89 }, end_cable: { row: 15, col: 6.11 },
  end_commission: { row: 15, col: 7.33 }, end_trunk: { row: 15, col: 8.56 }, end_train: { row: 15, col: 9.78 }, end_celeste: { row: 15, col: 11 },
};

export function lot14Graph(): InteractiveGraph {
  const body = nodes.filter((n) => n.type !== "ending");
  const endings = ENDING_ORDER.map((id) => nodes.find((n) => n.id === id)!);
  return {
    startNodeId: "opening",
    settings: {
      ...DEFAULT_SETTINGS,
      // One attempt per calendar month; the lock lifts on the 1st (Stockholm time).
      replay: "monthly",
      guestAccess: "two_choices",
      endingVisibility: "count",
      items: [
        { id: "watch", name: "Felix's stopped watch", color: "amber" },
        { id: "lace", name: "Thread of black lace", color: "pink" },
        { id: "card", name: "Card in violet ink", color: "cyan" },
        { id: "programme", name: "Mrs Fairweather's programme", color: "cyan" },
        { id: "sketch", name: "Felix's sketchbook", color: "violet" },
        { id: "letter", name: "Felix's letter to Hale", color: "amber" },
        { id: "contract", name: "Copy contract", color: "green" },
        { id: "slip", name: "Switchboard carbon", color: "cyan" },
        { id: "ledger", name: "House ledger", color: "blue" },
        { id: "telegram", name: "Telegram from Lisbon", color: "violet" },
        { id: "polaroid", name: "Polaroid of the moth", color: "violet" },
        { id: "ticket", name: "Luggage ticket", color: "green" },
      ],
      conclusionQuestions: [
        "Who killed Felix Amsel, and how?",
        "Where is the real Lantern Girl, and how did she leave the hotel?",
        "What gave the killer away?",
      ],
      conclusionPrompt: "Who killed Felix Amsel, and how?",
      map: LOT14_MAP,
    },
    nodes: [...body, ...endings],
  };
}
