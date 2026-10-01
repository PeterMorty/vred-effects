<?php

namespace VRED\Effects;

if (! defined('ABSPATH')) {
	exit;
}

/** Self-hosted VRED updater */
final class Updater {
	private const CACHE_KEY = 'vred_effects_remote_plugin_info';

	public static function boot() : void {
		add_filter('update_plugins_dev.viviendoenred.com', [self::class, 'filter_plugin_update'], 10, 4);
		add_filter('pre_set_site_transient_update_plugins', [self::class, 'filter_update_transient']);
		add_filter('site_transient_update_plugins', [self::class, 'filter_update_transient']);
		add_filter('plugins_api', [self::class, 'filter_plugin_info'], 20, 3);
		add_filter('plugin_action_links_' . VRED_EFFECTS_BASENAME, [self::class, 'filter_plugin_action_links']);
		add_action('upgrader_process_complete', [self::class, 'after_plugin_update'], 10, 2);
		add_action('admin_init', [self::class, 'maybe_refresh_updates']);
	}

	/** Add a manual update check to the Plugins screen. */
	public static function filter_plugin_action_links(array $links) : array {
		if (! current_user_can('update_plugins')) {
			return $links;
		}

		$url = wp_nonce_url(
			add_query_arg('vred-effects-refresh-updates', '1', self_admin_url('plugins.php')),
			'vred-effects-refresh-updates'
		);

		$links[] = '<a href="' . esc_url($url) . '">' . esc_html__('Check updates', 'vred-effects') . '</a>';

		return $links;
	}

	/** Clear updater caches and return to the native Plugins screen. */
	public static function maybe_refresh_updates() : void {
		if (empty($_GET['vred-effects-refresh-updates'])) {
			return;
		}

		if (! current_user_can('update_plugins')) {
			return;
		}

		check_admin_referer('vred-effects-refresh-updates');

		delete_site_transient(self::CACHE_KEY);
		delete_site_transient('update_plugins');

		wp_safe_redirect(self_admin_url('plugins.php'));
		exit;
	}

	public static function filter_plugin_update($update, array $plugin_data, string $plugin_file, array $locales) {
		unset($locales);

		if ($plugin_file !== VRED_EFFECTS_BASENAME) {
			return $update;
		}

		return self::get_update_payload($plugin_data);
	}

	public static function filter_update_transient($transient) {
		if (! is_object($transient) || empty($transient->checked) || ! is_array($transient->checked)) {
			return $transient;
		}

		if (! isset($transient->checked[VRED_EFFECTS_BASENAME])) {
			return $transient;
		}

		if (! function_exists('get_plugin_data')) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		$plugin_data = get_plugin_data(VRED_EFFECTS_FILE, false, false);
		$payload = self::get_update_payload($plugin_data);

		if (! empty($payload)) {
			if (! isset($transient->response) || ! is_array($transient->response)) {
				$transient->response = [];
			}

			$transient->response[VRED_EFFECTS_BASENAME] = (object) $payload;
		} else {
			if (isset($transient->response[VRED_EFFECTS_BASENAME])) {
				unset($transient->response[VRED_EFFECTS_BASENAME]);
			}

			if (! isset($transient->no_update) || ! is_array($transient->no_update)) {
				$transient->no_update = [];
			}

			$transient->no_update[VRED_EFFECTS_BASENAME] = (object) [
				'id' => VRED_EFFECTS_UPDATE_URL,
				'slug' => VRED_EFFECTS_SLUG,
				'plugin' => VRED_EFFECTS_BASENAME,
				'new_version' => VRED_EFFECTS_VERSION,
				'url' => 'https://viviendoenred.com',
				'package' => '',
				'icons' => [],
				'banners' => [],
				'banners_rtl' => [],
				'tested' => '',
				'requires_php' => '7.4',
				'compatibility' => new \stdClass(),
			];
		}

		return $transient;
	}

