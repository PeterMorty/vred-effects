<?php

namespace VRED\Effects;

use Elementor\Controls_Manager;
use Elementor\Plugin as Elementor_Plugin;

if (! defined('ABSPATH')) {
	exit;
}

/** Elementor integration */
final class Elementor {
	private const SCRIPT_HANDLE = 'vred-effects-text-effects';
	private const STYLE_HANDLE = 'vred-effects-text-effects';

	public static function boot() : void {
		add_action('wp_enqueue_scripts', [self::class, 'register_assets'], 5);
		add_action('elementor/preview/enqueue_scripts', [self::class, 'enqueue_preview_assets']);
		add_action('elementor/element/heading/section_title/before_section_end', [self::class, 'mark_text_effect_support'], 5, 2);
		add_action('elementor/element/e-heading/section_title/before_section_end', [self::class, 'mark_text_effect_support'], 5, 2);
		add_action('elementor/element/common/section_effects/after_section_end', [self::class, 'register_text_effect_controls'], 20, 2);
		add_action('elementor/frontend/widget/before_render', [self::class, 'before_widget_render']);
	}

	/** Register text effect assets without enqueueing them globally */
	public static function register_assets() : void {
		wp_register_style(
			self::STYLE_HANDLE,
			VRED_EFFECTS_URL . 'assets/css/text-effects.css',
			[],
			VRED_EFFECTS_VERSION
		);

		wp_register_script(
			self::SCRIPT_HANDLE,
			VRED_EFFECTS_URL . 'assets/js/text-effects.js',
			['elementor-frontend'],
			VRED_EFFECTS_VERSION,
			true
		);
	}

	/** Keep assets available while editing so newly enabled effects preview immediately */
	public static function enqueue_preview_assets() : void {
		self::register_assets();
		wp_enqueue_style(self::STYLE_HANDLE);
		wp_enqueue_script(self::SCRIPT_HANDLE);
	}

	/** Mark supported heading widgets for the shared Advanced controls */
	public static function mark_text_effect_support($element, $args) : void {
		unset($args);

		$element->add_control(
			'vred_text_effect_supported',
			[
				'type' => Controls_Manager::HIDDEN,
				'default' => 'yes',
			]
		);
	}

