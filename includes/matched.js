define( function ( require, exports, module ) {
	"use strict";
	return exports = module.exports = function matched( file, filter ) {
		var multimatch = require( 'includes/multimatch' );
		var match = multimatch( file, filter );

		if ( match.length ) {
			return match;
		}
	};
} );
