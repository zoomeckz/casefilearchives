UPDATE chapters SET content = replace(content, '"How much venom did it get into you."', '"How much venom did it get into you?"') WHERE chapter_number = 56;
UPDATE chapters SET content = replace(content, '"How many are up."', '"How many are up?"') WHERE chapter_number = 56;
UPDATE chapters SET content = replace(content, '"What does she consider large."', '"What does she consider large?"') WHERE chapter_number = 56;
UPDATE chapters SET content = replace(content, '"What for."', '"What for?"') WHERE chapter_number = 56;
UPDATE chapters SET content = replace(content, '"Are you all right."', '"Are you all right?"') WHERE chapter_number = 56;
UPDATE chapters SET content = replace(content, '"Can you walk."', '"Can you walk?"') WHERE chapter_number = 56;
UPDATE chapters SET content = replace(content, '"What is it."', '"What is it?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"Which pheromones."', '"Which pheromones?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"Are you all right."', '"Are you all right?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"Which trait."', '"Which trait?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"Why are you telling me this."', '"Why are you telling me this?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"Are you certain."', '"Are you certain?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"Is this within the rules."', '"Is this within the rules?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"What."', '"What?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"What kind of help."', '"What kind of help?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"How long."', '"How long?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"How long did I sleep."', '"How long did I sleep?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"What is the joke."', '"What is the joke?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"Are we good."', '"Are we good?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"Is the asking you or the pheromones."', '"Is the asking you or the pheromones?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"What kind."', '"What kind?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"How many."', '"How many?"') WHERE chapter_number = 57;
UPDATE chapters SET content = replace(content, '"Is this the spiderfolk."', '"Is this the spiderfolk?"') WHERE chapter_number = 58;
UPDATE chapters SET content = replace(content, '"Are you all right."', '"Are you all right?"') WHERE chapter_number = 58;
UPDATE chapters SET content = replace(content, '"Why are you telling me this."', '"Why are you telling me this?"') WHERE chapter_number = 58;
UPDATE chapters SET content = replace(content, '"Are you certain."', '"Are you certain?"') WHERE chapter_number = 58;
UPDATE chapters SET content = replace(content, '"How do you know."', '"How do you know?"') WHERE chapter_number = 58;
UPDATE chapters SET content = replace(content, '"What do you need."', '"What do you need?"') WHERE chapter_number = 58;
UPDATE chapters SET content = replace(content, '"Are you sure."', '"Are you sure?"') WHERE chapter_number = 58;
UPDATE chapters SET content = replace(content, '"Is the asking you or the pheromones."', '"Is the asking you or the pheromones?"') WHERE chapter_number = 58;
UPDATE chapters SET content = replace(content, '"Why embarrassing."', '"Why embarrassing?"') WHERE chapter_number = 58;
UPDATE chapters SET content = replace(content, '"What kind."', '"What kind?"') WHERE chapter_number = 58;
UPDATE chapters SET content = replace(content, '"How many."', '"How many?"') WHERE chapter_number = 58;
UPDATE chapters SET content = replace(content, '"How far out."', '"How far out?"') WHERE chapter_number = 59;
UPDATE chapters SET content = replace(content, '"What."', '"What?"') WHERE chapter_number = 59;
UPDATE chapters SET content = replace(content, '"What is your proposal."', '"What is your proposal?"') WHERE chapter_number = 59;
UPDATE chapters SET content = replace(content, '"May I ask you something that is not about the road or the Venerated."', '"May I ask you something that is not about the road or the Venerated?"') WHERE chapter_number = 59;
UPDATE chapters SET content = replace(content, '"How did I hold my people."', '"How did I hold my people?"') WHERE chapter_number = 59;
UPDATE chapters SET content = replace(content, '"How is your head."', '"How is your head?"') WHERE chapter_number = 59;
UPDATE chapters SET content = replace(content, '"Why stop."', '"Why stop?"') WHERE chapter_number = 59;
UPDATE chapters SET content = replace(content, '"What do you need."', '"What do you need?"') WHERE chapter_number = 59;
UPDATE chapters SET content = replace(content, '"Is it the me-portion or the them-portion tonight."', '"Is it the me-portion or the them-portion tonight?"') WHERE chapter_number = 59;
UPDATE chapters SET content = replace(content, '"How do you know about the Ra''den. How do you know about Mikhail."', '"How do you know about the Ra''den? How do you know about Mikhail?"') WHERE chapter_number = 59;
UPDATE chapters SET content = replace(content, '"How did you hold yourself. Eight years of starving, rationed, cramped, watching the species fail in real time. How did you not break."', '"How did you hold yourself? Eight years of starving, rationed, cramped, watching the species fail in real time. How did you not break?"') WHERE chapter_number = 59;
UPDATE chapters SET content = replace(content, '"How far."', '"How far?"') WHERE chapter_number = 60;
UPDATE chapters SET content = replace(content, '"How large."', '"How large?"') WHERE chapter_number = 60;
UPDATE chapters SET content = replace(content, '"How do you read the silence."', '"How do you read the silence?"') WHERE chapter_number = 60;
UPDATE chapters SET content = replace(content, '"What did your daughter do."', '"What did your daughter do?"') WHERE chapter_number = 60;
UPDATE chapters SET content = replace(content, '"How fast."', '"How fast?"') WHERE chapter_number = 60;

INSERT INTO glossary (term, type, description, first_chapter, aliases) VALUES
('Spiderfolk', 'creature', 'The colloquial collective name used by Sam and Ayel for the burrow-dwelling species in the Quiet Region. They reproduce by adapting offspring to traits of nearby beings via airborne pheromones, take multiple body forms (a humanoid courtesy form and a true second form resembling large arachnids), and are organised under a single queen with senior daughters who serve as scouts, enforcers, and emissaries.', 56, ARRAY['spiderfolk']::text[]),
('The Second', 'character', 'Senior daughter of the queen of the spiderfolk and sister to The First. Tall and broad-shouldered in her courtesy form, with copper hair and the warm brown skin of the mountain people. Her second form is the larger of the two daughter forms shown to Sam and Ayel during the midday demonstration. Her courtesy form has been progressively adapting toward Dim''cran traits in response to Ayel''s presence.', 56, ARRAY['Second']::text[]),
('The Third', 'character', 'Junior daughter of the queen of the spiderfolk. Short and silver-haired in her courtesy form. Her true second form is smaller — about the size of a large dog — and presents as male, with a nerubian build. Like her sister The Second, her body has been optimising in response to the visitors.', 56, ARRAY['Third']::text[]),
('Honey', 'creature', 'Vehn''s house cat in Beambreak, named by Grebby after the sweet thing the bees produce — the warmest word he knew in the up-country. Carried by Vehn through the courtyard daily, Honey has the comprehensive collapse of a creature who has been carried every day of her life and has decided this is her right.', 60, ARRAY[]::text[]),
('Central Herd', 'concept', 'The Hjord political body led by matriarch Despina, encompassing Sam''s encampment and several allied groups. Sends formal emissaries (Captains of Household, like Kallia) to neighbouring powers when matters of consequence arise. Recognised by other crowns as the leading authority among the Hjord herds.', 60, ARRAY[]::text[]);