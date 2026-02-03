// Character images
import AyelImage from "@/assets/Ayel_Sedorium.png";
import MiraImage from "@/assets/Mira_Sedorium.png";
import SamImage from "@/assets/Sam_Sedorium.png";

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

export const sampleChapters: Chapter[] = [
  {
    id: '1',
    title: 'A Grim Introduction',
    content: `<p>In a dimly lit room cloaked in shadows, where the air hung heavy with anticipation and uncertainty, a lone man dared to fill the void. His words, like fragile whispers in the face of impending storm, sought reassurance amidst the looming silence. His words were met with a deafening silence. Only the howling wind, sharp as knives against exposed skin, dared to intrude upon the quietude, sweeping through the room with an ominous force.</p>
<p>The man, a figure of mystery and intrigue, stood sentinel over an infant cradled in slumber. His presence, marked by piercing ocean-blue eyes that flickered with each bolt of lightning, held an air of enigmatic vigilance. Yet, his gaze wandered, drawn to the darker recesses of the chamber where secrets lay concealed.</p>
<p>"Are you sure he possesses 'the' gift?" The question hung in the air like a fragile thread of doubt woven into the tapestry of uncertainty.</p>
<p>A woman emerged from the shadows, a spectral figure cloaked in tattered garments. Her visage, pale and haunting, betrayed a glimpse of defiance in her piercing green eyes and fiery red hair. Vicera, her name a whispered echoed in the room.</p>
<p>The two stood in the lingering tension which painted a portrait of adversaries bound by a shared history.</p>
<p>Vicera, with porcelain skin that seemed almost translucent under the dim light, stood unbothered yet commanding in the cold room. Her ample bosom scarcely contained by the scant fabric of her attire almost had a small radiant humming like a siren commanding sailors to their demise.</p>
<p>"I see you're almost naked as always," Felm's words broke the silence.</p>
<p>Vicera's left eye subtly twitched once but remained unyielding in her resolve to meet Felm's gaze with steely defiance.</p>
<p>Small voices start to fill the room from different corners. The tension slowly lifting as Vicera, cradling an infant break her gaze and looks downwards to small outwards reaching hands.</p>
<p>"An infant that never cries." Felm almost whispered concerned now also looking at the infant.</p>
<p>Vicera looks up and meets Felm's gaze again and Felm nods in response. He turns and beckons the surrounding figures to emerge from the dark and gather around. He removes his gloves and as he does the stinging chill meets his skin. He looks at his hand for a couple of seconds as the rain pelts against the shed. Felm gets to reality only by the sudden laughter of the infant that is now surrounded by a number of different figures.</p>
<p>The group collectively draw a deep breath as Vicera places her index finger on the infant's forehead. A distant humming captivates the room as the room goes completely silent. The rain outside, the wind, nothing existing as her eyes ablaze with the brilliance of opals. In that fleeting moment a kaleidoscope of colors illuminate the room and she becomes a beacon of hope amidst the encroaching darkness. Then the colors of her eyes fizzle out, the room grows loud with noise, cold and dark as she hands over the infant to Felm and staggers towards a darker corner of the shed. The group watches her in silence knowing what had just transpired and what is yet to come.</p>
<p>Felm carefully observes the infant. As a cat would be bewitched by flickering lights, eyes stared back with a sense of wonder and a faint smile.</p>
<p>"So.. I think safe to assume that we're in the clear." said Felm looking a little bewildered by the spectacle and looking worriedly towards the direction Vicera had left. "But the truth is, I have no idea what he can or will become in the future." he continued sounding more sure by every word. "All I know is that our time is limited and that no choice we can make has a sure or safe outcome. Frankly, they are all bad." he said with a bitterness in his voice now looking down at the infant defeated.</p>
<p>Everyone in the group slowly shifted and looked at each other.</p>
<p>"I thank every single one of you for being here. This child is and shall remain our legacy. Our hero, or our demon." Felm said gazing around the room reaching for the passive souls to turn active again.</p>
<p>"Alright, who's next?"</p>`,
    chapterNumber: 1,
    publishedAt: '2020-08-16',
    views: 1247,
    comments: []
  },
  {
    id: '2',
    title: 'Beambreak and the Four Nations',
    content: `<p>19 years has passed from that eventful night on the outskirts of Feldus. It all transpired in a rural village named Shabdar. A lot can be said about the village and its inhabitants, but the truth is that its location is so remote that no traveler, adventurer or merchant ventures there – not anymore at least. The former village served as an old bastion for fisherman and merchants alike but is now buried in ruin after years of being pillaged and neglected. The old routes that used to be brimming with life are now deserted from being chronically raided by bandits. The wildlife have flourished in the vacancy of other lifeforms.</p>
<p>Great docks in complete decay, giant ships washed up and covered in mold fill the shoreline of the vast beaches that the former village is surrounded with. They are now one with nature as the crabs and other sea life seek shelter from the skies within their moist wood walls. The whole city was eerily frozen in time only showing its sundered towers, wrecked docks, crumbled buildings of stone and pavement that were filled with giant holes and rubble from the surrounding infrastructure.</p>
<p>Once, the greatest of warriors, navigators, craftsmen and jesters came out of Shabdar. Which is why many bigger cities wanted to harness its rich outcome of talented individuals, land and skills – but they never managed to tame the free village. Shabdar swore no allegiance to any nation, which also rendered them to a force to be reckoned with, a dormant threat. Since no one could own Shabdar, the higher folk in the nations treated the village as an enemy and feared its existence.</p>
<p>There are five great nations, Feldus being one of them. All the nations come together like a poorly drawn circle, with a Sha on the throne in every nation. The Sha is the ambassador of the lands which is neither inherited or passed down, but earned through fierce battle. Every Sha are the top fighter of their nation and thus rule as a commander.</p>
<p>Feldus lies to the west. With a vast and dense forest all across Feldus, it takes extremely sharp senses to live in this part of the world. Nature rules the land where the strong prey on the weak. Even the mighty Elves that are the humanoid residents of Feldus that sit on the throne ever since Feldus was founded have areas they do not dare to venture to.</p>
<p>To the north you have Dim'cra. The biggest of all nations, but emptiest in the context of inhabitable land. Being constantly scorched by a hellish blazing sun that rips the ground asunder, there are few areas and creatures that survive these conditions.</p>
<p>To the east you have Helsim. Helsim is a land of water and very little land. The oceanic people of Helsim, Helsimians, have built submerged and floating cities that never exist in one place.</p>
<p>To the south you have Mezaru. Mezarunians are the least seen humanoid race in the world. They only emerge from their underground cities and astonishingly complex tunnels in very rare occasions.</p>
<p>Lastly, in the middle, there's Beambreak. Beambreak is the ruler's nation, where the strongest one of the four nations gets to serve as an emperor or empress. Every 4 years in the summer there's an event held for any competitor, from any nation, to challenge the ruler of Beambreak.</p>
<p>Mira is still the empress today.</p>`,
    chapterNumber: 2,
    publishedAt: '2020-08-19',
    views: 982,
    comments: []
  },
  {
    id: '3',
    title: 'Sedorium',
    content: `<p>Beambreak is the crown jewel in this part of the world. The city is divided into circles that are called rings. More specifically, the city consists of a big circle which then consists of smaller circles that multiply the further away from the castle you reside. Starting from the castle that is built into the mountain called Ahl, we have the first big circle that is the castle royal garden named Aromi.</p>
<p>Outside of Aromi comes the first ring, which consists of three smaller circles. They are named after the three most valued types of rocks that is used to craft everything from weapons to houses, zeppelins, jewelry and other tools or machines.</p>
<p>The name Sedi comes from the most prized reagent in the world, Sedorium. A radiant rainbow colored stone that shines even in the absence of light when touched. It is as if the stone itself reacts to life and pulsates with excitement.</p>
<p>Putting Sedorium under extreme smelting conditions doesn't make it melt, but lights it ablaze. Even the tiniest of pebbles can burn for weeks and is a pillarstone of any household.</p>`,
    chapterNumber: 3,
    publishedAt: '2020-08-25',
    views: 856,
    comments: []
  },
  {
    id: '4',
    title: 'The Royal Family',
    content: `<p>The Royal House was upheld by a slender number, yet was utterly ruled by Mira, The Pink Drake, who stood as mother to the two heirs and commander of the realm. She was a woman of great height and noble stature, with a figure both voluptuous and commanding, bearing eyes of a deep, gleaming green that always seemed to reflect the weight of untold cares and long ages.</p>
<p>From her brow fell a mantle of pale, white-blond hair, long and flowing, that moved with a life of its own, as if woven from the very moonlight and mist of dreams.</p>
<p>The firstborn and daughter to Mira and Rashad, Ayel, was affectionately—or perhaps prophetically—called "The Treasure of Beambreak." She inherited the core of her mother's magnificent figure but was blessed with a slightly shorter, more compact height. Ayel was remarkable for her shining yellow eyes, an arresting feature whose brightness would subtly coincide with the shifting nature of her mood.</p>
<p>The second born and only son to Mira and Rashad, Rathel, was known by the chilling nickname "The Soundless." He wore a perpetual crown of dark brown, untamed hair above a set of challenging, dark eyes that held no deference for rank or title.</p>`,
    chapterNumber: 4,
    publishedAt: '2020-09-18',
    views: 743,
    comments: []
  },
  {
    id: '5',
    title: 'The Mine',
    content: `<p>The air was a clean, sharp shock, the kind of chill that promised the turn of the season. Slowly, a few thin, reluctant blades of sunlight began to slice through the dark, tentatively painting the world gold. This quiet dawn was underscored by the delicate, high-pitched fluting of unseen birds mingling with the hushing, crisp breeze.</p>`,
    chapterNumber: 5,
    publishedAt: '2020-09-24',
    views: 678,
    comments: []
  },
  {
    id: '6',
    title: 'The Outsider',
    content: `<p>The high sun was now showering everything below with its unflinching, warm rays. Though brisk winds occasionally swept through the air, they failed to disrupt the overall eerie peacefulness of the landscape. They proceeded toward the waterfall with meticulous caution, but Rathel could not shake the gnawing notion that something was fundamentally amiss.</p>`,
    chapterNumber: 6,
    publishedAt: '2020-10-03',
    views: 612,
    comments: []
  },
  {
    id: '7',
    title: 'Absurd',
    content: `<p>When Ayel awoke from a remarkably deep, heavy sleep, she lay still for a long moment to contemplate the events of the preceding night. As she struggled to organize her thoughts, very little made sense, leaving her knee-deep in unanswered questions. The ability to merely go toe-to-toe with a Velune was impressive, but actually slaying one was something else entirely.</p>`,
    chapterNumber: 7,
    publishedAt: '2021-03-27',
    views: 534,
    comments: []
  },
  {
    id: '8',
    title: 'A Pleasant Return',
    content: `<p>Ayel lowered herself onto a rough, sturdy tree stump, settling in to truly absorb her surroundings. The trees and bushes were lush with thick, vibrant leaves, the surrounding ground was generously scattered with sharp rocks, and the local wildlife was rowdy and clamorous.</p>`,
    chapterNumber: 8,
    publishedAt: '2021-04-02',
    views: 489,
    comments: []
  },
  {
    id: '9',
    title: 'The Filthy Dog',
    content: `<p>The sound from the impact crashed violently against the castle walls and then slowly faded into the vast silence of the forest. The noise of smaller debris settling back to earth filled the quiet, sounding like the pattering of heavy rain heard from inside a closed cottage.</p>`,
    chapterNumber: 9,
    publishedAt: '2021-04-12',
    views: 421,
    comments: []
  },
  {
    id: '10',
    title: 'Anhedonia',
    content: `<p>Sitting on his knees in utter disbelief of the quick succession of actions that had just transpired, Rathel gasped for air. The pure pressure and anxiety had left him winded. One of the guards, gazing around sporadically as if the weapon would be hiding around some corner, was clearly in utter shock that their finely crafted blade had shattered into a thousand pieces.</p>`,
    chapterNumber: 10,
    publishedAt: '2021-05-03',
    views: 387,
    comments: []
  },
  {
    id: '11',
    title: 'Walk of Shame',
    content: `<p>One of the guards remained crouched in the dust, her fingers trembling as she gathered the jagged remains of her shattered sword. It wasn't just broken metal; to her, it was a failure of duty. She scraped the larger shards together, then the smaller splinters, clenching her fist around a jagged hilt until her knuckles turned white.</p>`,
    chapterNumber: 11,
    publishedAt: '2021-05-31',
    views: 356,
    comments: []
  }
];

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
    description: 'Known as "The Pink Drake." Current Empress of Beambreak, mother to Ayel and Rathel. A woman of great height with gleaming green eyes and white-blond hair. Her druid form is a massive fire drake with pink scales.' 
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
    description: 'Known as "The Soundless." Son of Mira and Rashad. Has dark brown untamed hair and walks with completely silent steps. His druid forms are a black panther and a bear, which he blends into a werewolf-like hybrid.' 
  },
  'Fendo': { 
    type: 'character', 
    description: 'Sam\'s pet Myothane—a legendary hunting creature that Sam has somehow tamed into a docile, friendly companion that wags its tail like a dog.' 
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
    description: 'Ancient living trees that can speak and move. Sam has made a deal with them to deliver Sedorium to Beambreak.' 
  },
  'Druid': { 
    type: 'concept', 
    description: 'Rare beings who can transform into animal forms. Each druid is born with at least one form to master. The royal family of Beambreak are all druids.' 
  },
  'Sedorium': { 
    type: 'concept', 
    description: 'The most prized reagent—a rainbow-colored stone that glows when touched. Burns for weeks when ignited. Used for heating, lighting, smelting, and weapons.' 
  },
  'Mamori': { 
    type: 'concept', 
    description: 'The Royal Guard of Beambreak who patrol the walls between each ring of the city.' 
  },
  'Sha': { 
    type: 'concept', 
    description: 'The title for rulers of each nation. Not inherited but earned through fierce battle—each Sha is the top fighter of their nation.' 
  }
};

export const forumCategories = ['General', 'Theories', 'Character Discussion', 'Fan Art', 'Questions'];
