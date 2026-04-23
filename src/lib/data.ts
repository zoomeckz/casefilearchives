// Character images
import AyelImage from "@/assets/Ayel_Sedorium.png";
import MiraImage from "@/assets/Mira_Sedorium.png";
import SamImage from "@/assets/Sam_Sedorium.png";
import RathelImage from "@/assets/Rathel_Sedorium.png";
import FelmImage from "@/assets/Felm.png";
import AgathaImage from "@/assets/Agatha_Sedorium.png";

export interface Chapter {
  id: string;
  title: string;
  content: string;
  chapterNumber: number;
  publishedAt: string;
  views: number;
  comments: Comment[];
}

export interface Comment {
  id: string;
  content: string;
  author: string;
  authorId: string;
  createdAt: string;
}

export interface GlossaryEntry {
  type: 'character' | 'location' | 'creature' | 'concept';
  description: string;
  image?: string;
  parentTerm?: string;
  firstChapter?: number;
  aliases?: string[];
}

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  category: string;
  author: string;
  authorId: string;
  replies: number;
  comments: Comment[];
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  avatar: string | null;
  bio?: string;
  location?: string;
  website?: string;
  favoriteCharacter?: string;
}

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const sampleChapters: Chapter[] = [];

export const defaultGlossary: Record<string, GlossaryEntry> = {
  'Sam': { 
    type: 'character', 
    image: SamImage, 
    description: 'A mysterious man with no memory of his past. Has dark brown, wildly untamed hair, heterochromia (one dark brown eye, one bright grey), stands about 180cm tall. Wears black baggy clothes. Can communicate with Treants and has a tamed Myothane named Fendo. Killed a Velune effortlessly. His body absorbs and redirects impact through "reverberation." Displays childlike innocence about social norms.' 
  },
  'Felm': { 
    type: 'character', 
    image: FelmImage,
    description: 'Known as "The Keeper." A mysterious figure with piercing ocean-blue eyes, dark windswept hair, and scarred hands bearing faint glowing runes. He wears a dark cloak with intricate detailing, carries an ornate amulet and rings set with blue stones, and bears a distinctive symbol tied to his secretive order. He stands sentinel over an infant and leads a group with knowledge of ancient gifts, speaking of the child being their "legacy—our hero, or our demon."' 
  },
  'Vicera': { 
    type: 'character', 
    description: 'A spectral woman with pale porcelain skin, piercing green eyes, and fiery red hair. She possesses mystical abilities—her eyes can blaze with opal brilliance to detect "the gift" in others. The act drains her considerably.' 
  },
  'Mira': { 
    type: 'character', 
    image: MiraImage, 
    description: 'Known as "The Pink Drake." Current Empress of Beambreak, mother to Ayel and Rathel. A woman of great height with gleaming yellow eyes and white-blond hair. Her druid form is a massive fire drake with pink scales. Notorious for her disdain of clothing and masterful use of her appearance as a weapon.' 
  },
  'Rashad': { 
    type: 'character', 
    description: 'The former Cat King, husband to Mira. A pale-skinned man with hazel eyes and unkempt light brown hair. Known for walking among the common people and his infectious booming laugh. Died mysteriously one year after rescuing miners from a collapsed chasm.' 
  },
  'Ayel': { 
    type: 'character', 
    image: AyelImage, 
    description: 'Called "The Treasure of Beambreak." Firstborn daughter of Mira and Rashad. Has shining yellow eyes that change color with her emotions and glow in darkness. Possesses an incomplete druid form—can only partially transform body parts. Deeply connected to nature.' 
  },
  'Rathel': { 
    type: 'character', 
    image: RathelImage,
    description: 'Known as "The Soundless." Son of Mira and Rashad. Has dark brown untamed hair and walks with completely silent steps. His druid forms are a black panther and a bear, which he blends into a werewolf-like hybrid. Challenges authority and shows deference to no one.' 
  },
  'Fendo': { 
    type: 'character', 
    description: 'Sam\'s pet Myothane—a legendary hunting creature that Sam has somehow tamed into a docile, friendly companion that wags its tail like a dog.' 
  },
  'Captain Dorren': {
    type: 'character',
    description: 'A decorated captain of the Mamori royal guard. Stern and disciplined, she takes her duty to protect the royal family with absolute seriousness.'
  },
  'Beambreak': { 
    type: 'location', 
    description: 'The crown jewel city and ruler\'s nation at the center of the five nations. Divided into concentric rings including Aromi, Igneous, Meta, and Sedi. Every 4 years, challengers can fight the ruler for the throne. Currently ruled by Empress Mira.' 
  },
  'Feldus': { 
    type: 'location', 
    description: 'Western nation covered in vast, dense forests. Home to the Elves (Feldurians), known for sharpshooting, traps, and foresight so keen they\'re rumored to be soothsayers.' 
  },
  'Shabdar': { 
    type: 'location', 
    description: 'A ruined village on the outskirts of Feldus. Once produced the greatest warriors, navigators, and craftsmen, but was crushed by political pressure from the nations after refusing allegiance.' 
  },
  "Dim'cra": { 
    type: 'location', 
    description: 'Northern nation, the largest but least inhabitable due to hellish sun. People live in mountain paradises with waterfalls and lush vegetation.' 
  },
  'Helsim': { 
    type: 'location', 
    description: 'Eastern nation of water with almost no land. The Helsimians build floating and submerged cities that move with currents.' 
  },
  'Mezaru': { 
    type: 'location', 
    description: 'Southern nation dwelling underground in complex tunnel cities. Mezarunians are short, silver-haired, and rarely seen on the surface. The world\'s most talented craftsmen.' 
  },
  'Aromi': {
    type: 'location',
    description: 'The royal garden within Beambreak, the innermost circle surrounding the castle built into Mount Ahl. A lush paradise tended by the royal family.'
  },
  'Igneous': {
    type: 'location',
    description: 'One of the three inner rings of Beambreak, named after the second most valued type of rock used in crafting weapons, buildings, and machines.'
  },
  'Meta': {
    type: 'location',
    description: 'One of the three inner rings of Beambreak, named after a valued crafting material. Houses skilled artisans and workshops.'
  },
  'Sedi': {
    type: 'location',
    description: 'The outermost of the three inner rings of Beambreak, named after Sedorium — the most prized reagent in the world. The commercial and residential heart of the city.'
  },
  'Sorwood': {
    type: 'location',
    description: 'A dense, ancient forest in the territories surrounding Beambreak. Home to Treants and various dangerous wildlife. Few dare to venture deep into its depths.'
  },
  'Velune': { 
    type: 'creature', 
    description: 'A dangerous creature skilled in hand-to-hand combat. Some harness Sedorium to create powerful illusions. Going toe-to-toe with one is impressive; slaying one is legendary.' 
  },
  'Myothane': { 
    type: 'creature', 
    description: 'Nature\'s most mystically skilled hunter on land. Always hunt in tight packs led by a scout. Considered impossible to tame—yet Sam has one as a pet.' 
  },
  'Treant': { 
    type: 'creature', 
    description: 'Ancient living trees that can speak and move. Sam has made a deal with them to deliver Sedorium to Beambreak. Their root networks stretch across vast distances, serving as a communication system.' 
  },
  'Mistress flowers': {
    type: 'creature',
    description: 'Rare, bioluminescent flowers found deep in the forests surrounding Beambreak. They bloom only at night and are said to respond to the presence of druids. Prized for their beauty and alchemical properties.'
  },
  'Druid': { 
    type: 'concept', 
    description: 'Rare beings who can transform into animal forms. Each druid is born with at least one form to master. The royal family of Beambreak are all druids.' 
  },
  'Sedorium': { 
    type: 'concept', 
    description: 'The most prized reagent—a rainbow-colored stone that glows when touched. Burns for weeks when ignited. Used for heating, lighting, smelting, and weapons.' 
  },
  'Sedorium Node': {
    type: 'concept',
    description: 'A concentrated deposit of raw Sedorium found deep underground. Nodes pulse with visible energy and are the primary source of mined Sedorium. Extremely valuable and heavily guarded.'
  },
  'Mamori': { 
    type: 'concept', 
    description: 'The Royal Guard of Beambreak who patrol the walls between each ring of the city. Highly trained warriors sworn to protect the royal family and maintain order.' 
  },
  'Sha': { 
    type: 'concept', 
    description: 'The title for rulers of each nation. Not inherited but earned through fierce battle—each Sha is the top fighter of their nation.' 
  },
  'Temporocks': {
    type: 'concept',
    description: 'Mysterious stones with time-altering properties. Extremely rare and poorly understood. Said to slow or distort the passage of time in their immediate vicinity.'
  },
  'Lamoon': {
    type: 'location',
    description: 'The ancient name for Beambreak. Lamoon was the seat of the fifth throne and the richest hub of civilization the continent had ever known, built atop Mount Ahl\'s massive Sedorium deposit. It was held for generations by a company of Oathbreaker mercenaries — halfbred druid fighters whose volatile mixed blood made them nearly impossible to defeat. The city was renamed Beambreak after the demon Beam was slain on the mountain.'
  },
  'Mount Ahl': {
    type: 'location',
    description: 'The mountain upon which Beambreak (formerly Lamoon) is built. Sits on the largest natural deposit of Sedorium ever discovered — veins so deep and wide that the original miners believed the mountain was alive and Sedorium was its blood.'
  },
  'Maelle': {
    type: 'character',
    description: 'Born into the Oathbreaker line with royal blood — the purest remaining strain of the fourth throne\'s dynasty. Brilliant, resourceful, and possessed of a ferocious, stubborn love. When the lycan consumed Ignius and he rampaged across the continent for hundreds of years, Maelle followed him — across nations, across lifetimes — searching for a way to reach the man inside the beast. She found him. And the lycan killed her. Her death was the only thing that stopped it.'
  },
  'Ignius': {
    type: 'character',
    description: 'A bastard druid born with two catastrophically conflicting forms. His first was raw, unstructured elemental fire that leaked from him constantly — burning his cradle as an infant and blistering anyone who touched him. His second was a lycan wolf form so powerful it consumed his consciousness entirely. At eight years old, it took eleven adult druids to subdue his first full shift, and three did not survive. He was the strongest of the Oathbreaker mercenaries who held Lamoon. His wife was Maelle.'
  },
  'Beam': {
    type: 'character',
    description: 'Son of Maelle and Ignius. The highest class of demon that ravaged the continent. His name is the origin of the city name Beambreak — the mountain where he was finally destroyed. The full story of what Beam was and what he became is central to the Oathbreaker legacy.'
  },
  'Oathbreaker': {
    type: 'concept',
    description: 'The first royal druidic bloodline to break the ancient covenant by mixing their blood with common, non-royal kin. The name was assigned as a sentence. Oathbreaker offspring were volatile — producing both horrors and extraordinary beings. A company of Oathbreaker mercenaries held Lamoon against four nations for generations. Mira\'s family carries this title through their descent from Maelle and Ignius.'
  },
  'Lycan': {
    type: 'creature',
    description: 'A wolf-like druid beast form of extraordinary and uncontainable power. When a lycan shift takes hold, the druid\'s consciousness is consumed entirely, replaced by a predatory intelligence so overwhelming that nothing can withstand proximity to it.'
  },
  'Skyborn': {
    type: 'concept',
    description: 'Elite warriors of Dim\'cra whose druid forms are raptors capable of striking from extreme altitudes where the thin air itself becomes a weapon.'
  },
  'Veilkeeper': {
    type: 'concept',
    description: 'Mysterious figures who serve within Beambreak\'s inner sanctum. They bear distinctive tattoos and attend to the royal family\'s private chambers and council rooms.'
  },
  'Bestowed': {
    type: 'concept',
    description: 'A title or group referenced within Beambreak\'s inner circles. Their exact role remains shrouded in secrecy, but they are present during the most sensitive royal proceedings.'
  },
  'Burning Shield': {
    type: 'concept',
    description: 'An ancient symbol carved into the black stone council table in Beambreak\'s inner chambers. Its significance is tied to the royal bloodline and the history of the Oathbreakers.'
  },
  'Bertrand': {
    type: 'character',
    description: 'The Throne Archivist of Beambreak. A tall, angular man with mismatched eyes — one deep brown, one pale milky blue — dark hair swept back with a grey streak from temple to nape, and an impossibly precise manner of dress. His bloodline has maintained perfect eidetic recall for nineteen generations. Summoned by Mira through an ancient invocation after eleven years of silence, he recognized Sam on sight with what can only be described as theological collapse.'
  },
  'Veylan Fragments': {
    type: 'concept',
    description: 'Ancient texts or records referenced by the Throne Archivist Bertrand. They contain descriptions of a "void signature" and convergence patterns that Bertrand\'s bloodline has catalogued across nineteen generations. Their exact origin and full contents remain unknown.'
  },
  'Grebby': {
    type: 'character',
    description: 'A freelance vehicle engineer who moves between nations on contracted passes. Stocky and compact with calloused hands and infectious enthusiasm for mechanical systems. Raised by the Workshop Union, his natural affinity was destruction — understanding how to take things apart so thoroughly that he became the best in the world at preventing it. Childhood friend of the Veilkeeper Kassandra.'
  },
  'Agatha': {
    type: 'character',
    image: AgathaImage,
    description: 'A blind master tailor formerly employed by King Rashad. Has pale, clouded grey eyes and an arresting face. Her hands can read a body like a cartographer reads a landscape — cataloguing every contour through touch with precision sighted tailors cannot replicate. Known for her sharp tongue, biting wit, and Irish-inflected speech. Mother of Daria. Suffered a crippling injury on the Sedi thoroughfare.'
  },
  'Daria': {
    type: 'character',
    description: 'Agatha\'s daughter and caretaker. Lives in reduced circumstances in the Meta district. Despite hardship, she maintains fierce devotion to her injured mother.'
  },
  'Kassandra': {
    type: 'character',
    description: 'A Veilkeeper and childhood friend of Grebby, both raised by the Workshop Union. Despite her oath of detachment, she retains a subtle connection to Grebby — enough to break protocol and deliver a secret message to Ayel via crow through Beambreak\'s ventilation routes.'
  },
  'Workshop Union': {
    type: 'concept',
    description: 'A sprawling, decentralized network of guilds, schools, and placement houses operating across all five nations. It collects stray children — orphans, runaways, the discarded — identifies their natural affinities, and trains them into world-class specialists. The Union does not traffic in backgrounds; it traffics in potential.'
  },
  'Anvil House': {
    type: 'location',
    description: 'A lodging house in the Igneous district\'s second ring of Beambreak. Known as Grebby\'s usual accommodation when on contracted work in the city.'
  },
  'Sedorium Heart': {
    type: 'concept',
    description: 'The central Sedorium node powering Beambreak\'s infrastructure. Located beneath the Aromi gardens, it pulses with a deep, rhythmic luminescence felt more than seen — a bass-frequency throb that travels through stone, wood, and glass throughout the city.'
  },
  'Wall of Atonement': {
    type: 'location',
    description: 'A section of Mount Ahl\'s living rock left deliberately uncarved as the ultimate testing surface. Used for generations to test weapons and druidic power against the raw mountain stone. Sam cracked it with his reverberation ability — a feat previously considered impossible.'
  },
  'Greenwood Court': {
    type: 'concept',
    description: 'A governing body within Feldus. A champion of the Greenwood Court — a shapeshifter described as "wind given claws" — once challenged the throne of Lamoon and was defeated in a single afternoon.'
  },
  'Quillren': {
    type: 'creature',
    description: 'A furred creature the size of a large cat with the body of a fox and the flat, wide face of an owl. Its tail splits into three separate plumes, each tipped with iridescent blue. Usually nocturnal scavengers that avoid people, but drawn instinctively to Sam.'
  },
  'Nightwader': {
    type: 'creature',
    description: 'A bat-like hybrid with a serpentine neck and leathery wings. Its membranes are so thin you can read through them. Typically hangs upside down from awnings and structures in Beambreak\'s districts.'
  },
  'Stone-jackal': {
    type: 'creature',
    description: 'Squat, heavy-jawed creatures with hides of overlapping mineral plates that clink softly when they move. Considered aggressive pests in Beambreak\'s lower districts, known to bite — yet they followed Sam with ear-flattening devotion.'
  },
  'Beamstone': {
    type: 'concept',
    description: 'An extremely rare teleportation artifact attuned to Beambreak castle. Only ten exist, each keyed to a specific bearer\'s essence, blood, and signature. Activated with the phrase "Brave I may be, home is what I need" while held with both hands.'
  },
  'Infinity Pocket Seal': {
    type: 'concept',
    description: 'An extraordinarily rare piece of Mezaru spatial manipulation technology. When activated, it opens into a room that does not technically exist — a pocket of folded space. Fewer than a dozen are known to exist. Rathel keeps one hidden in his quarters.'
  },
  'Helsimian': {
    type: 'concept',
    description: 'A race identifiable by faintly iridescent blue-green skin, elongated pointed ears, dark upturned eyes, and vestigial gill markings on their necks. Their voices carry a melodic, layered resonance that sounds like two notes played simultaneously.'
  },
};

export const forumCategories = ['General', 'Theories', 'Character Discussion', 'Chapter Reviews', 'Fan Art', 'Questions', 'World Building'];
