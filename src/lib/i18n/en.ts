// SPDX-License-Identifier: AGPL-3.0-or-later

const en: Record<string, string> = {
	// Welcome
	'welcome.eyebrow': 'Community Credit',
	'welcome.tagline': 'Together, we are more.',
	'welcome.pitch': 'We already have everything we need. We just lack the means to exchange it.',
	'welcome.how_it_works': 'How it works',
	'welcome.cycle_result': 'Nobody paid a euro. Everyone got what they needed.',
	'welcome.cta': 'Get started',
	'welcome.returning': 'I already have an account',

	// Consent
	'consent.eyebrow': 'Before you join',
	'consent.title': 'What you\'re agreeing to',
	'consent.item1_title': 'This records mutual debts, not money',
	'consent.item1_body':
		'When someone sends you credit they are saying "I owe you." No real euros are transferred.',
	'consent.item2_title': 'We store almost nothing about you',
	'consent.item2_body': 'Only your phone number and a display name. No payment details needed.',
	'consent.item3_title': 'Other members can see your balance',
	'consent.item3_body':
		'When exchanging, the other person sees your balance — so they can decide whether to trust you.',
	'consent.item4_title': 'Open source and community-owned',
	'consent.item4_body':
		'The code is public — anyone can read it and any community can run their own instance. Changes that affect your data or credits will always be announced in advance.',
	'consent.cta': 'I understand, continue',
	'consent.back': 'Back',

	// Phone
	'phone.eyebrow': 'Sign in',
	'phone.title': 'Your phone number',
	'phone.body': "We'll send you a one-time code. No password needed, ever.",
	'phone.label': 'Mobile number',
	'phone.hint': 'Used only for sign-in. Never shared.',
	'phone.or': 'or',
	'phone.email_fallback': 'Continue with email instead',
	'phone.cta': 'Send code',
	'phone.back': 'Back',

	// Email fallback
	'email.eyebrow': 'Sign in',
	'email.title': 'Your email address',
	'email.body': "We'll send you a one-time code.",
	'email.label': 'Email',
	'email.hint': 'Used only for sign-in. Never shared.',
	'email.cta': 'Send code',
	'email.back': 'Use phone instead',

	// OTP
	'otp.eyebrow': 'Verify',
	'otp.title': 'Enter the 6-digit code',
	'otp.sent_to': 'Sent to {destination}. Should arrive within a few seconds.',
	'otp.resend_prompt': "Didn't receive it?",
	'otp.resend': 'Resend',
	'otp.countdown': '{seconds}s',
	'otp.cta': 'Verify',
	'otp.back': 'Back',

	// Verified
	'verified.title': "You're verified",
	'verified.body': 'Your number is confirmed. Let\'s get you set up.',
	'verified.cta': 'Continue',

	// Intro 1
	'intro1.skip': 'Skip intro',
	'intro1.eyebrow': 'What is this?',
	'intro1.title': 'A ledger of trust',
	'intro1.body1':
		'When someone sends you credit, they are saying: I owe you. When you send credit, you are saying: I owe you. No real money moves.',
	'intro1.body2':
		'Because credit has a positive side and a negative side that cancel out, the community can trade to the extent of its trust — not to the extent of its cash. You effectively create liquidity together, from nothing.',
	'intro1.cta': 'Got it',

	// Intro 2
	'intro2.skip': 'Skip intro',
	'intro2.eyebrow': 'Your balance',
	'intro2.title': 'Negative is normal',
	'intro2.body1':
		'Your balance shows what the community owes you (positive) or what you owe the community (negative).',
	'intro2.body2':
		"Being negative just means you've received more than you've given so far. The community trusts you to contribute over time.",
	'intro2.cta': 'Understood',
	'intro2.back': 'Back',

	// Intro 3 - Name entry
	'intro3.eyebrow': 'Almost there',
	'intro3.title': 'What should we call you?',
	'intro3.body': 'This is how other members will see you. You can change it later in Settings.',
	'intro3.label': 'Your display name',
	'intro3.placeholder': 'e.g. Ana, Bruno, Carla…',
	'intro3.hint': '2–40 characters. No real name required.',
	'intro3.cta': 'Enter the community',
	'intro3.back': 'Back',

	// Home
	'home.greeting': 'Good morning, {name}',
	'home.balance_label': 'Your balance',
	'home.balance_positive': 'The community owes you',
	'home.balance_negative': 'You owe the community',
	'home.balance_zero': "You're all square",
	'home.balance_first_use': 'Your balance starts at zero. Send or receive credit to get started.',
	'home.send': 'Send',
	'home.receive': 'Receive',
	'home.recent': 'Recent',
	'home.see_all': 'See all',
	'home.empty_state': 'Your balance starts at zero.\nTap Send or Receive to get started.',

	// Send flow
	'send.consent_title': 'You are extending credit',
	'send.consent_body1':
		'When you send credit to someone, you are lending them value. You trust that they will contribute back to the community over time — directly to you, or to others.',
	'send.consent_body2':
		'There is no automatic repayment. If you have agreed on specific conditions — a timeframe, a service in return, anything — write them in the description when you send. That note belongs to the transaction record.',
	'send.consent_body3':
		'The system works best when people do not demand repayment. But you always have the right to ask.',
	'send.consent_cta': "I understand, let's go",
	'send.consent_cancel': 'Not now',
	'send.amount_label': 'Amount',
	'send.note_placeholder': "What's this for? Any conditions? (optional)",
	'send.cta': 'Generate QR',
	'send.qr_caption': 'Show this to the other person. They scan it to accept.',
	'send.qr_expired': 'Expired — tap to go back.',
	'send.cancel': 'Cancel',
	'send.done': 'Done. You sent {amount} to {name}.',
	'send.back_home': 'Back to home',

	// QR link sharing
	'qr.copy_link': 'Copy link',
	'qr.copied': 'Copied!',
	'qr.share': 'Share',

	// Receive flow
	'receive.helper': "Enter the amount you'd like to request.",
	'receive.note_placeholder': "What's this for? (optional)",
	'receive.cta': 'Generate QR',
	'receive.qr_caption': 'Ask the other person to scan this to send you credit.',
	'receive.done': 'Done. You received {amount} from {name}.',
	'receive.back_home': 'Back to home',

	// Accept screen
	'accept.send_prompt': '{name} wants to send you {amount}',
	'accept.receive_prompt': '{name} is requesting {amount} from you',
	'accept.balance_label': "{name}'s current balance: {balance}",
	'accept.first_time_notice':
		'Accepting records a community credit — not real money. Balances will update in your shared ledger.',
	'accept.cta': 'Accept',
	'accept.decline': 'Decline',
	'accept.expired': 'This link has expired or is invalid.',

	// Transaction history
	'history.title': 'Transaction history',
	'history.all': 'All',
	'history.sent': 'Sent',
	'history.received': 'Received',

	// Settings
	'settings.title': 'Settings',
	'settings.display_name': 'Display name',
	'settings.language': 'Language',
	'settings.sign_out': 'Sign out',
	'settings.about': 'About',
	'settings.about_text':
		'{appName} is a mutual credit ledger for communities. No real money moves — credit records mutual obligations between members.',
	'settings.save': 'Save',
	'settings.saved': 'Saved!'
};

export default en;
