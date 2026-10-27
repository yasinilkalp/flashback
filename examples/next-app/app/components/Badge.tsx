import { Component } from 'react';

export class Badge extends Component<{ label: string }> {
  render() {
    return <em data-testid="badge">{this.props.label}</em>;
  }
}
