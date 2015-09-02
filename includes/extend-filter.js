define( function ( require, exports, module ) {
    "use strict";
    return exports = module.exports = function extend_filter( list ) {
        var temp = [];

        list.forEach( function ( filter, i ) {
            var brace;
            var first = filter.substring( 0, 1 );

            switch ( first ) {
            case '/':
                brace = '**';
                break;
            case '!':
                brace = '!**/'
                filter = filter.substring( 1 );
                break;
            default:
                brace = '**/'
                break;
            }

            list[ i ] = brace + filter;
            temp.push( list[ i ] + '/**' );
        } );

        list = list.concat( temp ).sort( function ( a, b ) {
            return a.length - b.length;
        } );

        return list;
    };
} );
