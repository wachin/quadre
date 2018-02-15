import ReactDOM = require("thirdparty/react-dom");
import { /*Welcome */ element } from "settings/SettingsElement";

export class SettingsView {
    private file;
    private $el;

    constructor(file, $container) {
        this.file = file;

        console.log(element);

        this.$el = $("<div>").appendTo($container);
        ReactDOM.render(element, this.$el[0]);
    }

    /**
     * View Interface functions
     */

    /*
     * Retrieves the file object for this view
     * return {!File} the file object for this view
     */
    public getFile() {
        return this.file;
    }
}
