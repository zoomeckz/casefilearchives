
-- Dialogue punctuation: Chapter 66
UPDATE chapters SET content = replace(content, '"What do we do."', '"What do we do?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"Are we comfortable with that."', '"Are we comfortable with that?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"Which excludes Brine Court Conduits."', '"Which excludes Brine Court Conduits?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"What is the topic of the meeting."', '"What is the topic of the meeting?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"Has Yarro come back to you."', '"Has Yarro come back to you?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"Why did you not tell me sooner."', '"Why did you not tell me sooner?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"How many of them are still alive."', '"How many of them are still alive?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"Why these three."', '"Why these three?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"Where are you on the vault."', '"Where are you on the vault?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"How long has the Ledger been preparing to make this recommendation."', '"How long has the Ledger been preparing to make this recommendation?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"What have you settled on for today."', '"What have you settled on for today?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"Which reading do you favour."', '"Which reading do you favour?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"What is your guess."', '"What is your guess?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"Does he have an exit-permit."', '"Does he have an exit-permit?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"How do we approach him."', '"How do we approach him?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"Do we approach him in the shop."', '"Do we approach him in the shop?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"Has he ever declined."', '"Has he ever declined?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"What work."', '"What work?"') WHERE chapter_number = 66;
UPDATE chapters SET content = replace(content, '"Are you going to retrieve it."', '"Are you going to retrieve it?"') WHERE chapter_number = 66;

-- Dialogue punctuation: Chapter 67
UPDATE chapters SET content = replace(content, '"May I attempt the deeper reason."', '"May I attempt the deeper reason?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"What."', '"What?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"How did the village end."', '"How did the village end?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"What followed."', '"What followed?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"What happened to the Vahar''ai who lived there."', '"What happened to the Vahar''ai who lived there?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"Are you well."', '"Are you well?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"Are you sure."', '"Are you sure?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"Why do you ask, General."', '"Why do you ask, General?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"What are you writing."', '"What are you writing?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"How long until you are ready."', '"How long until you are ready?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"Why minimal."', '"Why minimal?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"How."', '"How?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"How long have you been up."', '"How long have you been up?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"What did you tell him."', '"What did you tell him?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"What is it. In as much detail as you are willing to share."', '"What is it? In as much detail as you are willing to share."') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"Will the library complicate your work, if you agree to perform the procedure at scale."', '"Will the library complicate your work, if you agree to perform the procedure at scale?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"What kind of participation."', '"What kind of participation?"') WHERE chapter_number = 67;
UPDATE chapters SET content = replace(content, '"Are you — well, in respect of the leaving."', '"Are you — well, in respect of the leaving?"') WHERE chapter_number = 67;

-- Codex expansion
INSERT INTO glossary (term, type, description, first_chapter, aliases) VALUES
('Ka''iri', 'location', 'A Vahar''ai village that existed for approximately two hundred and ten years before being destroyed roughly seventy years before Vehn''s birth. Its ground now lies beneath the eastern lower district of Beambreak, in the neighbourhood of the wool warehouses. Ossian was born and lived there.', 66, ARRAY[]::text[]),
('The Ledger', 'concept', 'A trusted advisory body within Mira''s court responsible for long-range intelligence, tradecraft assessments, and formal recommendations to the queen. Headed by Yarro, the Ledger interfaces with field operatives such as the senior tracker working the An''therani contract and produces multi-year strategic readings for Beambreak.', 66, ARRAY['Ledger']::text[]),
('An''therani', 'concept', 'A diaspora folk numbering somewhere between two and four hundred surviving individuals scattered across the continent. Long sought by both Beambreak''s Ledger and rival powers, an An''therani family is being escorted toward Beambreak under contract with the senior tracker Mehress.', 66, ARRAY['An''therani diaspora']::text[]),
('Calden Vey', 'character', 'Junior of three regents of the Brine Court and signatory of the Court''s first letter to Beambreak. Forty-six years old, six years in the regents'' chamber, tall and narrow-shouldered with salt-weathered coastal skin. A patient listener raised in a household oriented toward continental rather than purely coastal politics; sent to Beambreak as the Brine Court''s envoy.', 66, ARRAY['Vey', 'Brine Court envoy']::text[]),
('General Thessaly', 'character', 'Senior general of Beambreak''s forces and Mira''s field commander. Travels between the capital and the road expedition by stages on horseback, interfacing with Vehn, Aldwyn, Itarrek and Master Grebby on behalf of the queen. Has a long-running working argument with Kassandra over whether her time is better spent in the capital or in the field.', 66, ARRAY['Thessaly']::text[]),
('Mycelir', 'concept', 'A collective whose protracted negotiation with Aldwyn''s caravan is approaching its conclusion. Sufficiently consequential that Aldwyn has remained with the road expedition for twelve consecutive days to bring the talks to a close at what is, by his standards, an urgent pace.', 67, ARRAY['Mycelir collective']::text[]),
('Hesh', 'character', 'Tessik dealer in his sixties, operating in Beambreak for at least thirty years after coming up from Mezaru as a young man. Holds a commissioned object once ordered by Rathel''s late father; Rathel travels to Hesh''s shop with Velvet to retrieve it.', 66, ARRAY[]::text[]),
('Yarro', 'character', 'Head of the Ledger and senior intelligence advisor to Mira. Delivers strategic recommendations to the queen in person, manages contact with the senior tracker assigned to the An''therani family, and produces the Ledger''s long-range readings on Beambreak''s position.', 66, ARRAY[]::text[]),
('Shia', 'character', 'A member of Mira''s inner staff in Beambreak responsible for delivering the morning arrivals report and other daily briefings to the queen.', 66, ARRAY[]::text[]),
('Mehress', 'character', 'The senior tracker contracted by the Ledger to escort the An''therani family from their hidden settlement to Beambreak. Reports through a parallel-archive arrangement, ultimately answering to General Thessaly via the Ledger.', 66, ARRAY[]::text[]);
