import {
  DEFAULT_SETTINGS,
  type Condition, type DecisionOption, type Effect, type InteractiveGraph, type NotebookEntry, type Route, type StoryNode,
} from "@/lib/interactive";

// "Lights Out at the Meridian: Lot 14". Interactive Case File, rebuilt to the
// neon route map: 3 openings, 9 first leads, item diamonds and locks, the Y/Z
// fork (the moth, or the warning), the G luggage ticket, 7 endings.
// END 6 (The Auctioneer) is the true solution. Loaded from the admin editor's
// template menu (lazy-loaded, so readers never download it); every line,
// choice, item and lock stays editable there. Note: this repository is public,
// so the solution can be read here by anyone browsing the source.

const p = (...paras: string[]) => paras.map((t) => `<p>${t}</p>`).join("");
const is = (v: string): Condition => ({ var: v, op: "truthy" });
const not = (v: string): Condition => ({ var: v, op: "falsy" });
const flag = (v: string): Effect => ({ var: v, op: "set", value: "true" });
const give = (item: string): Effect => ({ var: `item_${item}`, op: "set", value: "1" });
const note = (text: string): NotebookEntry => ({ kind: "note", text });
const evidence = (text: string): NotebookEntry => ({ kind: "evidence", text });

interface SceneExtra { label?: string; title?: string; routes?: Route[]; notebook?: NotebookEntry[] }
const scene = (id: string, content: string, next: string, extra: SceneExtra = {}): StoryNode => ({ id, type: "narrative", content, next, ...extra });
const decision = (id: string, title: string, context: string, options: DecisionOption[], timeLimit?: number): StoryNode => ({
  id, type: "decision", title, context, content: "", options, ...(timeLimit ? { timeLimit } : {}),
});
let optSeq = 0;
const option = (label: string, next: string, extra: Partial<DecisionOption> = {}): DecisionOption => ({ id: `o${++optSeq}`, label, next, ...extra });
/** Item choice: only for readers carrying the item (drawn in the item's colour, redacted for everyone else). */
const needs = (item: string, more: Condition[] = []): Partial<DecisionOption> => ({ requiresItem: item, visibleIf: [is(`item_${item}`), ...more] });
const ending = (id: string, endingTitle: string, endingText: string, content: string): StoryNode => ({ id, type: "ending", content, endingTitle, endingText });

// X before Y: tipping off Celeste (alerted) before finding the moth makes the
// bell captain's luggage ticket (G) unavailable and opens the harbour (Z).
const G_LOCK: Partial<DecisionOption> = { lockedIf: [is("alerted"), not("y_first")] };

