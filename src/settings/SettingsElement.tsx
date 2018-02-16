import React = require("thirdparty/react");

// class Welcome extends React.Component<{}, void> {
//     constructor() {
//         super();
//     }
//     public render() {
//         return (
//             <h1 style={{color: "orange"}}>Welcome</h1>
//         );
//     }
// }

const Welcome = React.createClass({
    render() {
        // , {this.props.name}
        return <h1 style={{color: "orange"}}>Welcome</h1>;
    }
});

export const element = <Welcome></Welcome>;
