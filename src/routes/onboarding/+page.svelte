<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { locale, t, localeNames, type Locale } from '$lib/i18n';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { IconArrowRight, IconArrowLeft, IconCheck } from '@tabler/icons-svelte';

	let { data } = $props();

	type Step =
		| 'welcome'
		| 'consent'
		| 'phone'
		| 'email'
		| 'otp'
		| 'verified'
		| 'intro1'
		| 'intro2'
		| 'name';

	let currentStep = $state<Step>((data.step as Step) || 'welcome');

	// Phone / email auth state
	let phoneNumber = $state('');
	let countryCode = $state('+351');
	let emailAddress = $state('');
	let otpCode = $state('');
	let otpDestination = $state('');
	let otpMethod = $state<'phone' | 'email'>('phone');
	let isLoading = $state(false);
	let authError = $state('');
	let countdown = $state(0);
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	// Name entry
	let displayName = $state('');

	function goTo(step: Step) {
		currentStep = step;
		const url = new URL(window.location.href);
		url.searchParams.set('step', step);
		window.history.replaceState({}, '', url.toString());
	}

	function startCountdown() {
		countdown = 30;
		if (countdownInterval) clearInterval(countdownInterval);
		countdownInterval = setInterval(() => {
			countdown--;
			if (countdown <= 0 && countdownInterval) {
				clearInterval(countdownInterval);
				countdownInterval = null;
			}
		}, 1000);
	}

	async function sendPhoneOtp() {
		isLoading = true;
		authError = '';
		const fullPhone = `${countryCode}${phoneNumber.replace(/\s/g, '')}`;
		try {
			await authClient.phoneNumber.sendOtp({ phoneNumber: fullPhone });
			otpDestination = fullPhone;
			otpMethod = 'phone';
			startCountdown();
			goTo('otp');
		} catch (e: unknown) {
			authError = e instanceof Error ? e.message : 'Failed to send code';
		} finally {
			isLoading = false;
		}
	}

	async function sendEmailOtp() {
		isLoading = true;
		authError = '';
		try {
			await authClient.emailOtp.sendVerificationOtp({ email: emailAddress, type: 'sign-in' });
			otpDestination = emailAddress;
			otpMethod = 'email';
			startCountdown();
			goTo('otp');
		} catch (e: unknown) {
			authError = e instanceof Error ? e.message : 'Failed to send code';
		} finally {
			isLoading = false;
		}
	}

	async function verifyOtp() {
		isLoading = true;
		authError = '';
		try {
			if (otpMethod === 'phone') {
				await authClient.phoneNumber.verify({ phoneNumber: otpDestination, code: otpCode });
			} else {
				await authClient.emailOtp.verifyEmail({ email: otpDestination, otp: otpCode });
			}
			goTo('verified');
		} catch (e: unknown) {
			authError = e instanceof Error ? e.message : 'Invalid code';
		} finally {
			isLoading = false;
		}
	}

	async function resendOtp() {
		if (countdown > 0) return;
		if (otpMethod === 'phone') {
			await authClient.phoneNumber.sendOtp({ phoneNumber: otpDestination });
		} else {
			await authClient.emailOtp.sendVerificationOtp({ email: otpDestination, type: 'sign-in' });
		}
		otpCode = '';
		startCountdown();
	}

	function handleOtpInput(e: Event) {
		const input = e.target as HTMLInputElement;
		otpCode = input.value.replace(/\D/g, '').slice(0, 6);
		input.value = otpCode;
		if (otpCode.length === 6) {
			verifyOtp();
		}
	}

	function cycleLocale() {
		const locales: Locale[] = ['en', 'pt', 'nl'];
		const idx = locales.indexOf($locale);
		locale.set(locales[(idx + 1) % locales.length]);
	}

	$effect(() => {
		// If arriving authenticated, jump to intro
		if (data.isAuthenticated && !data.hasAppUser && currentStep === 'welcome') {
			goTo('intro1');
		}
	});
</script>

