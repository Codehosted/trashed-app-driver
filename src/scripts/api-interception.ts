/**
 * Creates JavaScript code to intercept API calls (fetch and XMLHttpRequest)
 * and send responses to React Native for storage updates
 */

interface ReactNativeWebView {
  postMessage: (message: string) => void;
}

declare global {
  interface Window {
    ReactNativeWebView?: ReactNativeWebView;
  }
}

/**
 * Send message to React Native
 */
function sendToNative(type: string, data: any) {
  const message = { type, ...data };
  if (window.ReactNativeWebView?.postMessage) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } catch (error) {
      console.error('[API Interception] Error posting message:', error);
    }
  }
}

/**
 * Check if URL is an API endpoint we care about
 */
function isApiEndpoint(url: string, apiBaseUrl: string): boolean {
  try {
    const urlObj = new URL(url, window.location.origin);
    const baseUrlObj = new URL(apiBaseUrl);
    
    // Check if it's the same origin or matches API base URL
    return urlObj.origin === baseUrlObj.origin && urlObj.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

/**
 * Extract response data (handles JSON, text, etc.)
 */
async function extractResponseData(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  } else if (contentType.includes('text/')) {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
  
  return null;
}

// These functions are only used in the injected script string below
// They're kept for reference but the actual implementation is inlined in createApiInterceptionScript

/**
 * Create the complete injection script
 */
export function createApiInterceptionScript(apiBaseUrl: string): string {
  // Inline all functions to avoid serialization issues
  const script = `
    (function() {
      console.log('[API Interception] Script loaded, setting up API interception for:', '${apiBaseUrl}');
      
      const apiBaseUrl = '${apiBaseUrl}';
      
      // Check if already initialized to avoid duplicate setup
      if (window.__API_INTERCEPTION_INITIALIZED__) {
        console.log('[API Interception] Already initialized, skipping');
        return true;
      }
      window.__API_INTERCEPTION_INITIALIZED__ = true;
      
      // Send message to React Native
      function sendToNative(type, data) {
        const message = { type, ...data };
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify(message));
          } catch (error) {
            console.error('[API Interception] Error posting message:', error);
          }
        } else {
          console.warn('[API Interception] ReactNativeWebView not available');
        }
      }
      
      // Check if URL is an API endpoint we care about
      function isApiEndpoint(url) {
        try {
          const urlObj = new URL(url, window.location.origin);
          const baseUrlObj = new URL(apiBaseUrl);
          return urlObj.origin === baseUrlObj.origin && urlObj.pathname.startsWith('/api/');
        } catch {
          return false;
        }
      }
      
      // Extract response data
      async function extractResponseData(response) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            return await response.json();
          } catch {
            return null;
          }
        } else if (contentType.includes('text/')) {
          try {
            return await response.text();
          } catch {
            return null;
          }
        }
        return null;
      }
      
      // Initialize when DOM is ready
      const initialize = () => {
        console.log('[API Interception] Initializing API interception...');
        
        // Intercept fetch API calls
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
          const [input, init] = args;
          let url = '';
          if (typeof input === 'string') {
            url = input;
          } else if (input instanceof URL) {
            url = input.toString();
          } else if (input && typeof input === 'object' && 'url' in input) {
            url = input.url;
          }
          const response = await originalFetch.apply(this, args);
          
          if (isApiEndpoint(url)) {
            const clonedResponse = response.clone();
            const responseData = await extractResponseData(clonedResponse);
            sendToNative('apiResponse', {
              endpoint: url,
              method: init?.method || 'GET',
              status: response.status,
              statusText: response.statusText,
              response: responseData,
              headers: Object.fromEntries(response.headers.entries()),
            });
          }
          
          return response;
        };
        
        // Intercept XMLHttpRequest
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          this._method = method;
          this._url = typeof url === 'string' ? url : url.toString();
          return originalOpen.apply(this, [method, url, ...rest]);
        };
        
        XMLHttpRequest.prototype.send = function(...args) {
          const xhr = this;
          const url = xhr._url;
          const method = xhr._method || 'GET';
          
          xhr.addEventListener('loadend', function() {
            if (isApiEndpoint(url)) {
              let responseData = null;
              try {
                const contentType = xhr.getResponseHeader('content-type') || '';
                if (contentType.includes('application/json')) {
                  responseData = JSON.parse(xhr.responseText);
                } else {
                  responseData = xhr.responseText;
                }
              } catch (error) {
                console.error('[API Interception] Error parsing XHR response:', error);
              }
              sendToNative('apiResponse', {
                endpoint: url,
                method: method,
                status: xhr.status,
                statusText: xhr.statusText,
                response: responseData,
              });
            }
          });
          
          return originalSend.apply(this, args);
        };
        
        // Monitor navigation changes
        let lastUrl = location.href;
        function checkUrl() {
          const currentUrl = location.href;
          if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            sendToNative('navigationChange', { url: currentUrl });
          }
        }
        
        window.addEventListener('popstate', checkUrl);
        setInterval(checkUrl, 500);
        
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(state, unused, url) {
          originalPushState.call(this, state, unused, url);
          setTimeout(checkUrl, 0);
        };
        
        history.replaceState = function(state, unused, url) {
          originalReplaceState.call(this, state, unused, url);
          setTimeout(checkUrl, 0);
        };
        
        console.log('[API Interception] API interception set up successfully');
      };
      
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
      } else {
        // DOM already ready, but wait a bit for SPAs to initialize
        setTimeout(initialize, 100);
      }
    })();
    true; // Required for iOS
  `;
  
  return script;
}