const nodes: StoryNode[] = [
  // ════════ OPENING ════════
  scene("opening", p(
    "The Hotel Meridian has been dying elegantly for thirty years. Tonight it put on its pearls for the annual charity auction: three hundred guests in the Lantern Room, a string quartet, champagne on silver, and one painting everybody came to see. <em>The Lantern Girl</em>, Ilse Marrow, 1923. Lot 14.",
    "At 22:40 the lights went out. Four minutes of darkness, a few screams, a lot of laughter. When the chandeliers came back, the auction carried on as if nothing had happened, and at 22:51 Lot 14 sold for forty-one thousand dollars. A record for the house.",
    "At 22:47, somewhere under all that applause, a night porter found a man at the bottom of the service stairs with his neck broken.",
    "His name is Felix Amsel. He was a painter, and a guest, and nobody can tell you what he was doing below stairs. On the phone, the manager has already used the word <em>accident</em> four times.",
    "You have until the guests get their coats. After that, three hundred witnesses become three hundred taxis.",
  ), "d_start", {
    title: "Lot 14", label: "23:04 · Hotel Meridian, the harbour front · Saturday, 16 November 1974",
    notebook: [
      evidence("Lights out in the Lantern Room from 22:40 to 22:44."),
      evidence("Felix Amsel, painter, found dead at the foot of the B2 service stairs at 22:47."),
      note("Lot 14, The Lantern Girl (Ilse Marrow, 1923), sold at 22:51 for $41,000."),
    ],
  }),

  decision("d_start", "Where do you start?", "The coat queue is already forming.", [
    option("Go down to the body on the service stairs.", "a_stairs"),
    option("Stay with the room. Three hundred witnesses are about to go home.", "b_room"),
    option("Go up to the man who owns all of this.", "c_hale"),
  ]),

  // ════════ A · THE STAIRS ════════
  scene("a_stairs", p(
    "The service stairs are bare concrete and hospital-green paint, lit by one caged bulb. Felix Amsel lies at the bottom where the stairs turn, one arm folded under him, as if he tried to catch the floor and missed.",
    "He is somewhere in his forties, in a dinner jacket a size too hopeful. Paint under his fingernails, lantern yellow and Prussian blue. He smells of gin and turpentine. There is a gash at his temple, and the iron rail above him has a dark smear on its edge. His wristwatch has stopped at 22:42, the glass shattered.",
    "The house doctor has already decided. “He'd had a few, the lights went out, he missed his footing. It happens.” The manager, Mr Lindqvist, nods so hard his glasses slip.",
    "At the top of the stairs a big porter in a grey uniform stands very still, the way people stand when they would like to be furniture.",
  ), "d_stairs", {
    label: "23:09 · Service stairs B2",
    notebook: [evidence("Felix's watch stopped at 22:42, the glass smashed."), note("House doctor: a drunk man fell in the dark.")],
  }),

  decision("d_stairs", "The body on the stairs", "The manager wants it to be an accident.", [
    option("Kneel down and look at him properly.", "aa_body"),
    option("Talk to the porter who found him.", "ab_teddy"),
    option("Climb to the landing he fell from.", "ac_landing"),
    option("A drunk man and a dark staircase. Sign it off as an accident.", "end_misadventure"),
  ]),

  scene("aa_body", p(
    "You kneel. Up close, death is always smaller than you expect.",
    "The gash at his temple matches the rail. Fine. But when you open his shirt there is a second bruise, high on the chest, already darkening: the flat, spread shape of a palm. Men who fall in the dark do not get pushed by the dark.",
    "Then the watch. The glass is smashed, the hands say 22:42, and the winding crown is pulled all the way out. A watch stops when it breaks. It does not pull out its own crown. Somebody set this watch to a time they liked, and then broke it.",
    "In his breast pocket, a guest card: <em>Mr F. Amsel, guest of Varga &amp; Daughters</em>. On the side of his right hand, a smudge of violet ink.",
  ), "d_aa", {
    label: "23:12 · Foot of the stairs",
    notebook: [
      evidence("A second bruise on Felix's chest, the shape of a hand. He was pushed."),
      evidence("The watch was set to 22:42 and then broken: its crown is pulled out."),
      note("Felix was a guest of the auction house. Violet ink on his right hand."),
    ],
  }),

  decision("d_aa", "Someone set the watch", "The time of death is a lie.", [
    option("Pocket the watch. Follow the scuffs of his heels into the service corridor.", "corridor", { effects: [give("watch")] }),
    option("Pocket the watch. Find out who down here actually knew him.", "kitchen_pim", { effects: [give("watch")] }),
    option("Pocket the watch. Find out who turned the lights off.", "fuse_room", { effects: [give("watch"), flag("suspect_teddy")] }),
  ]),

  scene("ab_teddy", p(
    "The porter's brass badge says <em>T. Brandt</em>. He is the size of a wardrobe and the colour of milk.",
    "“Found him after the lights came back,” he says. “Quarter to eleven, near enough. I come down for more chairs and there he was.” He says it like a man reading something he wrote on his hand.",
    "His sleeves are damp to the elbow. He smells of laundry starch. There are fresh scratches across both palms, rows of little parallel lines, the kind you get from wrestling with something that has tacks in it. When he sees you looking, his hands go into his pockets.",
    "“Can I go? I'm on duty. Mr Lindqvist will have my job.”",
  ), "d_ab", {
    label: "23:11 · Top of the service stairs",
    notebook: [note("Teddy Brandt, night porter, says he found the body 'after the lights came back'."), evidence("Fresh scratches on Teddy's palms, as if from tacks or a frame.")],
  }),

  decision("d_ab", "The porter", "Teddy is edging towards the door.", [
    option("Let him go back to work, and follow him.", "corridor", { effects: [flag("suspect_teddy")] }),
    option("Ask him who turned the lights off.", "fuse_room", { effects: [flag("suspect_teddy")] }),
    option("Take his hands out of his pockets and ask about the scratches.", "teddy_cornered", { effects: [flag("suspect_teddy")] }),
  ], 30),

  scene("ac_landing", p(
    "Eleven steps up, the stairs turn at a small landing beside a door marked <strong>STORAGE · B2</strong>. This is where he fell from. You can see it in the dust, swept clean in one long curve by a sleeve.",
    "On the iron rail, caught on a burr in the metal, a single thread of black lace. Not cheap lace. The kind that comes on a pair of evening gloves.",
    "On the wall at shoulder height, a smear of varnish with a hair of lantern yellow in it, still tacky. Someone carried a freshly varnished painting past this spot tonight, close enough to kiss the wall.",
    "From far above, faintly, the quartet starts up again. Somebody has decided the party isn't over.",
  ), "d_ac", {
    label: "23:12 · The landing above",
    notebook: [evidence("A thread of black evening-glove lace on the rail where Felix fell."), evidence("Tacky varnish on the landing wall. A freshly varnished painting was carried past.")],
  }),

  decision("d_ac", "The landing", "Felix didn't fall alone.", [
    option("Take the lace. Follow the paint along the corridor.", "corridor", { effects: [give("lace")] }),
    option("Take the lace. Open the storage room.", "storage_b2", { effects: [give("lace")] }),
    option("Take the lace. Find out who in this building wears gloves like that.", "celeste_office", { effects: [give("lace")] }),
  ]),

  // ════════ B · THE ROOM ════════
  scene("b_room", p(
    "The Lantern Room is a gold wedding cake of a ballroom, slowly going stale. Three hundred guests in evening dress are discovering that a death below stairs is the most exciting thing that has happened to them all year.",
    "On the stage, two porters are lifting Lot 14 off its easel to crate it for the buyer, a shipping magnate called Erik Brandvold, who is shaking hands like a man who has just bought the moon. Even from here the painting glows: a girl on a dark quay at night, holding up a paper lantern, waiting for a ship.",
    "At the lectern, the auctioneer, Celeste Varga, is stacking bid cards in black lace gloves. And in the front row, an old woman in pearls is watching you with the expression of someone who has waited all evening for a detective and has decided you will do.",
  ), "d_room", {
    label: "23:07 · The Lantern Room",
    notebook: [note("Celeste Varga, auctioneer, Varga & Daughters. Black lace gloves."), note("Lot 14 was bought by Erik Brandvold, shipping.")],
  }),

  decision("d_room", "Three hundred witnesses", "The guests are starting to ask for their coats.", [
    option("Talk to the old woman in pearls.", "ba_fairweather"),
    option("Get to the painting before they crate it.", "bb_painting"),
    option("Speak to the auctioneer.", "bc_celeste"),
  ]),

  scene("ba_fairweather", p(
    "Mrs Odile Fairweather is eighty-one, has outlived three husbands and most of her doctors, and has been robbed, she tells you, in far better hotels than this.",
    "“My eyes are useless,” she says, “so I listen. And I write everything down.” She hands you her auction programme. In the margins, in a tiny shaking hand:",
    "<em>22:25 interval. 22:37 a thump behind the little door by the stage. 22:38 Miss V back at her desk, out of breath. Gloves changed? 22:40 dark. Someone counting by the easel, one two three four, like a waltz. Turpentine. 22:44 light. 22:51 sold.</em>",
    "“Keep it,” she says. “I've had a lovely evening. Nobody ever dies at the opera.”",
  ), "d_ba", {
    label: "23:10 · The front row",
    notebook: [evidence("Mrs Fairweather: a thump behind the stage door at 22:37. Miss Varga back at 22:38, out of breath. Someone counting by the easel in the dark.")],
  }),

  decision("d_ba", "Mrs Fairweather's programme", "Every line of it is a door.", [
    option("Ask about the thump behind the little door.", "corridor", { effects: [give("programme")] }),
    option("Ask about Miss Varga's gloves.", "celeste_office", { effects: [give("programme")] }),
    option("Ask about the turpentine in the dark.", "brandvold", { effects: [give("programme")] }),
  ]),

  scene("bb_painting", p(
    "You reach the stage as the porters lower Lot 14 into a crate lined with felt.",
    "Up close, <em>The Lantern Girl</em> is better than her reputation. The lantern seems to warm your face. The black water under the quay has twenty colours in it. Whoever painted this knew exactly what darkness is made of.",
    "And yet. There is a smell coming off the canvas, faint and sharp, like a painter's studio. And the varnish is too bright, like a new car in an old garage.",
    "“Mr Brandvold's property,” says a porter. “He wants it in his car in two minutes.”",
  ), "d_bb", { label: "23:09 · The auction stage" }),

  decision("d_bb", "Lot 14", "The crate lid is coming down.", [
    option("Put your nose to the canvas.", "brandvold", { effects: [flag("fresh_paint")] }),
    option("Ask the porters who handled the easel tonight.", "corridor", { effects: [flag("suspect_teddy")] }),
    option("Look closely at the darkest corner of the water.", "y_gate", { visibleIf: [is("moth_known")] }),
  ], 40),

  scene("bc_celeste", p(
    "Celeste Varga is somewhere past fifty and has decided not to tell anyone where. Silver hair pinned up, a black velvet dress, black lace gloves, a gold pen that writes in violet ink. Varga &amp; Daughters has auctioned half the fortunes in this city, and the other half are hoping to be next.",
    "“Poor Felix,” she says. “A lovely painter and a dreadful drinker. I invited him because Augustin asked me to. I wish I hadn't.” Her voice is perfectly sad. Her eyes are perfectly dry.",
    "She hands you her auction ledger before you ask. Every lot, every bid, every buyer, in tidy violet. Lot 14: hammer at 22:51, Brandvold, forty-one thousand. “Anything that helps, Sergeant.”",
    "Her left glove looks newer than her right.",
  ), "d_bc", {
    label: "23:10 · The lectern",
    notebook: [note("Celeste Varga: 'A lovely painter and a dreadful drinker.'"), evidence("Celeste's left glove looks newer than her right.")],
  }),

  decision("d_bc", "The auctioneer", "She is being very, very helpful.", [
    option("Thank her and take the ledger down to the front desk.", "lobby", { effects: [give("ledger")] }),
    option("Ask if you may see her office records.", "celeste_office", { effects: [give("ledger")] }),
    option("Tell her you don't think Felix fell.", "corridor", { effects: [give("ledger"), flag("alerted")] }),
  ]),

  // ════════ C · THE OWNER ════════
  scene("c_hale", p(
    "Augustin Hale owns the Meridian, or the Meridian owns him; at this point the bank is not sure. He is a big, soft man in a velvet jacket, standing at the window, watching the rain on the harbour with a brandy he isn't drinking.",
    "“Felix?” he says. “Celeste's friend. The painter. He was charming at dinner. He was charming at everything.” His voice cracks on the last word, and he doesn't explain why.",
    "A woman in a grey suit leans in the doorway with a notebook. “Rosalind Achter,” she says, not offering a hand. “Insurance. That painting was insured by my company until about twenty minutes ago, when it became Mr Brandvold's problem. I'm here to make sure nothing about tonight costs us money.”",
    "On Hale's desk: bills, a policy document, letters, and a framed photograph of a young woman on a quay.",
  ), "d_hale", { label: "23:06 · Owner's suite, eighth floor" }),

  decision("d_hale", "The owner", "Hale looks like a man who has lost more than a guest.", [
    option("Ask him about the girl in the painting.", "ca_clara"),
    option("Talk to the insurance investigator.", "cb_rosalind"),
    option("Look at the papers on his desk.", "cc_desk"),
  ]),

  scene("ca_clara", p(
    "Hale picks up the photograph. “My mother. Clara. 1923, on the old quay, waiting for my father's ship. It came in the next morning, but Ilse Marrow didn't paint that part.” He smiles. “She preferred the waiting.”",
    "He hands you an old auction catalogue from 1958, open at a full-page plate of the painting. “That's her before they cleaned the varnish. Every crack. I know every crack.”",
    "Then, quieter: “Felix made a copy for me this autumn. Celeste's idea, for travelling exhibitions. He worked in my attic for six weeks. He told me he always hides a little moth in the dark corner of his copies, so nobody can ever sell one as the real thing. So he could sleep at night, he said.” Hale looks at the rain. “I don't think he slept much.”",
  ), "d_ca", {
    label: "23:10 · Owner's suite",
    notebook: [evidence("1958 catalogue plate of the original Lantern Girl."), evidence("Felix hid a tiny moth in the dark corner of every copy he painted.")],
  }),

  decision("d_ca", "Clara on the quay", "Somewhere in this building there are two Lantern Girls.", [
    option("Go down and look at the dark corner of Lot 14.", "brandvold", { effects: [give("plate"), flag("moth_known")] }),
    option("Ask where the copy is now.", "storage_b2", { effects: [give("plate"), flag("moth_known")] }),
    option("Ask why he doubled the insurance.", "hale_truth", { effects: [give("plate"), flag("moth_known")] }),
  ]),

  scene("cb_rosalind", p(
    "Rosalind Achter walks you out into the corridor, out of Hale's hearing.",
    "“Three weeks ago he doubled the policy on that painting,” she says. “He owes the bank, the brewery, and a man on Atlantic Avenue who doesn't send letters. Tonight the lights go out during his lot, and a man dies in his basement. I've done this job for twenty-two years, Sergeant. When it looks like this, it's usually exactly what it looks like.”",
    "She says it with total confidence. She also says it a little too fast, the way people do when the obvious answer is also the cheapest one for their employer.",
  ), "d_cb", {
    label: "23:09 · Corridor, eighth floor",
    notebook: [note("Rosalind Achter, insurance: Hale doubled the policy three weeks ago and is badly in debt.")],
  }),

  decision("d_cb", "The insurer", "Her company pays nothing if this is fraud.", [
    option("Ask her to lay out her whole theory.", "rosalind_office"),
    option("Ask her who else gets paid tonight.", "celeste_office", { effects: [flag("premium")] }),
    option("Ask her to come and look at the painting with you.", "brandvold"),
  ]),

  scene("cc_desk", p(
    "Hale's desk is a museum of bad news. Final demands. The brewery. The bank, twice. And a new insurance policy for <em>The Lantern Girl</em>, value doubled, signed three weeks ago.",
    "Under it, unopened until you open it, a letter on cheap paper in a looping hand:",
    "<em>Dear Mr Hale, the faithful copy is finished, and Miss Varga tells me it will travel to Lisbon in the spring. I must say I am uneasy. Copies have a way of becoming originals when nobody is looking. I would like to speak to you privately after the auction. Yours, Felix Amsel.</em>",
    "Hale reads it over your shoulder and turns the colour of his brandy. “It came this morning,” he says. “I never opened it. I never opened anything.”",
  ), "d_cc", {
    label: "23:11 · Hale's desk",
    notebook: [evidence("Felix's letter to Hale: the copy is going to Lisbon. 'Copies have a way of becoming originals.'")],
  }),

  decision("d_cc", "The letter", "Felix wanted to talk. He never got the chance.", [
    option("Go down to storage and see the copy for yourself.", "storage_b2", { effects: [give("letter")] }),
    option("Ask Hale who told him to double the policy.", "hale_truth", { effects: [give("letter")] }),
    option("Ring the auction house desk and ask Miss Varga about Lisbon.", "lobby", { effects: [give("letter"), flag("alerted")] }),
  ]),

  // ════════ THE MIDDLE OF THE NIGHT ════════
  scene("fuse_room", p(
    "The fuse room is a hot cupboard behind the stage, full of humming and old cobwebs: ten steps from the easel, three from the top of the B2 stairs. The main breaker has been thrown by hand; you can see the grey crescent of a thumbprint on the lever. Storms don't leave thumbprints.",
    "On a nail beside the board hangs a porter's cap with <em>T. BRANDT</em> inked inside the band. Tucked into the band, a small card in violet ink: <em>22:40. Count to 240. Then back on.</em>",
    "Somebody planned four minutes of darkness down to the second. And somebody else is coming down the stairs right now, heavy and in no hurry.",
  ), "d_fuse", {
    label: "23:16 · Fuse cupboard behind the stage",
    notebook: [evidence("The main breaker was thrown by hand."), evidence("Card in violet ink in Teddy Brandt's cap: '22:40. Count to 240. Then back on.'")],
  }),

  decision("d_fuse", "Footsteps", "Someone is coming back for his cap.", [
    option("Kill your torch and wait for him in the dark.", "teddy_cornered", { effects: [flag("suspect_teddy")] }),
    option("Slip out along the cable run into the service corridor.", "corridor", { effects: [flag("suspect_teddy")] }),
    option("Take the card and slip through to the kitchen.", "kitchen_pim", { effects: [flag("suspect_teddy")] }),
  ], 25),

  scene("corridor", p(
    "The service corridor runs behind the Lantern Room like a secret the hotel keeps from its guests: bare bulbs, hot pipes, a laundry chute, and two black scuffs on the linoleum where a heavy cart was pushed fast.",
    "The tracks start at a narrow door behind the stage curtain and run past the top of the B2 stairs, past the laundry, towards the loading dock. On the rail at the top of the stairs, something small and dark flutters in the draught from the chute.",
    "Through the kitchen door at the far end, someone is crying and trying very hard to do it quietly.",
  ), "d_corr", {
    label: "23:18 · Service corridor",
    notebook: [evidence("Cart tracks run from the hidden stage door to the laundry and the loading dock.")],
  }),

  decision("d_corr", "Behind the walls", "Everything that left the stage in the dark came this way.", [
    option("Follow the cart tracks into the laundry.", "laundry"),
    option("Check the rail at the top of the stairs, then go to whoever is crying.", "kitchen_pim", { effects: [give("lace")] }),
    option("Try the storage room door.", "storage_b2"),
    option("Go back up and get everyone into one room.", "gathering"),
  ]),

  scene("kitchen_pim", p(
    "His name is Pim, he is nineteen, and he has been washing the same champagne glass for ten minutes.",
    "“Felix was teaching me to draw,” he says. “On my breaks. He said I had good hands for it.” He wipes his face with a wet sleeve. “At twenty past ten he came in here and gave me his sketchbook. He said, keep this until midnight, and if I don't come back for it, give it to the police. Not to anyone else. Not to anyone from upstairs.”",
    "He looks at the door as if it might be listening. “Teddy said if I talked to anyone about anything tonight, I'd never work in this city again.”",
    "The kitchen manager bangs on the pass. “Staff go home in thirty seconds! Union rules!”",
  ), "d_pim", {
    label: "23:21 · The scullery",
    notebook: [note("Felix gave Pim his sketchbook at 22:20: 'If I don't come back, give it to the police.'"), note("Teddy Brandt threatened Pim tonight.")],
  }),

  decision("d_pim", "The boy at the sink", "Pim is being sent home.", [
    option("Ask Pim for the sketchbook.", "sketchbook"),
    option("Ask him what Teddy is so afraid of.", "teddy_cornered", { effects: [flag("suspect_teddy")] }),
    option("He has a dead man's belongings and a reason to cry. Take him in.", "end_wrong_man"),
  ], 30),

  scene("storage_b2", p(
    "Storage B2 is crates, gilt chairs and thirty years of Christmas decorations. In the middle stands a tall crate stencilled <em>MERIDIAN FINE ART · VIA LISBON · FRAGILE</em>. This is where the copy has lived since Felix finished it.",
    "The lid has been prised off and leaned against the wall. Inside: straw, a felt lining, and nothing else. The straw smells sharply of turpentine.",
    "The copy of <em>The Lantern Girl</em> is not here. It was taken out tonight.",
    "On the shipping label, in violet ink: <em>Consigned by C. Varga.</em>",
  ), "d_store", {
    label: "23:24 · Storage B2",
    notebook: [evidence("The crate that held Felix's copy is empty. It was opened tonight."), evidence("Shipping label in violet ink: consigned by C. Varga.")],
  }),

  decision("d_store", "The empty crate", "If the copy isn't down here, where is it?", [
    option("Take the label up to the front desk.", "lobby"),
    option("Find out who is holding the painting that sold.", "brandvold"),
    option("Go up to the auctioneer's office.", "celeste_office"),
    option("Check the rail on the landing outside, then find out who down here knew him.", "kitchen_pim", { effects: [give("lace")] }),
  ]),

  scene("brandvold", p(
    "Erik Brandvold owns eleven ships and stands as if all of them are behind him. The crate with Lot 14 sits at his feet. His chauffeur is holding his coat.",
    "“I examined her at a quarter past ten,” he says, “before the bidding. Beautiful. Old. She smelled of dust and history.” He frowns. “Now she smells like a hardware shop. I assumed it was the hotel.”",
    "He checks his watch. “Sergeant, I have just paid forty-one thousand dollars for a painting, and I would like to take it home before anyone else dies.”",
  ), "d_brand", {
    label: "23:27 · The Blue Salon",
    notebook: [evidence("Brandvold: at 22:15 the painting smelled of dust. After the blackout it smells of turpentine.")],
  }),

  decision("d_brand", "The buyer", "His chauffeur is holding the door.", [
    option("Ask him to open the crate so you can see the dark corner of the water.", "y_gate", { visibleIf: [is("moth_known")] }),
    option("Hold the 1958 catalogue plate up next to it.", "y_gate", { ...needs("plate"), effects: [flag("moth_known")] }),
    option("Ask who touched the painting during the blackout.", "celeste_office", { effects: [flag("fresh_paint")] }),
    option("Let him go. You know where he lives.", "lobby"),
  ], 35),

  scene("hale_truth", p(
    "Hale sits down as if somebody pulled the chair out of him.",
    "“Yes, I'm broke. Yes, I doubled the policy. Celeste said a careful man protects his assets. She said the copy was for exhibitions, and that I should put the painting in the charity auction because the publicity would save the hotel.” He laughs, badly. “She also told me to stay up here all evening, in front of witnesses, so nobody could ever say I went near the painting. I thought she was protecting me.”",
    "He looks at his hands. “Everything I did tonight, Celeste suggested. Everything.”",
  ), "d_hale2", {
    label: "23:30 · Owner's suite",
    notebook: [evidence("Hale: Celeste suggested the auction, the copy, the doubled policy, and his alibi.")],
  }),

  decision("d_hale2", "Everything she suggested", "Hale is telling the truth, or he is very good.", [
    option("Ask where Celeste said the copy was going.", "lobby"),
    option("Show him Felix's letter and ask what Felix was so uneasy about.", "y_gate", { ...needs("letter"), effects: [flag("moth_known")] }),
    option("He had every reason. Arrest him.", "end_owner"),
    option("Bring him down to the Lantern Room.", "gathering"),
  ]),

  scene("lobby", p(
    "The lobby is marble, brass and impatience. Guests queue for their coats, the night clerk Mr Okafor answers three telephones with two hands, and through the revolving doors a line of taxis waits in the rain.",
    "Behind the desk, the house safe. Beside the doors, the bell captain's stand, where a thin man called Moss is pretending to read a newspaper and listening to everything.",
    "“Sergeant,” says Mr Okafor, “Mr Lindqvist says nobody opens the safe without a reason.”",
  ), "d_lobby", { label: "23:36 · Front desk" }),

  decision("d_lobby", "The front desk", "The coat queue is getting shorter.", [
    option("Give him a reason: compare Miss Varga's ledger with the house copy.", "house_ledger", needs("ledger")),
    option("Talk to the bell captain. Bell captains see everything that leaves.", "g_ticket", G_LOCK),
    option("Stop the woman in grey heading for a taxi.", "rosalind_office"),
    option("Go round the back to the laundry and the loading dock.", "laundry"),
  ], 45),

  scene("rosalind_office", p(
    "You catch Rosalind Achter under the awning, one hand raised for a taxi.",
    "“I'll save you the trouble,” she says. “Hale needed money. Hale doubled the policy. Hale had a copy made in his own attic. Felix Amsel was going to tell someone something, and now he can't. Arrest Hale, Sergeant, and we can all go to bed.”",
    "The rain drums on the awning. A taxi pulls up. She doesn't get in.",
  ), "d_ros", { label: "23:38 · Hotel entrance" }),

  decision("d_ros", "A convenient story", "Her taxi is waiting.", [
    option("She's right. Arrest Augustin Hale.", "end_owner"),
    option("Ask her who else makes money if a painting disappears.", "house_ledger", { effects: [flag("premium")] }),
    option("Show her Mrs Fairweather's programme.", "g_ticket", { ...needs("programme"), ...G_LOCK }),
  ]),

  scene("sketchbook", p(
    "The sketchbook is soft with use. Page after page of <em>The Lantern Girl</em>: her hands, the lantern, the water. In the margins, over and over, small careful moths.",
    "The last page is a letter that was never sent:",
    "<em>C.V. says the sister stays here and the girl goes to Lisbon. That makes me a forger and her a rich woman. I told her tonight: after Lot 14 I tell Hale everything. She said she understood. She smiled. I don't like it when she smiles. F.</em>",
    "Under it, in pencil, a moth hiding in black water beneath a lantern.",
  ), "d_sketch", {
    label: "23:25 · The scullery",
    notebook: [evidence("Felix's sketchbook: 'C.V. says the sister stays here and the girl goes to Lisbon.'"), evidence("Felix told C.V. tonight he would tell Hale everything after Lot 14.")],
  }),

  decision("d_sketch", "The girl and her sister", "Felix was afraid of one person.", [
    option("Go and find the moth in Lot 14.", "y_gate", { effects: [give("sketch"), flag("moth_known")] }),
    option("Find Teddy Brandt.", "teddy_cornered", { effects: [give("sketch"), flag("moth_known"), flag("suspect_teddy")] }),
    option("Go straight to C.V.'s office.", "celeste_office", { effects: [give("sketch"), flag("moth_known")] }),
  ]),

  scene("celeste_office", p(
    "Varga &amp; Daughters keeps a small office on the mezzanine. It is neat as a chapel: a typewriter, a vase of white lilies, a fountain pen full of violet ink, and an open box of evening gloves with one left glove missing.",
    "Under the blotter, the corner of a telegram. In the wastepaper basket, something black and soft.",
    "Down the corridor you hear her heels, and her voice, thanking someone warmly. She will be back in under a minute.",
  ), "d_office", { label: "23:40 · Varga & Daughters office, mezzanine" }),

  decision("d_office", "Her office", "Celeste is on her way back.", [
    option("Read the telegram under the blotter.", "telegram", { effects: [flag("telegram")] }),
    option("Match your lace to whatever is in the wastepaper basket.", "glove_match", { ...needs("lace"), effects: [flag("lace_matched")] }),
    option("Sit down in her chair and wait for her.", "gathering", { effects: [flag("alerted")] }),
  ], 35),

  scene("glove_match", p(
    "In the basket: a black lace evening glove. Left hand. The lace is torn at the wrist, and a thread is missing.",
    "You lay your thread against the tear. It fits like a key in a lock.",
    "Celeste Varga was on the B2 stairs tonight, close enough to Felix Amsel to leave a piece of herself on the rail. You put the glove back exactly as it was, and you are out of the door before her heels reach the corner.",
  ), "laundry", { label: "23:41 · Varga & Daughters office", notebook: [evidence("Celeste's torn left glove: the lace from the rail fits the tear.")] }),

  scene("telegram", p(
    "<strong>DUARTE CONFIRMS. FUNDS LISBON ON DELIVERY. ARRIVE SUNDAY. COME ALONE. LEAVE THE SISTER.</strong>",
    "The sister. The copy. Somebody in Lisbon is paying for the original, and doesn't want the copy anywhere near it.",
    "You slide the telegram back a second before the door opens, and smile at Miss Varga like a man admiring her lilies. She smiles back. Neither of you means it.",
  ), "house_ledger", { label: "23:41 · Varga & Daughters office", notebook: [evidence("Telegram: 'Duarte confirms. Funds Lisbon on delivery. Leave the sister.'")] }),

  scene("laundry", p(
    "The laundry is steam, pipes and folded sheets. On the sorting table lies the thing nobody was supposed to see: an empty wooden stretcher, a few threads of old canvas still tacked to its edges. Somebody cut a painting off this frame and rolled it up in here.",
    "Beside it stands the laundry cart from the corridor, and on a hook hangs a porter's jacket. In the pocket, a railway timetable with the 01:15 night train to the coast circled twice.",
    "The handle on the far door begins to turn.",
  ), "d_laundry", {
    label: "23:45 · Laundry room",
    notebook: [evidence("Empty stretcher in the laundry: the original canvas was cut out and rolled here."), evidence("Porter's jacket: the 01:15 night train circled twice.")],
  }),

  decision("d_laundry", "The handle turns", "Someone is coming in.", [
    option("Duck behind the linen carts and listen.", "overheard", { effects: [flag("heard_train"), flag("suspect_teddy")] }),
    option("Stand where you are and see who it is.", "teddy_cornered", { effects: [flag("suspect_teddy")] }),
    option("Grab the timetable and run for the bell captain.", "g_ticket", { ...G_LOCK, effects: [flag("heard_train")] }),
  ], 20),

  scene("overheard", p(
    "It's Teddy Brandt. He picks up the laundry's wall telephone and dials without looking.",
    "“It's done, Miss. It's on the van.” A pause. “No. Nobody saw me.” A longer pause, and his voice goes thin. “You didn't tell me about him. You didn't tell me there'd be a man on the stairs.” He listens. He closes his eyes. “Yes, Miss. The one-fifteen. I know.”",
    "He hangs up and leans his forehead against the wall. That's when you step out from behind the sheets.",
  ), "teddy_cornered", { label: "23:47 · Laundry room", notebook: [evidence("Teddy on the phone: 'You didn't tell me there'd be a man on the stairs. Yes, Miss. The one-fifteen.'")] }),

  // ════════ Y / Z: THE MOTH, OR THE WARNING ════════
  scene("y_gate", p(
    "You go back to the Blue Salon, where Lot 14 should still be waiting in its felt-lined crate.",
  ), "y_moth", { label: "23:49 · Mezzanine", routes: [{ conditions: [is("alerted")], to: "z_withdrawn" }] }),

  scene("y_moth", p(
    "Brandvold grumbles, but he lets you lift the felt. You angle a desk lamp across the canvas.",
    "Black water. Twenty colours of it. And there, low in the corner where the lantern gives up, so small you could cover it with a fingernail: a moth. Wings folded. Patient.",
    "It is not in the 1958 catalogue plate. It was not there in 1923. Felix Amsel put it there this autumn so that he could sleep at night.",
    "Lot 14 is the sister. Erik Brandvold has just paid forty-one thousand dollars for a copy, and the real <em>Lantern Girl</em> left this building in the dark.",
    "You take a Polaroid. In the flash, the moth seems to move.",
  ), "d_y", { label: "23:50 · The Blue Salon", notebook: [evidence("Lot 14 is Felix's copy: his moth is in the dark corner. The original was swapped during the blackout.")] }),

  decision("d_y", "The moth", "The original is somewhere between here and the sea.", [
    option("Find out how the original left. Bell captains see everything.", "g_ticket", { ...G_LOCK, effects: [give("polaroid"), flag("y_first"), flag("swap_proven")] }),
    option("Find the porter who carried it out.", "teddy_cornered", { effects: [give("polaroid"), flag("y_first"), flag("swap_proven"), flag("suspect_teddy")] }),
    option("Go back to the Lantern Room and tell them all Lot 14 is a fake.", "gathering", { effects: [give("polaroid"), flag("y_first"), flag("swap_proven"), flag("alerted")] }),
  ]),

  scene("z_withdrawn", p(
    "The Blue Salon is empty except for Erik Brandvold, who is shouting at a telephone.",
    "“Withdrawn for authentication!” he tells you. “Miss Varga's people carried my painting upstairs twenty minutes ago. Some question of provenance! Forty-one thousand dollars and I'm told there is a <em>question!</em>”",
    "Upstairs, her office door stands open. The lilies are still there. The gloves are gone. In the wastepaper basket: a crumpled telegram draft, <em>CHANGE OF PLAN. SANTA LUCIA. PIER 9. 0130</em>, and the torn half of a boarding card for the night steamer to Lisbon.",
    "You let her see you coming. She has changed trains for the sea.",
  ), "d_z", { label: "23:50 · The Blue Salon", notebook: [evidence("Celeste withdrew Lot 14 'for authentication' and changed plans: the Santa Lucia, Pier 9, 01:30.")] }),

  decision("d_z", "She heard you coming", "The Santa Lucia sails at 01:30.", [
    option("Pier 9. Now.", "harbour", { effects: [give("ferry")] }),
    option("Check the railway station in case the boat is a trick.", "station", { effects: [give("ferry")] }),
    option("Go back to the Lantern Room and name her in front of everyone.", "gathering", { effects: [give("ferry")] }),
  ], 30),

  scene("house_ledger", p(
    "Mr Okafor opens the safe with the air of a man who will be blaming you later. Inside: the house copy of tonight's auction ledger, written up by Miss Varga's office in the afternoon, before anyone bid on anything.",
    "It does not match hers. Beside Lot 14, in violet ink: <em>Reserve not met. Private treaty, Lisbon. Commission 40%, C.V.</em>",
    "Lot 14 was sold to Lisbon this afternoon. Then it was sold to Brandvold tonight. One painting can't be sold twice. Two can.",
  ), "d_house", { label: "23:47 · The house safe", notebook: [evidence("House ledger: Lot 14 privately sold to Lisbon before the auction. 40% to C.V.")] }),

  decision("d_house", "Sold twice", "Two buyers, one painting, and one of them is getting a copy.", [
    option("Find the bell captain.", "g_ticket", { ...G_LOCK, effects: [flag("private_sale"), give("ledger")] }),
    option("Go back to the Lantern Room and lay it all out.", "gathering", { effects: [flag("private_sale"), give("ledger")] }),
    option("Go to the station. Lisbon means a train to the coast.", "station", { effects: [flag("private_sale"), give("ledger")] }),
  ]),

  // ════════ G: THE LUGGAGE TICKET ════════
  scene("g_ticket", p(
    "Moss folds his newspaper. “Information is a service, Sergeant. Services have prices.” You put five dollars on his stand. He puts a pink carbon slip on top of it.",
    "“Steamer trunk, Varga &amp; Daughters account. <em>Sample books, do not tilt.</em> Booked through on the 01:15 night train to the coast, connecting with the Lisbon boat. Teddy took it out the back in the laundry van at five to eleven. Light as a picture, he said.” Moss smiles. “I didn't say anything back. I'm a professional.”",
    "The 01:15. The clock over the lobby says 23:56.",
  ), "d_g", { label: "23:55 · Bell captain's stand", notebook: [evidence("Luggage ticket: a Varga & Daughters trunk of 'sample books' on the 01:15 night train.")] }),

  decision("d_g", "The luggage ticket", "Moss goes off shift in a minute.", [
    option("Get to the station before the 01:15 leaves.", "station", { effects: [give("ticket")] }),
    option("Go back to the Lantern Room and name her first.", "gathering", { effects: [give("ticket")] }),
    option("Find Teddy Brandt on your way out.", "teddy_cornered", { effects: [give("ticket")] }),
  ], 40),

  // ════════ THE PORTER ════════
  scene("teddy_cornered", p(
    "Teddy Brandt is big, but he is tired, and he has been carrying something heavier than a painting all night. When you put the cuffs on him, he looks almost grateful.",
    "“I threw a switch,” he says. “I swapped two frames in the dark. I practised it a hundred times with my eyes shut, counting. I moved a box. That's all I did. You can't hang a man for a box.”",
    "He won't look at you. He looks at the floor, as if there is someone lying on it.",
  ), "d_teddy", { label: "23:52 · Teddy Brandt" }),

  decision("d_teddy", "The porter", "Scared men either talk or lie.", [
    option("That's enough. Charge him with Felix Amsel's death.", "end_hired_hand"),
    option("Show him the last page of Felix's sketchbook.", "teddy_flips", { ...needs("sketch"), effects: [flag("teddy_saw")] }),
    option("Show him the broken watch, and ask what time he really found the body.", "teddy_flips", { ...needs("watch"), effects: [flag("teddy_saw")] }),
    option("Ask him who he works for.", "gathering", { effects: [flag("teddy_lied")] }),
  ], 25),

  scene("teddy_flips", p(
    "Teddy stares at what you are holding for a long time. Then he starts talking, fast, like a man who has been holding his breath since half past ten.",
    "“Miss Varga. She hired me. Four minutes of dark, swap the frames, cut the real one off its stretcher in the laundry, trunk on the van, trunk on the one-fifteen. Five hundred dollars.” He swallows. “I went to the fuse cupboard at twenty to eleven. A minute early. I looked down the stairs and he was already lying there, Sergeant. At the bottom. With the lights on. Before I touched anything.”",
    "“Then that watch says 22:42 because somebody wanted it to,” you say.",
    "“Not me. I never touched him. I threw the switch and I counted to two hundred and forty and I cried in the dark like a kid.” He finally looks up. “She's on the one-fifteen. She's going with it.”",
  ), "station", { label: "23:58 · Teddy Brandt", notebook: [evidence("Teddy: Felix was already dead before the lights went out. Celeste Varga hired him to swap the frames and ship the trunk.")] }),

  // ════════ THE LANTERN ROOM ════════
  scene("gathering", p(
    "You have them all brought back into the Lantern Room: Hale, Pim, Rosalind Achter, Teddy Brandt, Erik Brandvold and his crate, three hundred guests, and a quartet who would like to be paid.",
    "Everyone except one. The lectern is empty. Miss Varga stepped out twenty minutes ago to make a telephone call, and the telephone call has not finished.",
    "Three hundred faces turn towards you. Somebody in this room, or recently in it, killed Felix Amsel. Point.",
  ), "d_gather", { label: "00:10 · The Lantern Room" }),

  decision("d_gather", "Name the killer", "Everyone is waiting for you to point.", [
    option("Point at Pim, the waiter who had the dead man's sketchbook.", "end_wrong_man"),
    option("Point at Augustin Hale.", "end_owner"),
    option("Point at Teddy Brandt.", "end_hired_hand", { visibleIf: [is("suspect_teddy")] }),
    option("Tell them it was an accident, and let them all go home.", "end_misadventure"),
    option("Name Celeste Varga, and run for the station.", "station", { effects: [flag("alerted")] }),
  ], 60),

  // ════════ THE STATION / THE HARBOUR ════════
  scene("station", p(
    "Central Station at one in the morning is fog, steam, and a voice on the loudspeaker that nobody can understand. The 01:15 to the coast breathes at Platform 4, long and dark, its windows yellow.",
  ), "platform", { label: "00:58 · Central Station", routes: [{ conditions: [is("alerted")], to: "station_empty" }] }),

  scene("platform", p(
    "Halfway down the platform, two porters are lifting a steamer trunk into the baggage car. <em>Sample books. Do not tilt.</em> Beside them, in a dark travelling coat and a fresh pair of black lace gloves, Celeste Varga is tipping them a dollar each.",
    "She sees you. For the first time tonight, the smile arrives a second late.",
    "“Sergeant,” she says. “You've come to see me off. How kind. Augustin will be so pleased you found the time.”",
    "Down the platform, the guard lifts his whistle.",
  ), "d_platform", { label: "01:09 · Platform 4" }),

  decision("d_platform", "Platform 4", "The guard is lifting his whistle.", [
    option("Lay it out: the luggage ticket, the torn lace, the moth.", "end_mastermind", needs("ticket", [is("item_lace"), is("item_polaroid")])),
    option("Forget her. Get that trunk off the train.", "end_canvas_only"),
    option("Accuse her of murder, here, now, and hope she breaks.", "end_last_train"),
  ], 20),

  scene("station_empty", p(
    "Platform 4 is nearly empty. A porter tells you that a lady in black gloves came in at half past twelve, had her trunk taken off the 01:15, and left in a taxi towards the docks.",
    "“Said she'd gone off trains,” he says.",
    "Somebody told her you were coming. Possibly you.",
  ), "d_empty", { label: "01:02 · Central Station" }),

  decision("d_empty", "Gone to the sea", "Whatever she's on, it isn't a train.", [
    option("Pier 9. The Santa Lucia.", "harbour", needs("ferry")),
    option("Wire the coast police and hope.", "end_last_train"),
  ], 20),

  scene("harbour", p(
    "Pier 9 smells of diesel and open sea. The <em>Santa Lucia</em> is lit up like a wedding cake, her gangway already lifting. A crane swings a steamer trunk over her rail. <em>Sample books. Do not tilt.</em>",
    "At the top of the gangway Celeste Varga turns, one gloved hand on the rail, and watches you run the length of the pier. She doesn't move. She has never needed to run from anything.",
    "“Sergeant,” she calls down. “Lisbon is lovely in winter. You should see it.”",
  ), "d_harbour", { label: "01:24 · Pier 9" }),

  decision("d_harbour", "Pier 9", "The gangway is rising.", [
    option("Lay it out: her boarding card, the torn lace, Felix's last page.", "end_mastermind", needs("ferry", [is("item_lace"), is("item_sketch")])),
    option("Stop the crane. Get the trunk.", "end_canvas_only"),
    option("Shout her name across the water.", "end_last_train"),
  ], 25),

  // ════════ ENDINGS (in map order: END 1 … END 7) ════════
  ending("end_misadventure", "Misadventure",
    "Felix Amsel's death is recorded as an accident. The auction is a triumph. The real Lantern Girl reaches Lisbon on Sunday.",
    p("The coroner agrees with the house doctor: a drunk man, a dark staircase. The Meridian sends flowers to a funeral nobody attends.",
      "Three weeks later a postcard arrives at the hotel with no signature. Just a drawing of a lantern, and a very small moth. Nobody at the Meridian understands it.")),
  ending("end_wrong_man", "The Wrong Man",
    "Pim is charged with the death of Felix Amsel. He is released two days later and never works in a hotel again. The killer was never in the room.",
    p("Pim doesn't cry in the car. He holds Felix's sketchbook on his knees the whole way, the way Felix asked him to.",
      "At the station house you finally open it. On the last page you read the initials C.V., and by then the 01:15 has been gone for an hour.")),
  ending("end_hired_hand", "The Hired Hand",
    "Teddy Brandt is charged with the death of Felix Amsel. He threw a switch and moved a box. He never killed anyone.",
    p("Teddy doesn't fight it. He doesn't say anything, because nobody asks him the right question.",
      "At 01:15 a night train leaves for the coast with a steamer trunk in the baggage car, and in first class a woman in black gloves sleeps very well.")),
  ending("end_last_train", "Last Train",
    "The Lantern Girl leaves the city, and so does the woman who killed for her.",
    p("You watch the lights go: a red lamp vanishing into fog, or a ship's stern sliding into the dark.",
      "Three weeks later a painting matching Clara's description changes hands in Lisbon for a sum the newspapers call undisclosed. Felix Amsel's file stays on your desk until the day you retire.")),
  ending("end_owner", "The Owner's Debt",
    "Augustin Hale is arrested for fraud and murder. He did neither. The woman who suggested everything he did sends flowers.",
    p("The newspapers love it: the broke hotelier, the doubled policy, the body in the basement. Rosalind Achter's company pays nothing.",
      "Hale's lawyers take six months to tear the case apart. By then the Meridian is closed, the painting is in Lisbon, and Celeste Varga has written Hale a very kind letter of sympathy.")),
  ending("end_mastermind", "The Auctioneer",
    "Celeste Varga is arrested for the murder of Felix Amsel. The real Lantern Girl comes home. Case closed.",
    p("You don't raise your voice. You don't need to. You hold each thing up in the light, one after the other, the way she held up lots all evening.",
      "The thread of lace from the rail where Felix fell, and the torn glove it came from. The trunk she sent ahead under her own account, light as a picture. And Felix's moth, waiting in the dark corner of the copy Brandvold paid forty-one thousand dollars for.",
      "“He was going to tell Augustin,” she says at last. She says it the way you would mention the weather. “After Lot 14. I asked him to wait on the stairs for one minute so we could talk. One minute.” She peels off her gloves, finger by finger, and hands them to you like a lot she is withdrawing from sale. “Four minutes of darkness, Sergeant. It should have been enough.”",
      "“It was,” you tell her. “For you to make one mistake.”",
      "When they open the trunk, Clara is inside, rolled in tissue paper, holding up her lantern on the old quay, waiting for her ship. This time it comes.")),
  ending("end_canvas_only", "Saved, Not Solved",
    "You recover the real Lantern Girl from a steamer trunk. The person who killed Felix Amsel walks away.",
    p("The trunk opens on a roll of old canvas wrapped in an auction catalogue. When you unroll it under the lights, Clara looks up from her quay as if she has been waiting fifty years for exactly you.",
      "Hale cries when he sees her. Somewhere between here and Lisbon, a woman in black gloves orders a second glass of something cold, and the file on Felix Amsel stays open for eleven years.")),
];

