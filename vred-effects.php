<?php
/**
 * Plugin Name: VRED Effects
 * Plugin URI: https://viviendoenred.com
 * Description: Lightweight animation and interaction effects for Elementor widgets and containers.
 * Version: 1.0.0
 * Author: VRED
 * Author URI: https://viviendoenred.com
 * Text Domain: vred-effects
 * Domain Path: /languages
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * Requires Plugins: elementor
 * Update URI: https://dev.viviendoenred.com/wordpress/plugins/vred-effects/updates/
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

if (! defined('ABSPATH')) {
	exit;
}

define('VRED_EFFECTS_VERSION', '1.0.0');
define('VRED_EFFECTS_FILE', __FILE__);
define('VRED_EFFECTS_BASENAME', plugin_basename(__FILE__));
define('VRED_EFFECTS_PATH', plugin_dir_path(__FILE__));
define('VRED_EFFECTS_URL', plugin_dir_url(__FILE__));
define('VRED_EFFECTS_SLUG', 'vred-effects');
define('VRED_EFFECTS_UPDATE_URL', 'https://dev.viviendoenred.com/wordpress/plugins/vred-effects/updates/vred-effects.json');

require_once VRED_EFFECTS_PATH . 'includes/class-updater.php';
require_once VRED_EFFECTS_PATH . 'includes/class-elementor.php';
require_once VRED_EFFECTS_PATH . 'includes/class-plugin.php';

add_action('plugins_loaded', ['VRED\\Effects\\Plugin', 'boot']);
