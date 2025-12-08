// TypeScript definitions for the native bridge interface
interface NativeBridgeMessage {
  action: string;
  data?: Record<string, unknown>;
}

interface ReactNativeWebView {
  postMessage: (message: string) => void;
}

declare global {
  interface Window {
    ReactNativeWebView?: ReactNativeWebView;
    testNativeBridge?: () => void;
  }
}

/**
 * Creates the JavaScript code to inject into WebView
 * This enables communication between the WebView and React Native
 * 
 * @returns The JavaScript code as a string
 */
function createInjectedScript(): string {
  // Helper function to send message to React Native
  const sendToNative = `
    function sendToNative(action, data) {
      const message = { action, data: data || {} };
      console.log('[Native Bridge] Sending message:', message);
      
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        } catch (error) {
          console.error('[Native Bridge] Error posting message:', error);
        }
      } else {
        console.warn('[Native Bridge] ReactNativeWebView not available');
      }
    }
  `;

  // Click handler that intercepts clicks on elements with data-native-action
  const clickHandler = `
    function clickHandler(event) {
      const target = event.target;
      
      // Find the closest element with data-native-action attribute
      const actionElement = target.closest('[data-native-action]');
      
      if (!actionElement) {
        return; // Not a target element, let the event propagate normally
      }
      
      const action = actionElement.getAttribute('data-native-action');
      
      if (!action) {
        console.warn('[Native Bridge] Element has data-native-action but no value');
        return;
      }
      
      console.log('[Native Bridge] Intercepted click on element with action:', action, actionElement);
      
      // Prevent default behavior and stop propagation
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      
      // Send message to React Native
      sendToNative(action, {
        elementId: actionElement.id || null,
        elementClass: actionElement.className || null,
        timestamp: Date.now()
      });
      
      return false;
    }
  `;

  // Setup function to initialize event listeners
  const setupInterceptors = `
    function setupInterceptors() {
      console.log('[Native Bridge] Setting up click interceptors');
      
      // Remove existing listeners to avoid duplicates
      document.removeEventListener('click', clickHandler, true);
      
      // Add new click handler with capture phase to intercept early
      document.addEventListener('click', clickHandler, true);
      
      console.log('[Native Bridge] Click interceptors set up successfully');
    }
  `;

  // URL change detection for SPAs
  const urlChangeObserver = `
    let lastUrl = location.href;
    const observer = new MutationObserver(function() {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('[Native Bridge] URL changed, re-setting up interceptors');
        setTimeout(setupInterceptors, 500);
      }
    });
    
    // Observe DOM changes that might indicate navigation
    if (document.body) {
      observer.observe(document.body, { 
        subtree: true, 
        childList: true 
      });
    } else if (document.documentElement) {
      observer.observe(document.documentElement, { 
        subtree: true, 
        childList: true 
      });
    }
  `;

  // Test function for debugging
  const testFunction = `
    window.testNativeBridge = function() {
      console.log('[Native Bridge] Test function called');
      sendToNative('openPhotoPicker', { test: true });
    };
  `;

  // Main initialization code
  const initialization = `
    (function() {
      console.log('[Native Bridge] JavaScript injected successfully');
      
      ${sendToNative}
      ${clickHandler}
      ${setupInterceptors}
      
      // Run setup when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupInterceptors);
      } else {
        setupInterceptors();
      }
      
      ${urlChangeObserver}
      ${testFunction}
      
      console.log('[Native Bridge] Setup complete. Use window.testNativeBridge() to test.');
    })();
  `;

  // Return the complete script with a true statement for iOS compatibility
  return `${initialization}\ntrue; // Required for iOS`;
}

/**
 * The injected JavaScript code as a string
 * This is what gets injected into the WebView
 */
export const injectedJavaScript: string = createInjectedScript();

/**
 * Export the function for testing/debugging purposes
 */
export { createInjectedScript };
