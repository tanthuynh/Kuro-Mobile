import 'react-native';

declare module 'react-native' {
  namespace StyleSheet {
    export const absoluteFillObject: {
      readonly position: 'absolute';
      readonly left: 0;
      readonly right: 0;
      readonly top: 0;
      readonly bottom: 0;
    };
  }
}
