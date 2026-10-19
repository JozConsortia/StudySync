import { forwardRef } from 'react';
import { KeyboardAwareScrollView as LibraryScrollView } from 'react-native-keyboard-controller';

/**
 * A ScrollView that keeps whichever text box you are typing in above the keyboard: when the keyboard
 * opens, when you tap another box, and while a multi-line box grows as you type.
 * Uses react-native-keyboard-controller (included in Expo Go), which follows the keyboard frame by frame
 * and works with Android's edge-to-edge layout, where the keyboard covers the app instead of resizing it.
 * Needs <KeyboardProvider> at the root of the app (see App.js).
 */
const KeyboardAwareScrollView = forwardRef(function KeyboardAwareScrollView({ bottomOffset = 32, ...props }, ref) {
  return (
    <LibraryScrollView
      ref={ref}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      {...props}
    />
  );
});

export default KeyboardAwareScrollView;
