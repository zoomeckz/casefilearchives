// Character images
import AyelImage from "@/assets/Ayel_Sedorium.png";
import MiraImage from "@/assets/Mira_Sedorium.png";
import SamImage from "@/assets/Sam_Sedorium.png";
import RathelImage from "@/assets/Rathel_Sedorium.png";

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
    description: 'A mysterious figure with piercing ocean-blue eyes. He stands sentinel over an infant and leads a secretive group with knowledge of ancient gifts. He speaks of the child being their "legacy—our hero, or our demon."' 
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
};

export const forumCategories = ['General', 'Theories', 'Character Discussion', 'Chapter Reviews', 'Fan Art', 'Questions', 'World Building'];
