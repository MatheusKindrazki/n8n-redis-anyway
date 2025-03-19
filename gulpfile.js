/**
 * @type {import('gulp')}
 */
const { src, dest } = require('gulp');

/**
 * Copy icons
 */
function buildIcons() {
	return src('nodes/**/*.svg').pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons; 