<div class="flex min-h-dvh flex-col bg-[#FAF8F3]">
	<!-- Language toggle -->
	<div class="flex justify-end p-4">
		<button
			onclick={cycleLocale}
			class="rounded-lg border border-[#DDD8CE] bg-white px-3 py-1.5 text-xs font-medium text-[#6B7A6E] transition hover:bg-[#EDE7D9]"
		>
			{localeNames[$locale]}
		</button>
	</div>

	<div class="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8">
		<!-- Step: Welcome -->
		{#if currentStep === 'welcome'}
			<div class="flex flex-1 flex-col">
				<!-- Logo -->
				<div class="mb-5 flex items-center gap-3">
					<div
						class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#2D4A32]"
					>
						<svg width="22" height="22" viewBox="0 0 52 52" fill="none">
							<path
								d="M26 10C18 10 12 16 12 24c0 8 6 14 14 14s14-6 14-14"
								stroke="white"
								stroke-width="2.5"
								stroke-linecap="round"
								fill="none"
							/>
							<path
								d="M26 13v22M20 19l6-6 6 6"
								stroke="rgba(255,255,255,0.7)"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</div>
					<span class="font-serif text-lg text-[#1E2820]"
						>{$page.data.appName ?? 'Mutuvia'}</span
					>
				</div>

				<p
					class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]"
				>
					{$t('welcome.eyebrow')}
				</p>
				<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
					<span class="text-[#2D4A32]">{$t('welcome.tagline').split(',')[0]},</span>{$t(
						'welcome.tagline'
					)
						.split(',')
						.slice(1)
						.join(',')}
				</h1>
				<p class="mb-5 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
					{$t('welcome.pitch')}
				</p>

				<!-- How it works diagram -->
				<div class="mb-4 rounded-2xl border border-[#DDD8CE] bg-[#EDE7D9] p-4">
					<p
						class="mb-3 text-center text-[10.5px] font-medium uppercase tracking-[0.15em] text-[#7A9E7E]"
					>
						{$t('welcome.how_it_works')}
					</p>
					<div class="relative mx-auto h-[148px] max-w-[260px]">
						<!-- Ana top -->
						<div class="absolute left-1/2 top-0 -translate-x-1/2 text-center">
							<div
								class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#2D4A32] font-serif text-base font-semibold text-white"
							>
								A
							</div>
							<div class="mt-1 text-xs font-medium text-[#1E2820]">Ana</div>
							<div class="text-[10.5px] text-[#6B7A6E]">massage</div>
						</div>
						<!-- Bruno bottom-left -->
						<div class="absolute bottom-0 left-0 text-center">
							<div
								class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#2D4A32] font-serif text-base font-semibold text-white"
							>
								B
							</div>
							<div class="mt-1 text-xs font-medium text-[#1E2820]">Bruno</div>
							<div class="text-[10.5px] text-[#6B7A6E]">vegetables</div>
						</div>
						<!-- Carla bottom-right -->
						<div class="absolute bottom-0 right-0 text-center">
							<div
								class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#2D4A32] font-serif text-base font-semibold text-white"
							>
								C
							</div>
							<div class="mt-1 text-xs font-medium text-[#1E2820]">Carla</div>
							<div class="text-[10.5px] text-[#6B7A6E]">bread</div>
						</div>
						<!-- Arrows SVG -->
						<svg
							class="absolute inset-0 h-full w-full overflow-visible"
							viewBox="0 0 260 148"
						>
							<defs>
								<marker
									id="arr"
									markerWidth="6"
									markerHeight="6"
									refX="5"
									refY="3"
									orient="auto"
								>
									<path d="M0,0 L6,3 L0,6 Z" fill="#7A9E7E" />
								</marker>
							</defs>
							<path
								d="M108,50 Q60,90 54,102"
								stroke="#7A9E7E"
								stroke-width="1.5"
								fill="none"
								stroke-dasharray="4,3"
								marker-end="url(#arr)"
							/>
							<text
								x="62"
								y="82"
								font-size="9.5"
								fill="#C4922A"
								font-family="DM Sans,sans-serif"
								font-weight="500"
								text-anchor="middle">credit</text
							>
							<path
								d="M76,126 Q130,140 184,126"
								stroke="#7A9E7E"
								stroke-width="1.5"
								fill="none"
								stroke-dasharray="4,3"
								marker-end="url(#arr)"
							/>
							<text
								x="130"
								y="148"
								font-size="9.5"
								fill="#C4922A"
								font-family="DM Sans,sans-serif"
								font-weight="500"
								text-anchor="middle">credit</text
							>
							<path
								d="M206,102 Q200,60 152,50"
								stroke="#7A9E7E"
								stroke-width="1.5"
								fill="none"
								stroke-dasharray="4,3"
								marker-end="url(#arr)"
							/>
							<text
								x="198"
								y="82"
								font-size="9.5"
								fill="#C4922A"
								font-family="DM Sans,sans-serif"
								font-weight="500"
								text-anchor="middle">credit</text
							>
						</svg>
					</div>
					<p class="mt-3 text-center text-[13px] font-medium text-[#2D4A32]">
						{$t('welcome.cycle_result')}
					</p>
				</div>

				<div class="flex-1"></div>
				<Button
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145]"
					onclick={() => goTo('consent')}
				>
					{$t('welcome.cta')}
					<IconArrowRight class="ml-2 h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					class="mt-2 w-full text-sm text-[#6B7A6E]"
					onclick={() => goTo('phone')}
				>
					{$t('welcome.returning')}
				</Button>
			</div>
		{/if}

		<!-- Step: Consent -->
		{#if currentStep === 'consent'}
			<div class="flex flex-1 flex-col">
				<p
					class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]"
				>
					{$t('consent.eyebrow')}
				</p>
				<h1 class="mb-4 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
					{@html $t('consent.title').replace(
						/agreeing to|a aceitar|akkoord gaat/,
						'<span class="text-[#2D4A32]">$&</span>'
					)}
				</h1>

				<ul class="mb-4 space-y-0">
					{#each [
						{ icon: '📒', title: $t('consent.item1_title'), body: $t('consent.item1_body') },
						{ icon: '🔒', title: $t('consent.item2_title'), body: $t('consent.item2_body') },
						{ icon: '👥', title: $t('consent.item3_title'), body: $t('consent.item3_body') },
						{ icon: '🌱', title: $t('consent.item4_title'), body: $t('consent.item4_body') }
					] as item}
						<li
							class="flex items-start gap-3 border-b border-[#DDD8CE] py-3 text-sm text-[#3A4A3D] last:border-b-0"
						>
							<span class="mt-0.5 flex-shrink-0 text-lg">{item.icon}</span>
							<div>
								<span class="block font-medium text-[#1E2820]">{item.title}</span>
								{item.body}
							</div>
						</li>
					{/each}
				</ul>

				<div class="flex-1"></div>
				<Button
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145]"
					onclick={() => goTo('phone')}
				>
					{$t('consent.cta')}
					<IconArrowRight class="ml-2 h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					class="mt-2 w-full text-sm text-[#6B7A6E]"
					onclick={() => goTo('welcome')}
				>
					<IconArrowLeft class="mr-1 h-3 w-3" />
					{$t('consent.back')}
				</Button>
			</div>
		{/if}

		<!-- Step: Phone -->
		{#if currentStep === 'phone'}
			<div class="flex flex-1 flex-col">
				<p
					class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]"
				>
					{$t('phone.eyebrow')}
				</p>
				<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
					{@html $t('phone.title').replace(
						/phone number|número de telefone|telefoonnummer/i,
						'<span class="text-[#2D4A32]">$&</span>'
					)}
				</h1>
				<p class="mb-4 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
					{$t('phone.body')}
				</p>

				<Label
					class="mb-2 block text-xs font-medium uppercase tracking-wider text-[#6B7A6E]"
				>
					{$t('phone.label')}
				</Label>
				<div
					class="mb-2 flex overflow-hidden rounded-xl border-[1.5px] border-[#DDD8CE] bg-white transition focus-within:border-[#2D4A32]"
				>
					<div
						class="flex items-center gap-1.5 border-r-[1.5px] border-[#DDD8CE] bg-[#EDE7D9] px-3 py-3.5 text-sm text-[#6B7A6E]"
					>
						<span>🇵🇹</span>
						<select
							bind:value={countryCode}
							class="border-none bg-transparent text-sm outline-none"
						>
							<option value="+351">+351</option>
							<option value="+31">+31</option>
							<option value="+44">+44</option>
							<option value="+1">+1</option>
						</select>
					</div>
					<input
						type="tel"
						inputmode="tel"
						placeholder="912 345 678"
						bind:value={phoneNumber}
						class="flex-1 border-none bg-transparent px-4 py-3.5 text-[17px] text-[#1E2820] outline-none placeholder:text-[#BDB8AE]"
					/>
				</div>
				<p class="mb-4 text-xs text-[#6B7A6E]">{$t('phone.hint')}</p>

				{#if authError}
					<p class="mb-3 text-sm text-red-600">{authError}</p>
				{/if}

				<div class="mb-3 flex items-center gap-3 text-xs text-[#6B7A6E]">
					<span class="h-px flex-1 bg-[#DDD8CE]"></span>
					{$t('phone.or')}
					<span class="h-px flex-1 bg-[#DDD8CE]"></span>
				</div>

				<Button
					variant="outline"
					class="mb-4 w-full rounded-xl border-[1.5px] border-[#DDD8CE] py-5 text-sm text-[#2D4A32]"
					onclick={() => goTo('email')}
				>
					{$t('phone.email_fallback')}
					<IconArrowRight class="ml-2 h-3 w-3" />
				</Button>

				<div class="flex-1"></div>
				<Button
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145] disabled:opacity-40"
					disabled={phoneNumber.replace(/\D/g, '').length < 9 || isLoading}
					onclick={sendPhoneOtp}
				>
					{$t('phone.cta')}
					<IconArrowRight class="ml-2 h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					class="mt-2 w-full text-sm text-[#6B7A6E]"
					onclick={() => goTo('consent')}
				>
					<IconArrowLeft class="mr-1 h-3 w-3" />
					{$t('phone.back')}
				</Button>
			</div>
		{/if}

		<!-- Step: Email fallback -->
		{#if currentStep === 'email'}
			<div class="flex flex-1 flex-col">
				<p
					class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]"
				>
					{$t('email.eyebrow')}
				</p>
				<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
					<span class="text-[#2D4A32]">{$t('email.title')}</span>
				</h1>
				<p class="mb-4 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
					{$t('email.body')}
				</p>

				<Label
					class="mb-2 block text-xs font-medium uppercase tracking-wider text-[#6B7A6E]"
				>
					{$t('email.label')}
				</Label>
				<div
					class="mb-2 overflow-hidden rounded-xl border-[1.5px] border-[#DDD8CE] bg-white transition focus-within:border-[#2D4A32]"
				>
					<input
						type="email"
						inputmode="email"
						placeholder="you@example.com"
						bind:value={emailAddress}
						class="w-full border-none bg-transparent px-4 py-3.5 text-[17px] text-[#1E2820] outline-none placeholder:text-[#BDB8AE]"
					/>
				</div>
				<p class="mb-4 text-xs text-[#6B7A6E]">{$t('email.hint')}</p>

				{#if authError}
					<p class="mb-3 text-sm text-red-600">{authError}</p>
				{/if}

				<div class="flex-1"></div>
				<Button
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145] disabled:opacity-40"
					disabled={!emailAddress.includes('@') || isLoading}
					onclick={sendEmailOtp}
				>
					{$t('email.cta')}
					<IconArrowRight class="ml-2 h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					class="mt-2 w-full text-sm text-[#6B7A6E]"
					onclick={() => goTo('phone')}
				>
					<IconArrowLeft class="mr-1 h-3 w-3" />
					{$t('email.back')}
				</Button>
			</div>
		{/if}

		<!-- Step: OTP -->
		{#if currentStep === 'otp'}
			<div class="flex flex-1 flex-col">
				<p
					class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]"
				>
					{$t('otp.eyebrow')}
				</p>
				<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
					{@html $t('otp.title').replace(
						/6-digit code|6 dígitos|6-cijferige code/i,
						'<span class="text-[#2D4A32]">$&</span>'
					)}
				</h1>

				<div class="mb-5 rounded-xl bg-[#EDE7D9] p-3.5 text-sm leading-relaxed text-[#3A4A3D]">
					{$t('otp.sent_to', { destination: otpDestination })}
				</div>

				<!-- OTP input -->
				<div class="relative mx-auto mb-2 flex justify-center gap-2.5">
					<input
						type="text"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength="6"
						pattern="[0-9]*"
						value={otpCode}
						oninput={handleOtpInput}
						class="absolute inset-0 z-10 w-full cursor-text bg-transparent text-[32px] tracking-[2.4em] caret-transparent opacity-0 outline-none"
					/>
					{#each Array(6) as _, i}
						<div
							class="flex h-[58px] w-[46px] items-center justify-center rounded-xl border-[1.5px] bg-white font-serif text-[26px] font-semibold text-[#1E2820] transition
							{otpCode[i] ? 'border-[#7A9E7E] bg-[#EDE7D9]' : i === otpCode.length ? 'border-[#2D4A32] shadow-[0_0_0_3px_rgba(45,74,50,0.12)]' : 'border-[#DDD8CE]'}"
						>
							{otpCode[i] ?? ''}
						</div>
					{/each}
				</div>

				<div class="mb-4 text-center text-sm text-[#6B7A6E]">
					{$t('otp.resend_prompt')}
					{#if countdown > 0}
						<span class="text-[#6B7A6E]">
							{$t('otp.resend')} ({$t('otp.countdown', { seconds: countdown })})
						</span>
					{:else}
						<button class="font-medium text-[#2D4A32] hover:underline" onclick={resendOtp}>
							{$t('otp.resend')}
						</button>
					{/if}
				</div>

				{#if authError}
					<p class="mb-3 text-center text-sm text-red-600">{authError}</p>
				{/if}

				<div class="flex-1"></div>
				<Button
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145] disabled:opacity-40"
					disabled={otpCode.length < 6 || isLoading}
					onclick={verifyOtp}
				>
					{$t('otp.cta')}
					<IconArrowRight class="ml-2 h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					class="mt-2 w-full text-sm text-[#6B7A6E]"
					onclick={() => goTo(otpMethod === 'phone' ? 'phone' : 'email')}
				>
					<IconArrowLeft class="mr-1 h-3 w-3" />
					{$t('otp.back')}
				</Button>
			</div>
		{/if}

		<!-- Step: Verified -->
		{#if currentStep === 'verified'}
			<div class="flex flex-1 flex-col items-center justify-center text-center">
				<div
					class="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#2D4A32] shadow-lg shadow-[#2D4A32]/25"
				>
					<IconCheck class="h-9 w-9 text-white" stroke={2.5} />
				</div>
				<h1 class="mb-2.5 font-serif text-[26px] font-semibold text-[#1E2820]">
					{$t('verified.title')} ✓
				</h1>
				<p class="mb-8 text-[15px] font-light text-[#3A4A3D]">
					{$t('verified.body')}
				</p>
				<Button
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145]"
					onclick={() => goTo('intro1')}
				>
					{$t('verified.cta')}
					<IconArrowRight class="ml-2 h-4 w-4" />
				</Button>
			</div>
		{/if}

		<!-- Step: Intro 1 -->
		{#if currentStep === 'intro1'}
			<div class="flex flex-1 flex-col">
				<button
					class="mb-1.5 self-end text-[13px] text-[#6B7A6E] hover:text-[#1E2820]"
					onclick={() => goTo('name')}
				>
					{$t('intro1.skip')} ↗
				</button>

				<!-- Progress bubbles -->
				<div class="mb-3 flex justify-center gap-1.5">
					<div class="h-2 w-6 rounded bg-[#2D4A32]"></div>
					<div class="h-2 w-2 rounded-full bg-[#DDD8CE]"></div>
					<div class="h-2 w-2 rounded-full bg-[#DDD8CE]"></div>
				</div>

				<div class="mb-5 flex justify-center">
					<div
						class="flex h-[150px] w-full max-w-[280px] items-center justify-center rounded-2xl border-[1.5px] border-dashed border-[#DDD8CE] bg-[#EDE7D9] text-[52px]"
					>
						🤝
					</div>
				</div>

				<p
					class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]"
				>
					{$t('intro1.eyebrow')}
				</p>
				<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
					{@html $t('intro1.title').replace(
						/trust|confiança|vertrouwen/i,
						'<span class="text-[#2D4A32]">$&</span>'
					)}
				</h1>
				<p class="mb-3.5 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
					{$t('intro1.body1')}
				</p>
				<p class="mb-4 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
					{$t('intro1.body2')}
				</p>

				<div class="flex-1"></div>
				<Button
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145]"
					onclick={() => goTo('intro2')}
				>
					{$t('intro1.cta')}
					<IconArrowRight class="ml-2 h-4 w-4" />
				</Button>
			</div>
		{/if}

		<!-- Step: Intro 2 -->
		{#if currentStep === 'intro2'}
			<div class="flex flex-1 flex-col">
				<button
					class="mb-1.5 self-end text-[13px] text-[#6B7A6E] hover:text-[#1E2820]"
					onclick={() => goTo('name')}
				>
					{$t('intro2.skip')} ↗
				</button>

				<div class="mb-3 flex justify-center gap-1.5">
					<div class="h-2 w-2 rounded-full bg-[#7A9E7E]"></div>
					<div class="h-2 w-6 rounded bg-[#2D4A32]"></div>
					<div class="h-2 w-2 rounded-full bg-[#DDD8CE]"></div>
				</div>

				<div class="mb-5 flex justify-center">
					<div
						class="flex h-[150px] w-full max-w-[280px] items-center justify-center rounded-2xl border-[1.5px] border-dashed border-[#DDD8CE] bg-[#EDE7D9] text-[52px]"
					>
						⚖️
					</div>
				</div>

				<p
					class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]"
				>
					{$t('intro2.eyebrow')}
				</p>
				<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
					{@html $t('intro2.title').replace(
						/normal|normaal/i,
						'<span class="text-[#2D4A32]">$&</span>'
					)}
				</h1>
				<p class="mb-3.5 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
					{$t('intro2.body1')}
				</p>
				<p class="mb-4 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
					{$t('intro2.body2')}
				</p>

				<div class="flex-1"></div>
				<Button
					class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145]"
					onclick={() => goTo('name')}
				>
					{$t('intro2.cta')}
					<IconArrowRight class="ml-2 h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					class="mt-2 w-full text-sm text-[#6B7A6E]"
					onclick={() => goTo('intro1')}
				>
					<IconArrowLeft class="mr-1 h-3 w-3" />
					{$t('intro2.back')}
				</Button>
			</div>
		{/if}

		<!-- Step: Name entry -->
		{#if currentStep === 'name'}
			<div class="flex flex-1 flex-col">
				<div class="mb-3 flex justify-center gap-1.5">
					<div class="h-2 w-2 rounded-full bg-[#7A9E7E]"></div>
					<div class="h-2 w-2 rounded-full bg-[#7A9E7E]"></div>
					<div class="h-2 w-6 rounded bg-[#2D4A32]"></div>
				</div>

				<div class="mb-5 flex justify-center">
					<div
						class="flex h-[110px] w-full max-w-[280px] items-center justify-center rounded-2xl border-[1.5px] border-dashed border-[#DDD8CE] bg-[#EDE7D9] text-[44px]"
					>
						🌿
					</div>
				</div>

				<p
					class="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[#7A9E7E]"
				>
					{$t('intro3.eyebrow')}
				</p>
				<h1 class="mb-3.5 font-serif text-[28px] font-semibold leading-tight text-[#1E2820]">
					{@html $t('intro3.title').replace(
						/call you|chamar|noemen/i,
						'<span class="text-[#2D4A32]">$&</span>'
					)}
				</h1>
				<p class="mb-4 text-[15px] font-light leading-relaxed text-[#3A4A3D]">
					{$t('intro3.body')}
				</p>

				<Label
					class="mb-2 block text-xs font-medium uppercase tracking-wider text-[#6B7A6E]"
				>
					{$t('intro3.label')}
				</Label>
				<form method="POST" action="?/createProfile" use:enhance>
					<div
						class="mb-1.5 overflow-hidden rounded-xl border-[1.5px] border-[#DDD8CE] bg-white transition focus-within:border-[#2D4A32]"
					>
						<input
							name="displayName"
							type="text"
							maxlength="40"
							placeholder={$t('intro3.placeholder')}
							bind:value={displayName}
							class="w-full border-none bg-transparent px-4 py-3.5 text-[17px] text-[#1E2820] outline-none placeholder:text-[#BDB8AE]"
						/>
					</div>
					<p class="mb-4 text-xs text-[#6B7A6E]">{$t('intro3.hint')}</p>

					<div class="flex-1"></div>
					<Button
						type="submit"
						class="w-full rounded-xl bg-[#2D4A32] py-6 text-base font-medium text-white hover:bg-[#3D6145] disabled:opacity-40"
						disabled={displayName.trim().length < 2}
					>
						{$t('intro3.cta')}
						<IconArrowRight class="ml-2 h-4 w-4" />
					</Button>
				</form>
				<Button
					variant="ghost"
					class="mt-2 w-full text-sm text-[#6B7A6E]"
					onclick={() => goTo('intro2')}
				>
					<IconArrowLeft class="mr-1 h-3 w-3" />
					{$t('intro3.back')}
				</Button>
			</div>
		{/if}
	</div>
</div>