	/** Register text effect controls after Elementor Motion Effects */
	public static function register_text_effect_controls($element, $args) : void {
		unset($args);

		$element->start_controls_section(
			'vred_text_effects_section',
			[
				'label' => __('VRED Effects', 'vred-effects'),
				'tab' => Controls_Manager::TAB_ADVANCED,
				'condition' => [
					'vred_text_effect_supported' => 'yes',
				],
			]
		);

		$asset_condition = [
			'terms' => [
				[
					'name' => 'vred_text_effect',
					'operator' => '!==',
					'value' => '',
				],
			],
		];

		$element->add_control(
			'vred_text_effect',
			[
				'label' => __('Effect', 'vred-effects'),
				'type' => Controls_Manager::SELECT,
				'default' => '',
				'options' => self::get_effect_options(),
				'render_type' => 'template',
				'frontend_available' => true,
				'assets' => [
					'scripts' => [
						[
							'name' => self::SCRIPT_HANDLE,
							'conditions' => $asset_condition,
						],
					],
					'styles' => [
						[
							'name' => self::STYLE_HANDLE,
							'conditions' => $asset_condition,
						],
					],
				],
			]
		);

		$element->add_responsive_control(
			'vred_text_enabled',
			[
				'label' => __('Animation', 'vred-effects'),
				'type' => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'default' => 'yes',
				'tablet_default' => 'yes',
				'mobile_default' => 'yes',
				'condition' => [
					'vred_text_effect!' => '',
				],
				'render_type' => 'template',
				'frontend_available' => true,
			]
		);

		$element->add_responsive_control(
			'vred_text_speed',
			[
				'label' => __('Speed', 'vred-effects'),
				'type' => Controls_Manager::NUMBER,
				'min' => 0.5,
				'max' => 2,
				'step' => 0.05,
				'default' => 1,
				'condition' => [
					'vred_text_effect!' => '',
				],
				'render_type' => 'template',
				'frontend_available' => true,
			]
		);

		$element->add_responsive_control(
			'vred_text_stagger',
			[
				'label' => __('Stagger (%)', 'vred-effects'),
				'type' => Controls_Manager::SLIDER,
				'size_units' => ['%'],
				'range' => [
					'%' => [
						'min' => 0,
						'max' => 200,
						'step' => 5,
					],
				],
				'default' => [
					'unit' => '%',
					'size' => 100,
				],
				'condition' => [
					'vred_text_effect!' => ['', 'scramble', 'editorial-drift'],
				],
				'render_type' => 'template',
				'frontend_available' => true,
			]
		);

		$element->add_control(
			'vred_text_delay',
			[
				'label' => __('Delay (ms)', 'vred-effects'),
				'type' => Controls_Manager::NUMBER,
				'min' => 0,
				'max' => 5000,
				'step' => 50,
				'default' => 0,
				'condition' => [
					'vred_text_effect!' => '',
				],
				'render_type' => 'template',
				'frontend_available' => true,
			]
		);

		$element->add_responsive_control(
			'vred_text_intensity',
			[
				'label' => __('Intensity (%)', 'vred-effects'),
				'type' => Controls_Manager::SLIDER,
				'size_units' => ['%'],
				'range' => [
					'%' => [
						'min' => 50,
						'max' => 150,
						'step' => 5,
					],
				],
				'default' => [
					'unit' => '%',
					'size' => 100,
				],
				'condition' => [
					'vred_text_effect!' => ['', 'scramble'],
				],
				'render_type' => 'template',
				'frontend_available' => true,
			]
		);

		$element->add_control(
			'vred_text_trigger',
			[
				'label' => __('Trigger position (%)', 'vred-effects'),
				'type' => Controls_Manager::SLIDER,
				'size_units' => ['%'],
				'range' => [
					'%' => [
						'min' => 50,
						'max' => 100,
						'step' => 1,
					],
				],
				'default' => [
					'unit' => '%',
					'size' => 90,
				],
				'condition' => [
					'vred_text_effect!' => '',
				],
				'render_type' => 'template',
				'frontend_available' => true,
			]
		);

		$element->add_control(
			'vred_text_play',
			[
				'label' => __('Playback', 'vred-effects'),
				'type' => Controls_Manager::SELECT,
				'default' => 'once',
				'options' => [
					'once' => __('Once', 'vred-effects'),
					'repeat' => __('Viewport', 'vred-effects'),
				],
				'condition' => [
					'vred_text_effect!' => '',
				],
				'render_type' => 'template',
				'frontend_available' => true,
			]
		);

		$element->end_controls_section();
	}

	/** Add runtime configuration to supported heading widgets */
	public static function before_widget_render($widget) : void {
		if (! method_exists($widget, 'get_name')) {
			return;
		}

		$name = $widget->get_name();

		if (! in_array($name, ['heading', 'e-heading'], true)) {
			return;
		}

		$settings = $widget->get_settings_for_display();
		$effect = isset($settings['vred_text_effect']) ? sanitize_key((string) $settings['vred_text_effect']) : '';
		$options = self::get_effect_options();

		if ($effect === '' || ! isset($options[$effect])) {
			return;
		}

		$responsive = [
			'enabled' => self::get_responsive_values($settings, 'vred_text_enabled', 'yes'),
			'speed' => self::get_responsive_values($settings, 'vred_text_speed', 1),
			'stagger' => self::get_responsive_slider_values($settings, 'vred_text_stagger', 100),
			'intensity' => self::get_responsive_slider_values($settings, 'vred_text_intensity', 100),
		];
		$delay = isset($settings['vred_text_delay']) ? max(0, (int) $settings['vred_text_delay']) : 0;
		$trigger = isset($settings['vred_text_trigger']['size']) ? (float) $settings['vred_text_trigger']['size'] : 90;
		$trigger = min(100, max(50, $trigger));
		$play = isset($settings['vred_text_play']) && $settings['vred_text_play'] === 'repeat' ? 'repeat' : 'once';

		$widget->add_render_attribute('_wrapper', 'data-vred-text-effect', $effect);
		$widget->add_render_attribute('_wrapper', 'data-vred-text-responsive', wp_json_encode($responsive));
		$widget->add_render_attribute('_wrapper', 'data-vred-text-delay', (string) $delay);
		$widget->add_render_attribute('_wrapper', 'data-vred-text-trigger', (string) $trigger);
		$widget->add_render_attribute('_wrapper', 'data-vred-text-play', $play);
	}