// Endings in the order they should read on the map: END 1 … END 7 (END 6 = the truth).
const ENDING_ORDER = ["end_misadventure", "end_canvas_only", "end_hired_hand", "end_last_train", "end_owner", "end_mastermind", "end_wrong_man"];

export function lot14Graph(): InteractiveGraph {
  const body = nodes.filter((n) => n.type !== "ending");
  const endings = ENDING_ORDER.map((id) => nodes.find((n) => n.id === id)!);
  return {
    startNodeId: "opening",
    settings: {
      ...DEFAULT_SETTINGS,
      replay: "after_wait",
      replayWaitHours: 168,
      guestAccess: "two_choices",
      endingVisibility: "count",
      items: [
        { id: "watch", name: "Felix's stopped watch", color: "amber" },
        { id: "lace", name: "Thread of black lace", color: "pink" },
        { id: "programme", name: "Mrs Fairweather's programme", color: "cyan" },
        { id: "ledger", name: "Auction ledger", color: "blue" },
        { id: "plate", name: "1958 catalogue plate", color: "green" },
        { id: "letter", name: "Felix's letter to Hale", color: "amber" },
        { id: "sketch", name: "Felix's sketchbook", color: "violet" },
        { id: "polaroid", name: "Polaroid of the moth", color: "violet" },
        { id: "ticket", name: "Luggage ticket", color: "green" },
        { id: "ferry", name: "Santa Lucia boarding card", color: "blue" },
      ],
      conclusionQuestions: [
        "Who killed Felix Amsel, and how?",
        "Where is the real Lantern Girl, and how did she leave the hotel?",
        "What gave the killer away?",
      ],
      conclusionPrompt: "Who killed Felix Amsel, and how?",
    },
    nodes: [...body, ...endings],
  };
}
