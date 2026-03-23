// SPDX-License-Identifier: AGPL-3.0-or-later

const pt: Record<string, string> = {
	// Welcome
	'welcome.eyebrow': 'Crédito Comunitário',
	'welcome.tagline': 'Juntos, somos mais.',
	'welcome.pitch':
		'Já temos tudo o que precisamos. Falta-nos apenas o meio para o trocar.',
	'welcome.how_it_works': 'Como funciona',
	'welcome.cycle_result': 'Ninguém pagou um euro. Todos receberam o que precisavam.',
	'welcome.cta': 'Começar',
	'welcome.returning': 'Já tenho uma conta',

	// Consent
	'consent.eyebrow': 'Antes de entrar',
	'consent.title': 'O que estás a aceitar',
	'consent.item1_title': 'Isto regista dívidas mútuas, não dinheiro',
	'consent.item1_body':
		'Quando alguém te envia crédito, está a dizer "devo-te." Nenhum euro real é transferido.',
	'consent.item2_title': 'Guardamos quase nada sobre ti',
	'consent.item2_body':
		'Apenas o teu número de telefone e um nome para exibir. Sem dados de pagamento.',
	'consent.item3_title': 'Outros membros podem ver o teu saldo',
	'consent.item3_body':
		'Ao trocar, a outra pessoa vê o teu saldo — para decidir se confia em ti.',
	'consent.item4_title': 'Código aberto e da comunidade',
	'consent.item4_body':
		'O código é público — qualquer pessoa pode lê-lo e qualquer comunidade pode ter a sua instância. Mudanças que afetem os teus dados ou créditos serão sempre anunciadas com antecedência.',
	'consent.cta': 'Compreendo, continuar',
	'consent.back': 'Voltar',

	// Phone
	'phone.eyebrow': 'Entrar',
	'phone.title': 'O teu número de telefone',
	'phone.body': 'Enviamos-te um código único. Sem passwords, nunca.',
	'phone.label': 'Número de telemóvel',
	'phone.hint': 'Usado apenas para entrar. Nunca partilhado.',
	'phone.or': 'ou',
	'phone.email_fallback': 'Continuar com email',
	'phone.cta': 'Enviar código',
	'phone.back': 'Voltar',

	// Email fallback
	'email.eyebrow': 'Entrar',
	'email.title': 'O teu email',
	'email.body': 'Enviamos-te um código único.',
	'email.label': 'Email',
	'email.hint': 'Usado apenas para entrar. Nunca partilhado.',
	'email.cta': 'Enviar código',
	'email.back': 'Usar telefone',

	// OTP
	'otp.eyebrow': 'Verificar',
	'otp.title': 'Introduz o código de 6 dígitos',
	'otp.sent_to': 'Enviado para {destination}. Deve chegar em poucos segundos.',
	'otp.resend_prompt': 'Não recebeste?',
	'otp.resend': 'Reenviar',
	'otp.countdown': '{seconds}s',
	'otp.cta': 'Verificar',
	'otp.back': 'Voltar',

	// Verified
	'verified.title': 'Verificado',
	'verified.body': 'O teu número está confirmado. Vamos configurar tudo.',
	'verified.cta': 'Continuar',

	// Intro 1
	'intro1.skip': 'Saltar intro',
	'intro1.eyebrow': 'O que é isto?',
	'intro1.title': 'Um livro de confiança',
	'intro1.body1':
		'Quando alguém te envia crédito, está a dizer: devo-te. Quando tu envias crédito, estás a dizer: devo-te. Nenhum dinheiro real se move.',
	'intro1.body2':
		'Como o crédito tem um lado positivo e um negativo que se anulam, a comunidade pode trocar na medida da sua confiança — não na medida do seu dinheiro. Criam liquidez juntos, a partir do nada.',
	'intro1.cta': 'Percebi',

	// Intro 2
	'intro2.skip': 'Saltar intro',
	'intro2.eyebrow': 'O teu saldo',
	'intro2.title': 'Negativo é normal',
	'intro2.body1':
		'O teu saldo mostra o que a comunidade te deve (positivo) ou o que tu deves à comunidade (negativo).',
	'intro2.body2':
		'Estar negativo significa apenas que recebeste mais do que deste até agora. A comunidade confia que vais contribuir com o tempo.',
	'intro2.cta': 'Entendido',
	'intro2.back': 'Voltar',

	// Intro 3 - Name entry
	'intro3.eyebrow': 'Quase lá',
	'intro3.title': 'Como te devemos chamar?',
	'intro3.body':
		'É assim que os outros membros te vão ver. Podes mudar mais tarde nas Definições.',
	'intro3.label': 'O teu nome de exibição',
	'intro3.placeholder': 'ex. Ana, Bruno, Carla…',
	'intro3.hint': '2–40 caracteres. Não precisa de ser o nome real.',
	'intro3.cta': 'Entrar na comunidade',
	'intro3.back': 'Voltar',

	// Home
	'home.greeting': 'Bom dia, {name}',
	'home.balance_label': 'O teu saldo',
	'home.balance_positive': 'A comunidade deve-te',
	'home.balance_negative': 'Tu deves à comunidade',
	'home.balance_zero': 'Estás em dia',
	'home.balance_first_use':
		'O teu saldo começa em zero. Envia ou recebe crédito para começar.',
	'home.send': 'Enviar',
	'home.receive': 'Receber',
	'home.recent': 'Recentes',
	'home.see_all': 'Ver tudo',
	'home.empty_state':
		'O teu saldo começa em zero.\nToca em Enviar ou Receber para começar.',

	// Send flow
	'send.consent_title': 'Estás a conceder crédito',
	'send.consent_body1':
		'Quando envias crédito a alguém, estás a emprestar-lhe valor. Confias que essa pessoa vai retribuir à comunidade ao longo do tempo — diretamente a ti, ou a outros.',
	'send.consent_body2':
		'Não há reembolso automático. Se combinaram condições específicas — um prazo, um serviço em troca, o que for — escreve na descrição quando enviares. Essa nota fica no registo da transação.',
	'send.consent_body3':
		'O sistema funciona melhor quando as pessoas não exigem reembolso. Mas tens sempre o direito de pedir.',
	'send.consent_cta': 'Compreendo, vamos lá',
	'send.consent_cancel': 'Agora não',
	'send.amount_label': 'Montante',
	'send.note_placeholder': 'Para quê? Alguma condição? (opcional)',
	'send.cta': 'Gerar QR',
	'send.qr_caption': 'Mostra isto à outra pessoa. Ela digitaliza para aceitar.',
	'send.qr_expired': 'Expirado — toca para voltar.',
	'send.cancel': 'Cancelar',
	'send.done': 'Feito. Enviaste {amount} a {name}.',
	'send.back_home': 'Voltar ao início',

	// Receive flow
	'receive.helper': 'Introduz o montante que queres pedir.',
	'receive.note_placeholder': 'Para quê? (opcional)',
	'receive.cta': 'Gerar QR',
	'receive.qr_caption': 'Pede à outra pessoa para digitalizar isto e enviar-te crédito.',
	'receive.done': 'Feito. Recebeste {amount} de {name}.',
	'receive.back_home': 'Voltar ao início',

	// Accept screen
	'accept.send_prompt': '{name} quer enviar-te {amount}',
	'accept.receive_prompt': '{name} está a pedir-te {amount}',
	'accept.balance_label': 'Saldo atual de {name}: {balance}',
	'accept.first_time_notice':
		'Aceitar regista um crédito comunitário — não dinheiro real. Os saldos serão atualizados no vosso livro partilhado.',
	'accept.cta': 'Aceitar',
	'accept.decline': 'Recusar',
	'accept.expired': 'Este link expirou ou é inválido.',

	// Transaction history
	'history.title': 'Histórico de transações',
	'history.all': 'Todas',
	'history.sent': 'Enviadas',
	'history.received': 'Recebidas',

	// Settings
	'settings.title': 'Definições',
	'settings.display_name': 'Nome de exibição',
	'settings.language': 'Idioma',
	'settings.sign_out': 'Sair',
	'settings.about': 'Sobre',
	'settings.about_text':
		'{appName} é um livro de crédito mútuo para comunidades. Nenhum dinheiro real se move — o crédito regista obrigações mútuas entre membros.',
	'settings.save': 'Guardar',
	'settings.saved': 'Guardado!'
};

export default pt;
