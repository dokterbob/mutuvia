// SPDX-License-Identifier: AGPL-3.0-or-later

const nl: Record<string, string> = {
	// Welcome
	'welcome.eyebrow': 'Gemeenschapskrediet',
	'welcome.tagline': 'Samen zijn we méér.',
	'welcome.pitch':
		'We hebben al alles wat we nodig hebben. We missen alleen het middel om het uit te wisselen.',
	'welcome.how_it_works': 'Hoe het werkt',
	'welcome.cycle_result': 'Niemand betaalde een euro. Iedereen kreeg wat ze nodig hadden.',
	'welcome.cta': 'Aan de slag',
	'welcome.returning': 'Ik heb al een account',

	// Consent
	'consent.eyebrow': 'Voordat je meedoet',
	'consent.title': 'Waar je mee akkoord gaat',
	'consent.item1_title': 'Dit registreert onderlinge schulden, geen geld',
	'consent.item1_body':
		'Wanneer iemand je krediet stuurt, zegt die persoon "ik sta bij je in het krijt." Er worden geen echte euro\'s overgemaakt.',
	'consent.item2_title': 'We bewaren bijna niets over je',
	'consent.item2_body':
		'Alleen je telefoonnummer en een weergavenaam. Geen betalingsgegevens nodig.',
	'consent.item3_title': 'Andere leden kunnen je saldo zien',
	'consent.item3_body':
		'Bij uitwisseling ziet de andere persoon je saldo — zodat ze kunnen beslissen of ze je vertrouwen.',
	'consent.item4_title': 'Open source en van de gemeenschap',
	'consent.item4_body':
		'De code is openbaar — iedereen kan het lezen en elke gemeenschap kan een eigen versie draaien. Wijzigingen die je gegevens of kredieten beïnvloeden worden altijd vooraf aangekondigd.',
	'consent.cta': 'Ik begrijp het, doorgaan',
	'consent.back': 'Terug',

	// Phone
	'phone.eyebrow': 'Inloggen',
	'phone.title': 'Je telefoonnummer',
	'phone.body': 'We sturen je een eenmalige code. Geen wachtwoord nodig, nooit.',
	'phone.label': 'Mobiel nummer',
	'phone.hint': 'Alleen gebruikt voor inloggen. Nooit gedeeld.',
	'phone.or': 'of',
	'phone.email_fallback': 'Doorgaan met email',
	'phone.cta': 'Code versturen',
	'phone.back': 'Terug',

	// Email fallback
	'email.eyebrow': 'Inloggen',
	'email.title': 'Je emailadres',
	'email.body': 'We sturen je een eenmalige code.',
	'email.label': 'Email',
	'email.hint': 'Alleen gebruikt voor inloggen. Nooit gedeeld.',
	'email.cta': 'Code versturen',
	'email.back': 'Telefoon gebruiken',

	// OTP
	'otp.eyebrow': 'Verifiëren',
	'otp.title': 'Voer de 6-cijferige code in',
	'otp.sent_to': 'Verstuurd naar {destination}. Zou binnen enkele seconden moeten aankomen.',
	'otp.resend_prompt': 'Niet ontvangen?',
	'otp.resend': 'Opnieuw versturen',
	'otp.countdown': '{seconds}s',
	'otp.cta': 'Verifiëren',
	'otp.back': 'Terug',

	// Verified
	'verified.title': 'Geverifieerd',
	'verified.body': 'Je nummer is bevestigd. Laten we alles instellen.',
	'verified.cta': 'Doorgaan',

	// Intro 1
	'intro1.skip': 'Intro overslaan',
	'intro1.eyebrow': 'Wat is dit?',
	'intro1.title': 'Een register van vertrouwen',
	'intro1.body1':
		'Wanneer iemand je krediet stuurt, zegt die: ik sta bij je in het krijt. Wanneer jij krediet stuurt, zeg je: ik sta bij je in het krijt. Er beweegt geen echt geld.',
	'intro1.body2':
		'Omdat krediet een positieve en negatieve kant heeft die elkaar opheffen, kan de gemeenschap handelen op basis van vertrouwen — niet op basis van contant geld. Jullie creëren samen liquiditeit, uit het niets.',
	'intro1.cta': 'Begrepen',

	// Intro 2
	'intro2.skip': 'Intro overslaan',
	'intro2.eyebrow': 'Je saldo',
	'intro2.title': 'Negatief is normaal',
	'intro2.body1':
		'Je saldo toont wat de gemeenschap je verschuldigd is (positief) of wat jij de gemeenschap verschuldigd bent (negatief).',
	'intro2.body2':
		'Negatief zijn betekent alleen dat je tot nu toe meer hebt ontvangen dan gegeven. De gemeenschap vertrouwt erop dat je na verloop van tijd bijdraagt.',
	'intro2.cta': 'Begrepen',
	'intro2.back': 'Terug',

	// Intro 3 - Name entry
	'intro3.eyebrow': 'Bijna klaar',
	'intro3.title': 'Hoe moeten we je noemen?',
	'intro3.body':
		'Zo zien andere leden je. Je kunt het later wijzigen in Instellingen.',
	'intro3.label': 'Je weergavenaam',
	'intro3.placeholder': 'bijv. Ana, Bruno, Carla…',
	'intro3.hint': '2–40 tekens. Geen echte naam vereist.',
	'intro3.cta': 'De gemeenschap betreden',
	'intro3.back': 'Terug',

	// Home
	'home.greeting': 'Goedemorgen, {name}',
	'home.balance_label': 'Je saldo',
	'home.balance_positive': 'De gemeenschap is je verschuldigd',
	'home.balance_negative': 'Je bent de gemeenschap verschuldigd',
	'home.balance_zero': 'Je staat quitte',
	'home.balance_first_use':
		'Je saldo begint op nul. Verstuur of ontvang krediet om te beginnen.',
	'home.send': 'Versturen',
	'home.receive': 'Ontvangen',
	'home.recent': 'Recent',
	'home.see_all': 'Alles zien',
	'home.empty_state':
		'Je saldo begint op nul.\nTik op Versturen of Ontvangen om te beginnen.',

	// Send flow
	'send.consent_title': 'Je verleent krediet',
	'send.consent_body1':
		'Wanneer je iemand krediet stuurt, leen je diegene waarde. Je vertrouwt erop dat die persoon na verloop van tijd teruggeeft aan de gemeenschap — direct aan jou, of aan anderen.',
	'send.consent_body2':
		'Er is geen automatische terugbetaling. Als jullie specifieke voorwaarden hebben afgesproken — een termijn, een dienst in ruil, wat dan ook — schrijf ze in de beschrijving. Die notitie hoort bij het transactierecord.',
	'send.consent_body3':
		'Het systeem werkt het beste wanneer mensen geen terugbetaling eisen. Maar je hebt altijd het recht om te vragen.',
	'send.consent_cta': 'Ik begrijp het, laten we gaan',
	'send.consent_cancel': 'Niet nu',
	'send.amount_label': 'Bedrag',
	'send.note_placeholder': 'Waarvoor? Voorwaarden? (optioneel)',
	'send.cta': 'QR genereren',
	'send.qr_caption': 'Laat dit aan de andere persoon zien. Die scant het om te accepteren.',
	'send.qr_expired': 'Verlopen — tik om terug te gaan.',
	'send.cancel': 'Annuleren',
	'send.done': 'Klaar. Je hebt {amount} gestuurd naar {name}.',
	'send.back_home': 'Terug naar home',

	// Receive flow
	'receive.helper': 'Voer het bedrag in dat je wilt vragen.',
	'receive.note_placeholder': 'Waarvoor? (optioneel)',
	'receive.cta': 'QR genereren',
	'receive.qr_caption': 'Vraag de andere persoon om dit te scannen om je krediet te sturen.',
	'receive.done': 'Klaar. Je hebt {amount} ontvangen van {name}.',
	'receive.back_home': 'Terug naar home',

	// Accept screen
	'accept.send_prompt': '{name} wil je {amount} sturen',
	'accept.receive_prompt': '{name} vraagt {amount} van je',
	'accept.balance_label': 'Huidig saldo van {name}: {balance}',
	'accept.first_time_notice':
		'Accepteren registreert een gemeenschapskrediet — geen echt geld. Saldo\'s worden bijgewerkt in jullie gedeelde register.',
	'accept.cta': 'Accepteren',
	'accept.decline': 'Weigeren',
	'accept.expired': 'Deze link is verlopen of ongeldig.',

	// Transaction history
	'history.title': 'Transactiegeschiedenis',
	'history.all': 'Alles',
	'history.sent': 'Verstuurd',
	'history.received': 'Ontvangen',

	// Settings
	'settings.title': 'Instellingen',
	'settings.display_name': 'Weergavenaam',
	'settings.language': 'Taal',
	'settings.sign_out': 'Uitloggen',
	'settings.about': 'Over',
	'settings.about_text':
		'{appName} is een wederzijds kredietregister voor gemeenschappen. Er beweegt geen echt geld — krediet registreert onderlinge verplichtingen tussen leden.',
	'settings.save': 'Opslaan',
	'settings.saved': 'Opgeslagen!'
};

export default nl;
