define( function ( require, exports, module ) {
    "use strict";

    return exports = module.exports = function flatten( list, to_keep ) {
        var temp = [];
        list.forEach( function ( item ) {
            var parent = item.substring( 0, item.lastIndexOf( '/' ) );
            if ( temp.indexOf( parent ) === -1 ) {
                temp.push( parent );
            }
        } );
        list = list.concat( temp );

        list.forEach( function ( item, index ) {
            for ( var i = 0; i < to_keep.length; i += 1 ) {

                if ( item === null ) {
                    continue;
                }

                var checking = to_keep[ i ].substring( 0, item.length );

                if ( checking + '/' === item + '/' ) {
                    list[ index ] = null;
                    break;
                }
            };
        } );

        return list.filter( function ( item ) {
            return item !== null;
        } );
    };
} );