	public static function filter_plugin_info($result, string $action, $args) {
		if ($action !== 'plugin_information' || empty($args->slug) || $args->slug !== VRED_EFFECTS_SLUG) {
			return $result;
		}

		$plugin_info = self::get_remote_plugin_info();

		if (empty($plugin_info['version'])) {
			return $result;
		}

		$sections = ! empty($plugin_info['sections']) && is_array($plugin_info['sections']) ? $plugin_info['sections'] : [];

		return (object) [
			'name' => ! empty($plugin_info['name']) ? $plugin_info['name'] : 'VRED Effects',
			'slug' => VRED_EFFECTS_SLUG,
			'version' => $plugin_info['version'],
			'author' => '<a href="https://viviendoenred.com">VRED</a>',
			'homepage' => ! empty($plugin_info['homepage']) ? $plugin_info['homepage'] : 'https://viviendoenred.com',
			'requires' => ! empty($plugin_info['requires']) ? $plugin_info['requires'] : '6.5',
			'tested' => ! empty($plugin_info['tested']) ? $plugin_info['tested'] : '',
			'requires_php' => ! empty($plugin_info['requires_php']) ? $plugin_info['requires_php'] : '7.4',
			'last_updated' => ! empty($plugin_info['last_updated']) ? $plugin_info['last_updated'] : '',
			'download_link' => ! empty($plugin_info['download_url']) ? $plugin_info['download_url'] : '',
			'sections' => [
				'description' => $sections['description'] ?? '',
				'installation' => $sections['installation'] ?? '',
				'changelog' => $sections['changelog'] ?? '',
			],
			'banners' => ! empty($plugin_info['banners']) && is_array($plugin_info['banners']) ? $plugin_info['banners'] : [],
			'icons' => self::get_plugin_icons($plugin_info),
		];
	}

	public static function after_plugin_update($upgrader_object, array $options) : void {
		unset($upgrader_object);

		if (empty($options['action']) || $options['action'] !== 'update' || empty($options['type']) || $options['type'] !== 'plugin') {
			return;
		}

		delete_site_transient(self::CACHE_KEY);
		delete_site_transient('update_plugins');
	}

	private static function get_update_payload(array $plugin_data) : array {
		$plugin_info = self::get_remote_plugin_info();
		$installed_version = ! empty($plugin_data['Version']) ? (string) $plugin_data['Version'] : VRED_EFFECTS_VERSION;

		if (empty($plugin_info['version']) || version_compare($installed_version, $plugin_info['version'], '>=')) {
			return [];
		}

		$package_url = ! empty($plugin_info['download_url']) ? (string) $plugin_info['download_url'] : '';

		if ($package_url === '') {
			return [];
		}

		return [
			'id' => ! empty($plugin_data['UpdateURI']) ? $plugin_data['UpdateURI'] : VRED_EFFECTS_UPDATE_URL,
			'slug' => VRED_EFFECTS_SLUG,
			'plugin' => VRED_EFFECTS_BASENAME,
			'new_version' => $plugin_info['version'],
			'url' => ! empty($plugin_info['homepage']) ? $plugin_info['homepage'] : 'https://viviendoenred.com',
			'package' => $package_url,
			'tested' => ! empty($plugin_info['tested']) ? $plugin_info['tested'] : '',
			'requires' => ! empty($plugin_info['requires']) ? $plugin_info['requires'] : '',
			'requires_php' => ! empty($plugin_info['requires_php']) ? $plugin_info['requires_php'] : '',
			'autoupdate' => false,
			'icons' => self::get_plugin_icons($plugin_info),
			'banners' => ! empty($plugin_info['banners']) && is_array($plugin_info['banners']) ? $plugin_info['banners'] : [],
			'banners_rtl' => ! empty($plugin_info['banners_rtl']) && is_array($plugin_info['banners_rtl']) ? $plugin_info['banners_rtl'] : [],
			'translations' => [],
			'compatibility' => new \stdClass(),
		];
	}

	private static function get_remote_plugin_info() : array {
		static $plugin_info = null;

		if ($plugin_info !== null) {
			return $plugin_info;
		}

		$cached = get_site_transient(self::CACHE_KEY);

		if (is_array($cached)) {
			$cached = self::sanitize_remote_plugin_info($cached);
		}

		if (! empty($cached['version']) && ! empty($cached['download_url'])) {
			$plugin_info = $cached;
			return $plugin_info;
		}

		$update_url = self::validate_remote_url(VRED_EFFECTS_UPDATE_URL);

		if ($update_url === '') {
			$plugin_info = [];
			return $plugin_info;
		}

		$response = wp_remote_get(
			$update_url,
			[
				'timeout' => 10,
				'redirection' => 0,
				'headers' => [
					'Accept' => 'application/json',
					'Cache-Control' => 'no-cache',
				],
			]
		);

		if (is_wp_error($response)) {
			$plugin_info = [];
			set_site_transient(self::CACHE_KEY, [], 5 * MINUTE_IN_SECONDS);
			return $plugin_info;
		}

		$code = (int) wp_remote_retrieve_response_code($response);
		$data = json_decode(wp_remote_retrieve_body($response), true);

		if ($code !== 200 || ! is_array($data)) {
			$plugin_info = [];
			set_site_transient(self::CACHE_KEY, [], 5 * MINUTE_IN_SECONDS);
			return $plugin_info;
		}

		$plugin_info = self::sanitize_remote_plugin_info($data);

		if (empty($plugin_info['version']) || empty($plugin_info['download_url'])) {
			$plugin_info = [];
			set_site_transient(self::CACHE_KEY, [], 5 * MINUTE_IN_SECONDS);
			return $plugin_info;
		}

		set_site_transient(self::CACHE_KEY, $plugin_info, HOUR_IN_SECONDS);
		return $plugin_info;
	}

