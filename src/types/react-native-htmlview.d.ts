declare module 'react-native-htmlview' {
  import { Component } from 'react';
  import { ViewStyle, TextStyle } from 'react-native';

  interface HTMLViewProps {
    value: string;
    stylesheet?: Record<string, ViewStyle | TextStyle>;
    onLinkPress?: (url: string) => void;
    onLinkLongPress?: (url: string) => void;
    renderNode?: (
      node: any,
      index: number,
      siblings: any[],
      parent: any,
      defaultRenderer: (nodes: any[], parent: any) => any
    ) => any;
    bullet?: string;
    paragraphBreak?: string;
    lineBreak?: string;
    addLineBreaks?: boolean;
    NodeComponent?: any;
    nodeComponentProps?: any;
    RootComponent?: any;
    rootComponentProps?: any;
    TextComponent?: any;
    textComponentProps?: any;
  }

  export default class HTMLView extends Component<HTMLViewProps> {}
}

