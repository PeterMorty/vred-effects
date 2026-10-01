/**
 * VRED Text Effects
 * Native text animation engine for VRED Effects.
 * No external dependencies.
 */
(function () {
	'use strict'

	const ROOT_SELECTOR = '[data-vred-text-effect]'
	const TARGET_SELECTOR = '.elementor-heading-title'
	const THRESHOLD = .03
	const TOP_MARGIN = 7
	const EASE = {
		out2: 'cubic-bezier(.25,.46,.45,.94)',
		out3: 'cubic-bezier(.215,.61,.355,1)',
		out4: 'cubic-bezier(.165,.84,.44,1)',
		back: 'cubic-bezier(.34,1.56,.64,1)',
		backStrong: 'cubic-bezier(.2,1.65,.35,1)',
		linear: 'linear'
	}
	const SCRAMBLE_CHARS = '01<>[]{}#@/\\*+=!?'
	const originals = new WeakMap()
	const states = new WeakMap()
	const targets = new WeakMap()
	const tracked = new Set()
	const observers = new Map()
	let resizeTimer = null
	let elementorBound = false

	function parseNumber(value, fallback) {
		const parsed = Number.parseFloat(value)
		return Number.isFinite(parsed) ? parsed : fallback
	}

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value))
	}

	function currentDeviceMode() {
		if (window.elementorFrontend && typeof window.elementorFrontend.getCurrentDeviceMode === 'function') {
			return window.elementorFrontend.getCurrentDeviceMode() || 'desktop'
		}

		return 'desktop'
	}

	function fallbackDevice(device) {
		if (device.indexOf('mobile') !== -1) return 'mobile'
		if (device.indexOf('tablet') !== -1) return 'tablet'
		return 'desktop'
	}

	function responsiveValue(values, fallback, allowEmpty) {
		if (!values || typeof values !== 'object') return fallback

		const device = currentDeviceMode()
		const candidates = [device, fallbackDevice(device), 'desktop']

		for (const candidate of candidates) {
			if (!Object.prototype.hasOwnProperty.call(values, candidate)) continue
			const value = values[candidate]
			if (allowEmpty || value !== '') return value
		}

		return fallback
	}

	function runtimeConfig(root) {
		let responsive = {}

		try {
			responsive = JSON.parse(root.dataset.vredTextResponsive || '{}')
		} catch (error) {
			responsive = {}
		}

		const enabled = responsiveValue(responsive.enabled, 'yes', true) === 'yes'
		const speed = clamp(parseNumber(responsiveValue(responsive.speed, 1, false), 1), .5, 2)
		const stagger = clamp(parseNumber(responsiveValue(responsive.stagger, 100, false), 100), 0, 200) / 100
		const intensity = clamp(parseNumber(responsiveValue(responsive.intensity, 100, false), 100), 50, 150) / 100

		return {
			enabled,
			speed,
			stagger,
			intensity,
			delay: Math.max(0, parseNumber(root.dataset.vredTextDelay, 0)),
			trigger: clamp(parseNumber(root.dataset.vredTextTrigger, 90), 50, 100),
			once: root.dataset.vredTextPlay !== 'repeat'
		}
	}

	function editorSliderValue(value, fallback) {
		if (value && typeof value === 'object' && value.size !== undefined && value.size !== '') {
			return value.size
		}

		return value !== undefined && value !== null && value !== '' ? value : fallback
	}

	function clearEditorConfig(root) {
		root.removeAttribute('data-vred-text-effect')
		root.removeAttribute('data-vred-text-responsive')
		root.removeAttribute('data-vred-text-delay')
		root.removeAttribute('data-vred-text-trigger')
		root.removeAttribute('data-vred-text-play')
	}

	function applyEditorConfig(handler, root) {
		const effect = handler.getElementSettings('vred_text_effect') || ''

		if (!EFFECTS[effect]) {
			destroy(root)
			clearEditorConfig(root)
			return false
		}

		const device = currentDeviceMode()
		const enabled = handler.getCurrentDeviceSetting('vred_text_enabled') === 'yes' ? 'yes' : ''
		const speed = parseNumber(handler.getCurrentDeviceSetting('vred_text_speed'), 1)
		const stagger = editorSliderValue(handler.getCurrentDeviceSetting('vred_text_stagger'), 100)
		const intensity = editorSliderValue(handler.getCurrentDeviceSetting('vred_text_intensity'), 100)
		const delay = Math.max(0, parseNumber(handler.getElementSettings('vred_text_delay'), 0))
		const trigger = clamp(editorSliderValue(handler.getElementSettings('vred_text_trigger'), 90), 50, 100)
		const playMode = handler.getElementSettings('vred_text_play') === 'repeat' ? 'repeat' : 'once'
		const responsive = {
			enabled: { desktop: enabled, [device]: enabled },
			speed: { desktop: speed, [device]: speed },
			stagger: { desktop: stagger, [device]: stagger },
			intensity: { desktop: intensity, [device]: intensity }
		}

		root.dataset.vredTextEffect = effect
		root.dataset.vredTextResponsive = JSON.stringify(responsive)
		root.dataset.vredTextDelay = String(delay)
		root.dataset.vredTextTrigger = String(trigger)
		root.dataset.vredTextPlay = playMode
		return true
	}

	function scaled(value, intensity) {
		return value * intensity
	}

	function scaledAroundOne(value, intensity) {
		return 1 + (value - 1) * intensity
	}

	function duration(runtime, fallback) {
		return fallback / runtime.speed
	}

	function stagger(runtime, fallback) {
		return fallback * runtime.stagger / runtime.speed
	}

	function original(target) {
		let data = originals.get(target)

		if (!data) {
			data = {
				html: target.innerHTML,
				text: target.textContent.trim(),
				ariaLabel: target.getAttribute('aria-label')
			}
			originals.set(target, data)
		}

		return data
	}

	function restoreOriginal(target) {
		const data = originals.get(target)
		if (!data) return

		target.innerHTML = data.html
		target.style.perspective = ''
		target.style.transformStyle = ''

		if (data.ariaLabel === null) target.removeAttribute('aria-label')
		else target.setAttribute('aria-label', data.ariaLabel)
	}

	function targetFor(root) {
		const heading = root.matches?.(TARGET_SELECTOR) ? root : root.querySelector(TARGET_SELECTOR)
		if (!heading) return null

		return heading.querySelector('a') || heading
	}

	function tokens(text) {
		return text.match(/\S+|\s+/g) || []
	}

	function clearElement(target) {
		target.textContent = ''
	}

	function makeSpan(className, text) {
		const span = document.createElement('span')
		span.className = className
		span.textContent = text
		span.setAttribute('aria-hidden', 'true')
		return span
	}

	function prepareTextTarget(target) {
		const data = original(target)
		restoreOriginal(target)
		target.setAttribute('aria-label', data.text)
		return data.text
	}

	function splitWords(target) {
		const text = prepareTextTarget(target)
		clearElement(target)
		const words = []

		tokens(text).forEach(token => {
			if (/^\s+$/.test(token)) {
				target.appendChild(document.createTextNode(token))
				return
			}

			const word = makeSpan('vred-word', token)
			words.push(word)
			target.appendChild(word)
		})

		return words
	}

	function splitChars(target, masked) {
		const text = prepareTextTarget(target)
		clearElement(target)
		const chars = []

		tokens(text).forEach(token => {
			if (/^\s+$/.test(token)) {
				target.appendChild(document.createTextNode(token))
				return
			}

			const word = document.createElement('span')
			word.className = 'vred-word'
			word.setAttribute('aria-hidden', 'true')

			Array.from(token).forEach(character => {
				const char = makeSpan('vred-char', character)
				chars.push(char)

				if (masked) {
					const mask = document.createElement('span')
					mask.className = 'vred-char-mask'
					mask.setAttribute('aria-hidden', 'true')
					mask.appendChild(char)
					word.appendChild(mask)
				} else {
					word.appendChild(char)
				}
			})

			target.appendChild(word)
		})

		return chars
	}

	function splitLines(target, masked) {
		const text = prepareTextTarget(target)
		clearElement(target)
		const measureWords = []

		tokens(text).forEach(token => {
			if (/^\s+$/.test(token)) {
				target.appendChild(document.createTextNode(token))
				return
			}

			const word = makeSpan('vred-word', token)
			measureWords.push(word)
			target.appendChild(word)
		})

		const groups = []

		measureWords.forEach(word => {
			const top = Math.round(word.offsetTop)
			let group = groups[groups.length - 1]

			if (!group || Math.abs(group.top - top) > 1) {
				group = { top, words: [] }
				groups.push(group)
			}

			group.words.push(word.textContent)
		})

		clearElement(target)
		const lines = []

		groups.forEach(group => {
			const wrap = document.createElement('span')
			wrap.className = masked ? 'vred-line-mask' : 'vred-line-wrap'
			wrap.setAttribute('aria-hidden', 'true')

			const line = makeSpan('vred-line', group.words.join(' '))
			wrap.appendChild(line)
			target.appendChild(wrap)
			lines.push(line)
		})

		return lines
	}

	function random(min, max) {
		return Math.random() * (max - min) + min
	}

	function shuffledRanks(length) {
		const values = Array.from({ length }, (_, index) => index)

		for (let index = values.length - 1; index > 0; index--) {
			const swap = Math.floor(Math.random() * (index + 1))
			;[values[index], values[swap]] = [values[swap], values[index]]
		}

		const ranks = Array(length)
		values.forEach((originalIndex, rank) => { ranks[originalIndex] = rank })
		return ranks
	}

	function centerRank(index, length) {
		return Math.abs(index - (length - 1) / 2)
	}

	function setFrame(node, frame) {
		if (frame.opacity !== undefined) node.style.opacity = frame.opacity
		if (frame.transform !== undefined) node.style.transform = frame.transform
		if (frame.filter !== undefined) node.style.filter = frame.filter
		if (frame.transformOrigin !== undefined) node.style.transformOrigin = frame.transformOrigin
	}

	function clearNodeStyles(node) {
		node.style.opacity = ''
		node.style.transform = ''
		node.style.filter = ''
		node.style.transformOrigin = ''
		node.style.willChange = ''
	}

	function finalFrame() {
		return { opacity: 1, transform: 'none', filter: 'none' }
	}

	function makeItemEffect(target, splitType, preset, runtime) {
		const items = splitType === 'words'
			? splitWords(target)
			: splitType === 'lines'
				? splitLines(target, Boolean(preset.maskLines))
				: splitChars(target, Boolean(preset.maskChars))
		const count = items.length
		const randomRanks = preset.order === 'random' ? shuffledRanks(count) : null
		const starts = items.map((item, index) => preset.start(index, count, runtime))
		const keyframes = items.map((item, index) => preset.keyframes
			? preset.keyframes(index, count, starts[index], runtime)
			: [starts[index], finalFrame()])

		items.forEach((item, index) => {
			setFrame(item, starts[index])
			item.style.willChange = 'transform, opacity, filter'
		})

		return {
			play() {
				return items.map((item, index) => {
					let rank = index
					if (preset.order === 'reverse') rank = count - 1 - index
					if (preset.order === 'center') rank = centerRank(index, count)
					if (preset.order === 'random') rank = randomRanks[index]

					const animation = item.animate(keyframes[index], {
						duration: duration(runtime, preset.duration),
						delay: runtime.delay + rank * stagger(runtime, preset.stagger || 0),
						easing: preset.easing || EASE.out3,
						fill: 'both'
					})

					animation.finished.then(() => {
						setFrame(item, keyframes[index][keyframes[index].length - 1])
						item.style.willChange = ''
						animation.cancel()
					}).catch(() => {})

					return animation
				})
			},
			reset() {
				items.forEach((item, index) => setFrame(item, starts[index]))
			},
			finish() {
				items.forEach((item, index) => {
					setFrame(item, keyframes[index][keyframes[index].length - 1])
					item.style.willChange = ''
				})
			},
			destroy() {
				items.forEach(clearNodeStyles)
			}
		}
	}

	function makeScramble(target, runtime) {
		const text = prepareTextTarget(target)
		let frameId = null
		target.textContent = text
		target.style.opacity = '0'

		return {
			play() {
				const total = duration(runtime, 1450)
				const startAt = performance.now() + runtime.delay
				target.style.opacity = '1'

				const tick = now => {
					if (now < startAt) {
						frameId = requestAnimationFrame(tick)
						return
					}

					const progress = Math.min(1, (now - startAt) / total)
					const reveal = Math.floor(text.length * progress)
					let output = ''

					for (let index = 0; index < text.length; index++) {
						const character = text[index]

						if (index < reveal || character === ' ' || /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]/.test(character)) {
							output += character
						} else {
							output += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
						}
					}

					target.textContent = output
					if (progress < 1) frameId = requestAnimationFrame(tick)
					else target.textContent = text
				}

				frameId = requestAnimationFrame(tick)
				return []
			},
			reset() {
				if (frameId) cancelAnimationFrame(frameId)
				frameId = null
				target.textContent = text
				target.style.opacity = '0'
			},
			finish() {
				if (frameId) cancelAnimationFrame(frameId)
				frameId = null
				target.textContent = text
				target.style.opacity = '1'
			},
			destroy() {
				if (frameId) cancelAnimationFrame(frameId)
				target.style.opacity = ''
			}
		}
	}

	const EFFECTS = {
		'words-cascade': (target, runtime) => makeItemEffect(target, 'words', {
			duration: 720,
			stagger: 55,
			easing: EASE.out3,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(0,${scaled(38, config.intensity)}px,0)`, filter: 'none' })
		}, runtime),

		'words-alternate': (target, runtime) => makeItemEffect(target, 'words', {
			duration: 780,
			stagger: 50,
			easing: EASE.out3,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(0,${scaled(index % 2 ? 46 : -46, config.intensity)}px,0)`, filter: 'none' })
		}, runtime),

		'chars-rise': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 720,
			maskChars: true,
			stagger: 18,
			easing: EASE.out4,
			start: (index, count, config) => ({ opacity: 1, transform: `translate3d(0,${scaled(135, config.intensity)}%,0) rotate(${scaled(8, config.intensity)}deg)`, filter: 'none', transformOrigin: '50% 100%' })
		}, runtime),

		'chars-center': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 580,
			stagger: 18,
			order: 'center',
			easing: EASE.back,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(0,${scaled(18, config.intensity)}px,0) scale(${scaledAroundOne(.35, config.intensity)})`, filter: 'none' })
		}, runtime),

		'blur-words': (target, runtime) => makeItemEffect(target, 'words', {
			duration: 900,
			stagger: 55,
			easing: EASE.out3,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(0,${scaled(15, config.intensity)}px,0) scale(${scaledAroundOne(.94, config.intensity)})`, filter: `blur(${scaled(14, config.intensity)}px)` })
		}, runtime),

		'blur-lines': (target, runtime) => makeItemEffect(target, 'lines', {
			duration: 1000,
			stagger: 120,
			easing: EASE.out3,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(${scaled(-34, config.intensity)}px,0,0)`, filter: `blur(${scaled(18, config.intensity)}px)` })
		}, runtime),

		'wave': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 860,
			stagger: 18,
			easing: EASE.back,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(0,${scaled(Math.sin(index * .75) * 54, config.intensity)}px,0) rotate(${scaled(Math.sin(index * .62) * 10, config.intensity)}deg)`, filter: 'none' })
		}, runtime),

		'elastic': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 1050,
			stagger: 15,
			easing: EASE.linear,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(0,${scaled(68, config.intensity)}px,0) scaleY(${scaledAroundOne(.55, config.intensity)})`, filter: 'none', transformOrigin: '50% 100%' }),
			keyframes: (index, count, start, config) => [
				{ ...start, offset: 0 },
				{ opacity: 1, transform: `translate3d(0,${scaled(-9, config.intensity)}px,0) scaleY(${scaledAroundOne(1.08, config.intensity)})`, filter: 'none', offset: .58 },
				{ opacity: 1, transform: `translate3d(0,${scaled(4, config.intensity)}px,0) scaleY(${scaledAroundOne(.97, config.intensity)})`, filter: 'none', offset: .76 },
				{ opacity: 1, transform: `translate3d(0,${scaled(-2, config.intensity)}px,0) scaleY(${scaledAroundOne(1.015, config.intensity)})`, filter: 'none', offset: .9 },
				{ ...finalFrame(), offset: 1 }
			]
		}, runtime),

		'scatter': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 900,
			stagger: 12,
			order: 'random',
			easing: EASE.out3,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(${random(scaled(-38, config.intensity), scaled(38, config.intensity))}px,${random(scaled(-34, config.intensity), scaled(34, config.intensity))}px,0) rotate(${random(scaled(-15, config.intensity), scaled(15, config.intensity))}deg)`, filter: 'none' })
		}, runtime),

		'perspective-words': (target, runtime) => {
			target.style.perspective = '900px'
			return makeItemEffect(target, 'words', {
				duration: 820,
				stagger: 75,
				easing: EASE.out4,
				start: (index, count, config) => ({ opacity: 0, transform: `translate3d(0,${scaled(24, config.intensity)}px,0) rotateX(${scaled(-82, config.intensity)}deg)`, filter: 'none', transformOrigin: '50% 100%' })
			}, runtime)
		},

		'flip-chars': (target, runtime) => {
			target.style.perspective = '800px'
			return makeItemEffect(target, 'chars', {
				duration: 640,
				stagger: 22,
				easing: EASE.out3,
				start: (index, count, config) => ({ opacity: 0, transform: `translate3d(${scaled(8, config.intensity)}px,0,0) rotateY(${scaled(92, config.intensity)}deg)`, filter: 'none', transformOrigin: '50% 50%' })
			}, runtime)
		},

		'skew-lines': (target, runtime) => makeItemEffect(target, 'lines', {
			duration: 900,
			stagger: 110,
			maskLines: true,
			easing: EASE.out4,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(${scaled(-72, config.intensity)}px,0,0) skewX(${scaled(-13, config.intensity)}deg)`, filter: 'none' })
		}, runtime),

		'tracking-collapse': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 820,
			stagger: 12,
			order: 'center',
			easing: EASE.out3,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(${scaled((index - (count - 1) / 2) * 10, config.intensity)}px,0,0)`, filter: 'none' })
		}, runtime),

		'scramble': (target, runtime) => makeScramble(target, runtime),

		'chars-drop': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 780,
			stagger: 18,
			easing: EASE.linear,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(0,${scaled(-82, config.intensity)}px,0) rotate(${scaled(index % 2 ? 8 : -8, config.intensity)}deg)`, filter: 'none' }),
			keyframes: (index, count, start, config) => [
				{ ...start, offset: 0 },
				{ opacity: 1, transform: `translate3d(0,${scaled(9, config.intensity)}px,0) rotate(0deg)`, filter: 'none', offset: .68 },
				{ opacity: 1, transform: `translate3d(0,${scaled(-4, config.intensity)}px,0) rotate(0deg)`, filter: 'none', offset: .82 },
				{ opacity: 1, transform: `translate3d(0,${scaled(2, config.intensity)}px,0) rotate(0deg)`, filter: 'none', offset: .92 },
				{ ...finalFrame(), offset: 1 }
			]
		}, runtime),

		'chars-pop-random': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 460,
			stagger: 16,
			order: 'random',
			easing: EASE.backStrong,
			start: (index, count, config) => ({ opacity: 0, transform: `scale(${scaledAroundOne(0, config.intensity)}) rotate(${random(scaled(-25, config.intensity), scaled(25, config.intensity))}deg)`, filter: 'none' })
		}, runtime),

		'words-depth': (target, runtime) => {
			target.style.perspective = '1100px'
			target.style.transformStyle = 'preserve-3d'
			return makeItemEffect(target, 'words', {
				duration: 950,
				stagger: 65,
				easing: EASE.out4,
				start: (index, count, config) => ({ opacity: 0, transform: `translateZ(${scaled(-420, config.intensity)}px) rotateX(${scaled(18, config.intensity)}deg) scale(${scaledAroundOne(.72, config.intensity)})`, filter: 'none' })
			}, runtime)
		},

		'chars-arc': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 820,
			stagger: 14,
			order: 'center',
			easing: EASE.out3,
			start: (index, count, config) => {
				const middle = (count - 1) / 2 || 1
				const y = -18 - 52 * (1 - Math.min(1, Math.abs(index - middle) / middle))
				return { opacity: 0, transform: `translate3d(0,${scaled(y, config.intensity)}px,0) rotate(${scaled((index - middle) * 1.25, config.intensity)}deg)`, filter: 'none' }
			}
		}, runtime),

		'chars-spiral': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 820,
			stagger: 14,
			easing: EASE.out3,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(${scaled(Math.cos(index * .72) * 42, config.intensity)}px,${scaled(Math.sin(index * .72) * 42, config.intensity)}px,0) rotate(${scaled(index % 2 ? 95 : -95, config.intensity)}deg) scale(${scaledAroundOne(.55, config.intensity)})`, filter: 'none' })
		}, runtime),

		'words-reverse-wave': (target, runtime) => makeItemEffect(target, 'words', {
			duration: 720,
			stagger: 60,
			order: 'reverse',
			easing: EASE.out3,
			start: (index, count, config) => ({ opacity: 0, transform: `translate3d(0,${scaled(index % 2 ? 44 : -44, config.intensity)}px,0)`, filter: 'none' })
		}, runtime),

		'chars-punch': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 680,
			stagger: 18,
			easing: EASE.out4,
			start: (index, count, config) => ({ opacity: 0, transform: `scale(${scaledAroundOne(2.1, config.intensity)})`, filter: `blur(${scaled(10, config.intensity)}px)` })
		}, runtime),

		'chars-shiver': (target, runtime) => makeItemEffect(target, 'chars', {
			duration: 520,
			stagger: 12,
			order: 'random',
			easing: EASE.linear,
			start: (index, count, config) => ({ opacity: .18, transform: `translate3d(${random(scaled(-12, config.intensity), scaled(12, config.intensity))}px,${random(scaled(-8, config.intensity), scaled(8, config.intensity))}px,0)`, filter: `blur(${scaled(4, config.intensity)}px)` }),
			keyframes: (index, count, start, config) => [
				{ ...start, offset: 0 },
				{ opacity: .45, transform: `translate3d(${random(scaled(-8, config.intensity), scaled(8, config.intensity))}px,${random(scaled(-6, config.intensity), scaled(6, config.intensity))}px,0)`, filter: `blur(${scaled(3, config.intensity)}px)`, offset: .22 },
				{ opacity: .68, transform: `translate3d(${random(scaled(-5, config.intensity), scaled(5, config.intensity))}px,${random(scaled(-4, config.intensity), scaled(4, config.intensity))}px,0)`, filter: `blur(${scaled(2, config.intensity)}px)`, offset: .46 },
				{ opacity: .86, transform: `translate3d(${random(scaled(-2, config.intensity), scaled(2, config.intensity))}px,${random(scaled(-2, config.intensity), scaled(2, config.intensity))}px,0)`, filter: `blur(${scaled(1, config.intensity)}px)`, offset: .72 },
				{ ...finalFrame(), offset: 1 }
			]
		}, runtime),

		'editorial-drift': (target, runtime) => makeItemEffect(target, 'words', {
			duration: 1050,
			stagger: 0,
			easing: EASE.out3,
			start: (index, count, config) => ({ opacity: .06, transform: `scale(${scaledAroundOne(index % 2 === 0 ? .28 : 2.25, config.intensity)})`, filter: `blur(${scaled(1.5, config.intensity)}px)`, transformOrigin: '50% 50%' })
		}, runtime)
	}

	function observerKey(trigger) {
		return String(Math.round(trigger * 10) / 10)
	}

	function observerFor(trigger) {
		const key = observerKey(trigger)

		if (observers.has(key)) return observers.get(key)

		const bottomMargin = Math.max(0, 100 - trigger)
		const observer = new IntersectionObserver(entries => {
			entries.forEach(entry => {
				if (!entry.isIntersecting) return

				const target = entry.target
				const state = states.get(target)
				if (!state) return

				play(target)
				if (state.runtime.once) observer.unobserve(target)
			})
		}, {
			threshold: THRESHOLD,
			rootMargin: `-${TOP_MARGIN}% 0px -${bottomMargin}% 0px`
		})

		observers.set(key, observer)
		return observer
	}

	function unobserve(target, state) {
		if (!state) return
		const observer = observers.get(state.observerKey)
		if (observer) observer.unobserve(target)
	}

	function destroyTarget(target) {
		const state = states.get(target)

		if (state) {
			unobserve(target, state)
			state.animations.forEach(animation => animation.cancel())
			state.effect?.destroy?.()
			states.delete(target)
		}

		restoreOriginal(target)
	}

	function prepareRoot(root) {
		if (!root || !EFFECTS[root.dataset.vredTextEffect]) return null

		const oldTarget = targets.get(root)
		if (oldTarget) destroyTarget(oldTarget)

		const target = targetFor(root)
		if (!target) return null

		targets.set(root, target)
		const runtime = runtimeConfig(root)

		if (!runtime.enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			restoreOriginal(target)
			return null
		}

		const effect = EFFECTS[root.dataset.vredTextEffect](target, runtime)
		const state = {
			root,
			runtime,
			effect,
			animations: [],
			played: false,
			observerKey: observerKey(runtime.trigger)
		}

		states.set(target, state)
		observerFor(runtime.trigger).observe(target)
		return state
	}

	function play(target) {
		const state = states.get(target)
		if (!state || state.played && state.runtime.once) return

		state.animations.forEach(animation => animation.cancel())
		state.animations = state.effect?.play?.() || []
		state.played = true
	}

	function refreshRoot(root, preservePlayed) {
		const oldTarget = targets.get(root)
		const wasPlayed = preservePlayed && oldTarget ? Boolean(states.get(oldTarget)?.played) : false
		const state = prepareRoot(root)

		if (state && wasPlayed) {
			state.effect?.finish?.()
			state.played = true
			if (state.runtime.once) unobserve(targets.get(root), state)
		}
	}

	function init(scope) {
		const context = scope || document
		const roots = Array.from(context.querySelectorAll?.(ROOT_SELECTOR) || [])
		if (context.matches?.(ROOT_SELECTOR)) roots.unshift(context)

		roots.forEach(root => {
			tracked.add(root)
			refreshRoot(root, false)
		})

		return roots
	}

	function refresh(scope) {
		const context = scope || document
		const roots = Array.from(context.querySelectorAll?.(ROOT_SELECTOR) || [])
		if (context.matches?.(ROOT_SELECTOR)) roots.unshift(context)

		roots.forEach(root => {
			tracked.add(root)
			refreshRoot(root, true)
		})
	}

	function destroy(root) {
		if (!root) return
		const target = targets.get(root)
		if (target) destroyTarget(target)
		targets.delete(root)
		tracked.delete(root)
	}

	function destroyAll() {
		tracked.forEach(root => destroy(root))
		observers.forEach(observer => observer.disconnect())
		observers.clear()
	}

	function preview(root) {
		if (!root) return

		tracked.add(root)
		const state = prepareRoot(root)
		if (!state) return

		const target = targets.get(root)
		unobserve(target, state)
		play(target)
	}

	function bindElementor() {
		if (elementorBound || !window.elementorFrontend?.hooks || !window.elementorModules?.frontend?.handlers?.Base) return
		elementorBound = true

		const TextEffectHandler = window.elementorModules.frontend.handlers.Base.extend({
			onInit() {
				window.elementorModules.frontend.handlers.Base.prototype.onInit.apply(this, arguments)

				const root = this.$element?.[0]
				if (!root) return

				const editMode = typeof window.elementorFrontend.isEditMode === 'function' && window.elementorFrontend.isEditMode()

				if (editMode) {
					if (!this.isEdit) {
						this.isEdit = true
						this.addEditorListeners()
					}

					this.previewEffect()
					return
				}

				init(root)
			},

			onElementChange(propertyName) {
				if (typeof propertyName === 'string' && propertyName.indexOf('vred_text_') === 0) {
					this.previewEffect()
				}
			},

			onDestroy() {
				const root = this.$element?.[0]
				if (root) destroy(root)
				window.elementorModules.frontend.handlers.Base.prototype.onDestroy.apply(this, arguments)
			},

			previewEffect() {
				const root = this.$element?.[0]
				if (!root) return

				requestAnimationFrame(() => {
					if (!document.contains(root)) return
					if (!applyEditorConfig(this, root)) return
					preview(root)
				})
			}
		})

		const ready = scope => {
			window.elementorFrontend.elementsHandler.addHandler(TextEffectHandler, { $element: scope })
		}

		window.elementorFrontend.hooks.addAction('frontend/element_ready/heading.default', ready)
		window.elementorFrontend.hooks.addAction('frontend/element_ready/e-heading.default', ready)
	}

	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer)
		resizeTimer = setTimeout(() => {
			tracked.forEach(root => {
				if (!document.contains(root)) {
					destroy(root)
					return
				}

				refreshRoot(root, true)
			})
		}, 180)
	}, { passive: true })

	window.VREDTextEffects = {
		init,
		refresh,
		preview,
		destroy,
		destroyAll,
		effects: Object.keys(EFFECTS),
		version: '0.1.5'
	}

	window.addEventListener('elementor/frontend/init', bindElementor, { once: true })
	bindElementor()

	function boot() {
		init(document)

		if (document.fonts?.ready) {
			document.fonts.ready.then(() => refresh(document)).catch(() => {})
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot)
	} else {
		boot()
	}
})()
