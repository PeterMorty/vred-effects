<?php

namespace VRED\Effects;

if (! defined('ABSPATH')) {
	exit;
}

/** Main plugin bootstrap */
final class Plugin {
	public static function boot() : void {
		load_plugin_textdomain(
			'vred-effects',
			false,
			dirname(VRED_EFFECTS_BASENAME) . '/languages'
		);

		Updater::boot();

		if (did_action('elementor/loaded')) {
			Elementor::boot();
			return;
		}

		add_action('elementor/loaded', [Elementor::class, 'boot']);
	}
}