	private static function get_effect_options() : array {
		return [
			'' => __('None', 'vred-effects'),
			'words-cascade' => __('Words Cascade', 'vred-effects'),
			'words-alternate' => __('Alternating Words', 'vred-effects'),
			'chars-rise' => __('Characters Rise', 'vred-effects'),
			'chars-center' => __('Center Out', 'vred-effects'),
			'blur-words' => __('Blur Focus', 'vred-effects'),
			'blur-lines' => __('Blur Lines Drift', 'vred-effects'),
			'wave' => __('Character Wave', 'vred-effects'),
			'elastic' => __('Elastic Rise', 'vred-effects'),
			'scatter' => __('Soft Scatter', 'vred-effects'),
			'perspective-words' => __('Perspective Words', 'vred-effects'),
			'flip-chars' => __('Character Flip', 'vred-effects'),
			'skew-lines' => __('Skewed Lines', 'vred-effects'),
			'tracking-collapse' => __('Tracking Collapse', 'vred-effects'),
			'scramble' => __('Scramble Decode', 'vred-effects'),
			'chars-drop' => __('Character Drop', 'vred-effects'),
			'chars-pop-random' => __('Random Pop', 'vred-effects'),
			'words-depth' => __('Words From Depth', 'vred-effects'),
			'chars-arc' => __('Character Arc', 'vred-effects'),
			'chars-spiral' => __('Soft Spiral', 'vred-effects'),
			'words-reverse-wave' => __('Reverse Wave', 'vred-effects'),
			'chars-punch' => __('Focus Punch', 'vred-effects'),
			'chars-shiver' => __('Shiver Settle', 'vred-effects'),
			'editorial-drift' => __('Alternating Word Zoom', 'vred-effects'),
		];
	}

	private static function get_responsive_values(array $settings, string $key, $default) : array {
		$values = [
			'desktop' => array_key_exists($key, $settings) ? $settings[$key] : $default,
		];

		if (! class_exists(Elementor_Plugin::class) || ! isset(Elementor_Plugin::$instance->breakpoints)) {
			return $values;
		}

		$breakpoints = Elementor_Plugin::$instance->breakpoints->get_active_breakpoints();

		foreach (array_keys($breakpoints) as $device) {
			$device_key = $key . '_' . $device;

			if (array_key_exists($device_key, $settings)) {
				$values[$device] = $settings[$device_key];
			}
		}

		return $values;
	}

	private static function get_responsive_slider_values(array $settings, string $key, float $default) : array {
		$raw_values = self::get_responsive_values($settings, $key, ['size' => $default]);
		$values = [];

		foreach ($raw_values as $device => $value) {
			if (is_array($value) && isset($value['size']) && $value['size'] !== '') {
				$values[$device] = (float) $value['size'];
			} elseif (is_numeric($value)) {
				$values[$device] = (float) $value;
			}
		}

		if (! isset($values['desktop'])) {
			$values['desktop'] = $default;
		}

		return $values;
	}
}
