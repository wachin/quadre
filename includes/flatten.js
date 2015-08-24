define(function (require, exports, module) {
    "use strict";
    return exports = module.exports = function flatten(list) {
        list.forEach(function (item, index) {
            for (var i = 0; i < list.length; i += 1) {

                var checking = list[i] !== null ? list[i].substring(0, item.length) : '';

                if (checking === item && index !== i) {
                    list[index] = null;
                    break;
                }
            };
        });

        return list.filter(function (item) {
            return item !== null;
        });
    };
});