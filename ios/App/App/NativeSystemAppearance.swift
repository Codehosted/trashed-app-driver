import Foundation

/// Shared with executable bridge tests. Only the configured origin receives this
/// noncredential signal. The JS repeats the check to close navigation/eval races.
enum NativeSystemAppearance {
    static func script(origin: URL) -> String? {
        guard WorkspacePolicy.sameOrigin(origin, origin),
              var parts = URLComponents(url: origin, resolvingAgainstBaseURL: false) else { return nil }
        parts.path = ""; parts.query = nil; parts.fragment = nil
        guard let originString = parts.string,
              let data = try? JSONEncoder().encode(originString), let encoded = String(data: data, encoding: .utf8) else { return nil }
        return """
        (() => {
          if (window !== window.top || location.origin !== new URL(\(encoded)).origin) return;
          const media = window.matchMedia('(prefers-color-scheme: dark)');
          const publish = appearance => {
            window.__TRASHED_SYSTEM_APPEARANCE__ = appearance;
            window.dispatchEvent(new CustomEvent('trashed:system-appearance', {detail: {appearance}}));
          };
          publish(media.matches ? 'dark' : 'light');
          if (!window.__TRASHED_SYSTEM_APPEARANCE_LISTENER__) {
            window.__TRASHED_SYSTEM_APPEARANCE_LISTENER__ = true;
            media.addEventListener('change', event => publish(event.matches ? 'dark' : 'light'));
          }
        })();
        """
    }
}

#if canImport(UIKit)
import UIKit

/// Projected neutral design tokens adapt; arbitrary brand/status hues are preserved.
/// Do not infer semantic roles from RGB saturation: pale brand fills are not gray.
enum NativeAdaptivePalette {
    enum Role { case foreground, background, border }
    static let fill = UIColor(red: 112.0 / 255, green: 51.0 / 255, blue: 1, alpha: 1)
    static let accent = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 190.0 / 255, green: 159.0 / 255, blue: 1, alpha: 1)
            : fill
    }
    static let neutralTokens: Set<String> = [
        "#ffffff", "#000000", "#fafafa", "#f5f5f5", "#e5e5e5", "#d4d4d4", "#a3a3a3", "#737373", "#525252", "#404040", "#262626", "#171717", "#0a0a0a",
        "#f9fafb", "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280", "#4b5563", "#374151", "#1f2937", "#111827", "#030712",
        "#f4f4f5", "#e4e4e7", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46", "#27272a", "#18181b", "#09090b"
    ]
    static func rgb(_ hex: String?) -> (Double, Double, Double)? {
        guard let hex = hex, hex.count == 7, hex.hasPrefix("#"), let value = UInt32(hex.dropFirst(), radix: 16) else { return nil }
        return (Double((value >> 16) & 255) / 255, Double((value >> 8) & 255) / 255, Double(value & 255) / 255)
    }
    static func branded(_ hex: String?) -> Bool {
        guard let hex = hex, rgb(hex) != nil else { return false }
        return !neutralTokens.contains(hex.lowercased())
    }
    static func color(_ hex: String?, role: Role = .foreground, surface: String? = nil) -> UIColor? {
        // Contrast is based on the actual retained fill, never on a saturation guess.
        if role == .foreground, branded(surface), let (r, g, b) = rgb(surface) {
            func linear(_ value: Double) -> Double { value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4) }
            let luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
            return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? .black : .white
        }
        guard let (r, g, b) = rgb(hex) else { return nil }
        if role == .border { return .separator }
        if branded(hex) { return UIColor(red: r, green: g, blue: b, alpha: 1) }
        if role == .background { return .secondarySystemBackground }
        let muted: Set<String> = ["#a3a3a3", "#737373", "#525252", "#9ca3af", "#6b7280", "#4b5563", "#a1a1aa", "#71717a", "#52525b"]
        return muted.contains(hex!.lowercased()) ? .secondaryLabel : .label
    }
}
#endif
