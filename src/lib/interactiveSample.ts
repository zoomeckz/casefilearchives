import { DEFAULT_SETTINGS, type InteractiveGraph, type StoryNode } from "@/lib/interactive";

// Short starter case (~10–15 minutes) used by the admin editor's
// "Load example case" button. It exercises every engine feature: four-way
// branching, variables, conditional scenes, a convergence point, visible /
// locked options that depend on earlier choices, conditional routes, and six
// endings. Authors are expected to rewrite the prose.

const p = (...paras: string[]) => paras.map((t) => `<p>${t}</p>`).join("");

const nodes: StoryNode[] = [
  {
    id: "opening",
    type: "narrative",
    label: "Location: 14 Harrow Lane · 23:41",
    title: "The Call",
    content: p(
      "The call lasted nineteen seconds. A voice you did not recognise said your name, then the address, then: <em>“Please. Before it happens again.”</em>",
      "Harrow Lane ends where the streetlights do. The house sits back from the road behind a hedge nobody has cut in years. Every window is dark except one, upstairs, where a lamp burns behind a drawn curtain.",
      "Four people are standing on the gravel when you arrive. None of them made the call — or so each of them says.",
      "<strong>Mara</strong>, coat buttoned wrong, keys clenched in her fist: “I got out. Whatever you do, don’t go downstairs.”",
      "<strong>Daniel</strong>, breathing hard: “She’s lying. My sister is in the basement. Mara locked the door.”",
      "<strong>Eli</strong>, staring up at the lit window: “Someone died up there. I watched it happen. I watched the shadow fall.”",
      "<strong>Noor</strong>, already walking back toward the road: “All of them are lying. If you have any sense, you’ll leave with me. Now.”",
    ),
    next: "d_witnesses",
  },
  {
    id: "d_witnesses",
    type: "decision",
    title: "Select testimony",
    content: "",
    context: "Four incompatible accounts. You can only follow one of them tonight.",
    options: [
      {
        id: "o_mara", label: "Follow Mara into the kitchen.",
        description: "“She was in the house first. She knows where the key is.”",
        next: "mara_kitchen",
        effects: [{ var: "trusted_mara", op: "set", value: "true" }, { var: "daniel_hostile", op: "set", value: "true" }],
        consequence: "Daniel watches you go inside with Mara. He does not follow.",
      },
      {
        id: "o_daniel", label: "Trust Daniel and follow him downstairs.",
        description: "“He says Mara is lying and someone is still inside.”",
        next: "daniel_basement",
        effects: [{ var: "trusted_daniel", op: "set", value: "true" }],
        consequence: "Mara calls after you once, then falls silent.",
      },
      {
        id: "o_eli", label: "Investigate Eli’s claim upstairs.",
        description: "“The lamp is still on. Whoever was there may still be there.”",
        next: "eli_upstairs",
        effects: [{ var: "eli_ally", op: "set", value: "true" }],
      },
      {
        id: "o_noor", label: "Leave with Noor and call for help.",
        description: "“You refuse to choose a side without proof.”",
        next: "noor_road",
        effects: [{ var: "police_called", op: "set", value: "true" }],
        consequence: "Emergency services logged your call at 23:47.",
      },
    ],
  },

  // ── Mara route ──
  {
    id: "mara_kitchen",
    type: "narrative",
    label: "Location: Kitchen",
    title: "What Mara Knows",
    content: p(
      "The kitchen smells of bleach and cold tea. Mara does not turn on the light. She moves through the dark like someone who has lived here.",
      "“There was a child,” she says quietly. “Ada. She was supposed to stay in the pantry until it was over. I don’t know if she’s still in there. I don’t want to know.”",
      "On the counter: a leather ledger, swollen with damp. Mara slides it toward the sink. Her bag hangs open on the back of a chair.",
    ),
    next: "d_mara",
  },
  {
    id: "d_mara",
    type: "decision",
    title: "File your decision",
    content: "",
    context: "Mara is asking you to trust her one more time.",
    options: [
      {
        id: "o_pantry", label: "Open the pantry despite her warning.",
        next: "mara_pantry",
        effects: [{ var: "found_key", op: "set", value: "true" }, { var: "evidence", op: "add", value: "2" }, { var: "trusted_mara", op: "set", value: "false" }],
        consequence: "Mara will remember that you ignored her.",
      },
      {
        id: "o_hide", label: "Help Mara hide the ledger.",
        next: "mara_hide",
        effects: [{ var: "mara_secret", op: "set", value: "true" }],
        consequence: "Mara trusts you now. The ledger is gone.",
      },
      {
        id: "o_bag", label: "Search Mara’s bag while her back is turned.",
        next: "mara_bag",
        effects: [{ var: "evidence", op: "add", value: "1" }, { var: "mara_caught", op: "set", value: "true" }, { var: "trusted_mara", op: "set", value: "false" }],
        consequence: "Mara saw you. She says nothing, which is worse.",
      },
    ],
  },
  {
    id: "mara_pantry",
    type: "narrative",
    content: p(
      "The pantry is empty except for a child’s cardigan folded on the bottom shelf and, beneath it, a brass key with a paper tag: <em>UPSTAIRS — DO NOT</em>.",
      "Behind you, Mara makes a sound that is not quite a word. When you turn, she has already stepped back into the dark.",
    ),
    next: "locked_room",
  },
  {
    id: "mara_hide",
    type: "narrative",
    content: p(
      "You hold the ledger under the tap until the ink runs grey. Mara watches every page dissolve.",
      "“There’s a way out,” she says when it’s done. “Through the cellar door at the back of the garden. Nobody else knows. If it goes wrong upstairs — take it.”",
    ),
    next: "locked_room",
  },
  {
    id: "mara_bag",
    type: "narrative",
    content: p(
      "A train ticket dated tomorrow. Bandages. A photograph of the house, taken from the road, with a red ring drawn around the upstairs window.",
      "When you look up, Mara is in the doorway. She doesn’t ask what you found.",
    ),
    next: "locked_room",
  },

  // ── Daniel route ──
  {
    id: "daniel_basement",
    type: "narrative",
    label: "Location: Basement stairs",
    title: "Daniel’s Sister",
    content: p(
      "Daniel presses a flashlight into your hand. The stairs groan. At the bottom, a steel door with a fresh padlock — and behind it, very faintly, someone tapping.",
      "On a workbench beside the door: a stack of letters addressed to Daniel, at this house, going back six years. He told you he’d never been here before.",
    ),
    next: "d_daniel",
  },
  {
    id: "d_daniel",
    type: "decision",
    title: "Confirm course of action",
    content: "",
    context: "The tapping has stopped. Daniel is watching you read his letters.",
    options: [
      {
        id: "o_free", label: "Break the padlock and free whoever is behind the door.",
        next: "daniel_free",
        effects: [{ var: "evidence", op: "add", value: "1" }, { var: "sister_freed", op: "set", value: "true" }],
        consequence: "Daniel owes you now. He knows it.",
      },
      {
        id: "o_letters", label: "Take the letters and leave Daniel behind.",
        next: "daniel_leave",
        effects: [{ var: "evidence", op: "add", value: "2" }, { var: "daniel_hostile", op: "set", value: "true" }],
        consequence: "Daniel shouts your name once. Then the basement light goes out.",
      },
      {
        id: "o_believe", label: "Believe Daniel’s explanation.",
        next: "daniel_believe",
        effects: [{ var: "found_key", op: "set", value: "true" }, { var: "trusted_daniel", op: "set", value: "true" }],
      },
    ],
  },
  {
    id: "daniel_free",
    type: "narrative",
    content: p(
      "The padlock gives on the third blow. The room behind it is empty — just a chair, a length of rope, and a window too small to climb through, propped open.",
      "“She got out,” Daniel says. He sounds relieved. He also sounds like he isn’t surprised.",
    ),
    next: "locked_room",
  },
  {
    id: "daniel_leave",
    type: "narrative",
    content: p(
      "You take the stairs two at a time with the letters inside your coat. Every one is signed by Mara. Every one says the same thing: <em>You promised you would never come back here.</em>",
    ),
    next: "locked_room",
  },
  {
    id: "daniel_believe",
    type: "narrative",
    content: p(
      "“I used to live here,” Daniel admits. “Before. I didn’t think it mattered.” He takes a brass key from his pocket and puts it in your palm. “For upstairs. I can’t go up there. You’ll understand why.”",
    ),
    next: "locked_room",
  },

  // ── Eli route ──
  {
    id: "eli_upstairs",
    type: "narrative",
    label: "Location: Upstairs landing",
    title: "Photographs",
    content: p(
      "Eli follows you up, one hand on the wall. The lit room is not a bedroom. It is papered, floor to ceiling, with photographs: Mara, Daniel, Noor — and Eli himself, asleep, taken from inside this house.",
      "One photograph has been crossed out in black ink. You can’t tell whose face is underneath.",
      "Above you, from the attic hatch, a voice says something too quiet to make out.",
    ),
    next: "d_eli",
  },
  {
    id: "d_eli",
    type: "decision",
    title: "File your decision",
    content: "",
    context: "Eli is shaking. He hasn’t looked at the crossed-out photograph.",
    options: [
      {
        id: "o_hidephotos", label: "Hide the photographs in your coat.",
        next: "eli_hide",
        effects: [{ var: "has_photos", op: "set", value: "true" }, { var: "evidence", op: "add", value: "1" }],
      },
      {
        id: "o_tell", label: "Call down and tell the others what you found.",
        next: "eli_tell",
        effects: [{ var: "daniel_hostile", op: "set", value: "true" }, { var: "photos_shared", op: "set", value: "true" }],
        consequence: "Everyone downstairs now knows what you know.",
      },
      {
        id: "o_attic", label: "Follow the voice into the attic.",
        next: "eli_attic",
        effects: [{ var: "found_key", op: "set", value: "true" }, { var: "eli_ally", op: "set", value: "false" }],
        consequence: "Eli did not follow you up.",
      },
    ],
  },
  {
    id: "eli_hide",
    type: "narrative",
    content: p("You fold the photographs into your coat. Eli nods, very slowly, as if you have passed a test he didn’t know he was setting."),
    next: "locked_room",
  },
  {
    id: "eli_tell",
    type: "narrative",
    content: p(
      "Your voice carries down the stairwell. For a long moment nobody answers. Then a door slams, and Daniel is on the stairs, and he is not asking questions.",
    ),
    next: "locked_room",
  },
  {
    id: "eli_attic",
    type: "narrative",
    content: p(
      "The attic is empty. The voice was a radio, tuned between stations, left on a chair beside a brass key. When you climb back down, Eli is gone.",
    ),
    next: "locked_room",
  },

  // ── Noor route ──
  {
    id: "noor_road",
    type: "narrative",
    label: "Location: Harrow Lane, outside",
    title: "Outside the File",
    content: p(
      "You walk with Noor to the end of the lane and call it in. Dispatch says twenty minutes. Noor says nothing.",
      "Your phone buzzes. A message from an unknown number: <em>she is lying to you too.</em> Then another: <em>come back. there is still time.</em>",
      "Noor holds out her hand. “Give me the phone. They’re trying to pull you back in.”",
    ),
    next: "d_noor",
  },
  {
    id: "d_noor",
    type: "decision",
    title: "Confirm course of action",
    content: "",
    context: "Twenty minutes is a long time. The upstairs lamp just went out.",
    options: [
      {
        id: "o_return", label: "Return to the house alone.",
        next: "noor_return",
        effects: [{ var: "noor_left", op: "set", value: "true" }],
        consequence: "Noor does not try to stop you.",
      },
      {
        id: "o_givephone", label: "Give Noor the phone.",
        next: "noor_phone",
      },
      {
        id: "o_drive", label: "Drive away and ignore the final message.",
        next: "end_missing",
      },
    ],
  },
  {
    id: "noor_return",
    type: "narrative",
    content: p("The front door is open now. The gravel is empty. Whatever happened while you were gone, everyone has moved inside."),
    next: "locked_room",
  },
  {
    id: "noor_phone",
    type: "narrative",
    content: p(
      "Noor takes the phone and, without looking at it, drops it into the storm drain. “Now we wait,” she says. You never hear the sirens.",
    ),
    next: "end_compromised",
  },

  // ── Convergence: the locked room (text changes with earlier choices) ──
  {
    id: "locked_room",
    type: "narrative",
    label: "Location: Upstairs · 00:31",
    title: "The Locked Room",
    content: p(
      "Every route through this house ends at the same door: the bedroom at the end of the upstairs hall, the one with the lamp. It is locked. Something on the other side has stopped moving.",
    ),
    next: "lr_mara_ally",
  },
  {
    id: "lr_mara_ally",
    type: "narrative",
    conditions: [{ var: "mara_secret", op: "truthy" }],
    content: p("Mara is beside you. She touches your sleeve and tilts her head toward the back stairs — toward the cellar door she told you about."),
    next: "lr_mara_hostile",
  },
  {
    id: "lr_mara_hostile",
    type: "narrative",
    conditions: [{ var: "mara_caught", op: "truthy" }],
    content: p("Mara stands at the far end of the hall. She has the front-door keys. She has not said a word to you since the kitchen."),
    next: "lr_daniel",
  },
  {
    id: "lr_daniel",
    type: "narrative",
    conditions: [{ var: "daniel_hostile", op: "truthy" }],
    content: p("Daniel is at the top of the stairs, blocking the way down. Whatever trust there was between you is gone."),
    next: "lr_police",
  },
  {
    id: "lr_police",
    type: "narrative",
    conditions: [{ var: "police_called", op: "truthy" }],
    content: p("Through the landing window: blue lights, still far off, turning onto Harrow Lane."),
    next: "d_final",
  },
  {
    id: "d_final",
    type: "decision",
    title: "Case outcome pending — file your final decision",
    content: "",
    context: "Whatever is behind this door, you will be the one to decide what happens to it.",
    warning: "This is your final decision for this file. It will be saved to your account and cannot be changed.",
    options: [
      {
        id: "o_open", label: "Unlock the door with the brass key.",
        description: "“UPSTAIRS — DO NOT.”",
        next: "final_open",
        lockedIf: [{ var: "found_key", op: "falsy" }],
      },
      {
        id: "o_cellar", label: "Take Mara’s hidden route out through the cellar.",
        next: "end_sealed",
        visibleIf: [{ var: "mara_secret", op: "truthy" }],
      },
      {
        id: "o_confront", label: "Confront Daniel with what you know.",
        next: "final_confront",
      },
      {
        id: "o_wait", label: "Wait downstairs for the police.",
        next: "end_insufficient",
        visibleIf: [{ var: "police_called", op: "truthy" }],
      },
      {
        id: "o_leave", label: "Walk out of the house and don’t look back.",
        next: "end_missing",
      },
    ],
  },
  {
    id: "final_open",
    type: "narrative",
    content: p("The key turns more easily than it should. The lamp is still warm. On the bed: a seventh photograph, of you, taken tonight from the hedge."),
    routes: [{ conditions: [{ var: "evidence", op: "gte", value: "2" }], to: "end_closed" }],
    next: "end_conflicting",
  },
  {
    id: "final_confront",
    type: "narrative",
    content: p("You say his name. Daniel doesn’t move. Everyone in the hall is waiting to see which of you blinks first."),
    routes: [{ conditions: [{ var: "daniel_hostile", op: "truthy" }], to: "end_compromised" }],
    next: "end_conflicting",
  },

  // ── Endings ──
  { id: "end_closed", type: "ending", content: "", endingTitle: "Case Closed", endingText: "You walk out with the evidence you gathered. The file goes to the archive." },
  { id: "end_insufficient", type: "ending", content: "", endingTitle: "Morning", endingText: "You leave the house at first light. Your report goes on the file." },
  { id: "end_compromised", type: "ending", content: "", endingTitle: "The Statement", endingText: "You give your statement and sign it. The file goes to the archive." },
  { id: "end_sealed", type: "ending", content: "", endingTitle: "File Sealed", endingText: "You chose to protect the truth rather than reveal it. The door stays locked." },
  { id: "end_missing", type: "ending", content: "", endingTitle: "Subject Missing", endingText: "You got away. The person you came to save was never found." },
  { id: "end_conflicting", type: "ending", content: "", endingTitle: "Conflicting Testimonies", endingText: "Everyone survived. Nobody agrees on what happened." },
];

export function sampleCaseGraph(): InteractiveGraph {
  return {
    startNodeId: "opening",
    settings: { ...DEFAULT_SETTINGS, endingVisibility: "count" },
    nodes: JSON.parse(JSON.stringify(nodes)),
  };
}
