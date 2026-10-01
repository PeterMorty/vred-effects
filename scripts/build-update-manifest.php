<?php
/**
 * Build the VRED Effects update manifest.
 *
 * @package VRED_Effects
 */

if ('cli' !== PHP_SAPI) {
	exit(1);
}

$root = dirname(__DIR__);
$plugin_file = $root . '/vred-effects.php';

if (! is_file($plugin_file)) {
	fwrite(STDERR, "Plugin file not found.\n");
	exit(1);
}

$source = file_get_contents($plugin_file);

if (! is_string($source) || $source === '') {
	fwrite(STDERR, "Unable to read plugin file.\n");
	exit(1);
}

if (! preg_match('/^ \\* Version:\\s*(.+)$/m', $source, $header_match)) {
	fwrite(STDERR, "Plugin header version not found.\n");
	exit(1);
}

if (! preg_match("/define\\('VRED_EFFECTS_VERSION', '([^']+)'\\);/", $source, $constant_match)) {
	fwrite(STDERR, "VRED_EFFECTS_VERSION constant not found.\n");
	exit(1);
}

$version = trim($header_match[1]);

if ($version !== trim($constant_match[1])) {
	fwrite(STDERR, "Plugin header version and constant version do not match.\n");
	exit(1);
}

$output_path = getenv('VRED_EFFECTS_MANIFEST_OUTPUT');
$base_url = rtrim((string) getenv('VRED_EFFECTS_UPDATES_BASE_URL'), '/');
$icons_base_url = rtrim((string) getenv('VRED_EFFECTS_ICONS_BASE_URL'), '/');
$homepage = (string) getenv('VRED_EFFECTS_PLUGIN_HOMEPAGE');
$requires = (string) getenv('VRED_EFFECTS_REQUIRES_WP');
$tested = (string) getenv('VRED_EFFECTS_TESTED_WP');
$requires_php = (string) getenv('VRED_EFFECTS_REQUIRES_PHP');
$changelog = trim((string) getenv('VRED_EFFECTS_CHANGELOG'));

if ($output_path === '' || $base_url === '') {
	fwrite(STDERR, "VRED_EFFECTS_MANIFEST_OUTPUT and VRED_EFFECTS_UPDATES_BASE_URL are required.\n");
	exit(1);
}

$icons_base_url = $icons_base_url !== '' ? $icons_base_url : 'https://dev.viviendoenred.com/wordpress/plugins/updates/icons';
$homepage = $homepage !== '' ? $homepage : 'https://viviendoenred.com';
$requires = $requires !== '' ? $requires : '6.5';
$tested = $tested !== '' ? $tested : '7.1.2';
$requires_php = $requires_php !== '' ? $requires_php : '7.4';

$manifest = [
	'name' => 'VRED Effects',
	'version' => $version,
	'download_url' => $base_url . '/vred-effects-v' . rawurlencode($version) . '.zip',
	'homepage' => $homepage,
	'requires' => $requires,
	'tested' => $tested,
	'requires_php' => $requires_php,
	'last_updated' => gmdate('Y-m-d H:i:s'),
	'icons' => [
		'1x' => $icons_base_url . '/icon-128x128.png',
		'2x' => $icons_base_url . '/icon-256x256.png',
	],
	'sections' => [
		'description' => 'Lightweight animation and interaction effects for Elementor widgets and containers.',
		'installation' => 'Upload and activate VRED Effects, then configure effects from supported Elementor widgets.',
		'changelog' => $changelog,
	],
];

$json = json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

if (! is_string($json)) {
	fwrite(STDERR, "Unable to encode manifest JSON.\n");
	exit(1);
}

$output_dir = dirname($output_path);

if (! is_dir($output_dir) && ! mkdir($output_dir, 0777, true) && ! is_dir($output_dir)) {
	fwrite(STDERR, "Unable to create output directory.\n");
	exit(1);
}

if (file_put_contents($output_path, $json . "\n") === false) {
	fwrite(STDERR, "Unable to write manifest file.\n");
	exit(1);
}

fwrite(STDOUT, 'Generated manifest for version ' . $version . "\n");