	private static function sanitize_remote_plugin_info(array $data) : array {
		$version = ! empty($data['version']) ? sanitize_text_field((string) $data['version']) : '';

		if ($version === '' || strlen($version) > 64 || ! preg_match('/^[0-9]+(?:\.[0-9]+)*(?:[-+][0-9A-Za-z.-]+)?$/', $version)) {
			return [];
		}

		$sections = ! empty($data['sections']) && is_array($data['sections']) ? $data['sections'] : [];
		$package_url = ! empty($data['download_url']) ? (string) $data['download_url'] : (! empty($data['package']) ? (string) $data['package'] : '');

		return [
			'name' => ! empty($data['name']) ? sanitize_text_field((string) $data['name']) : '',
			'version' => $version,
			'homepage' => ! empty($data['homepage']) ? self::validate_remote_url((string) $data['homepage']) : '',
			'requires' => ! empty($data['requires']) ? sanitize_text_field((string) $data['requires']) : '',
			'tested' => ! empty($data['tested']) ? sanitize_text_field((string) $data['tested']) : '',
			'requires_php' => ! empty($data['requires_php']) ? sanitize_text_field((string) $data['requires_php']) : '',
			'last_updated' => ! empty($data['last_updated']) ? sanitize_text_field((string) $data['last_updated']) : '',
			'sections' => [
				'description' => ! empty($sections['description']) ? wp_kses_post((string) $sections['description']) : '',
				'installation' => ! empty($sections['installation']) ? wp_kses_post((string) $sections['installation']) : '',
				'changelog' => ! empty($sections['changelog']) ? wp_kses_post((string) $sections['changelog']) : '',
			],
			'icons' => self::sanitize_remote_assets($data['icons'] ?? [], ['1x', '2x', 'svg', 'default']),
			'banners' => self::sanitize_remote_assets($data['banners'] ?? [], ['low', 'high']),
			'banners_rtl' => self::sanitize_remote_assets($data['banners_rtl'] ?? [], ['low', 'high']),
			'download_url' => self::validate_remote_url($package_url),
		];
	}

	private static function sanitize_remote_assets($assets, array $allowed_keys) : array {
		if (! is_array($assets)) {
			return [];
		}

		$sanitized = [];

		foreach ($allowed_keys as $key) {
			if (empty($assets[$key])) {
				continue;
			}

			$url = self::validate_remote_url((string) $assets[$key]);

			if ($url !== '') {
				$sanitized[$key] = $url;
			}
		}

		return $sanitized;
	}

	private static function get_plugin_icons(array $plugin_info = []) : array {
		return ! empty($plugin_info['icons']) && is_array($plugin_info['icons']) ? $plugin_info['icons'] : [];
	}

	private static function validate_remote_url(string $url) : string {
		$url = trim($url);

		if ($url === '' || ! wp_http_validate_url($url)) {
			return '';
		}

		$parts = wp_parse_url($url);

		if (
			! is_array($parts)
			|| empty($parts['scheme'])
			|| strtolower((string) $parts['scheme']) !== 'https'
			|| empty($parts['host'])
			|| isset($parts['user'])
			|| isset($parts['pass'])
			|| (isset($parts['port']) && (int) $parts['port'] !== 443)
		) {
			return '';
		}

		$host = strtolower(rtrim((string) $parts['host'], '.'));
		$allowed_hosts = apply_filters('vred_effects_allowed_remote_hosts', [
			'dev.viviendoenred.com',
			'viviendoenred.com',
			'www.viviendoenred.com',
		]);

		if (! is_array($allowed_hosts)) {
			return '';
		}

		$allowed_hosts = array_values(array_unique(array_filter(array_map(static function ($allowed_host) : string {
			$allowed_host = strtolower(rtrim(trim((string) $allowed_host), '.'));

			return preg_match('/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/', $allowed_host) ? $allowed_host : '';
		}, $allowed_hosts))));

		return in_array($host, $allowed_hosts, true) ? esc_url_raw($url, ['https']) : '';
	}
}
