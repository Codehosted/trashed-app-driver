import SwiftUI

/// Tracks ordered controller echoes without replacing a newer local keystroke.
struct NativeDraftBuffer {
    private(set) var value: String
    private var remote: String
    private var pending: [String] = []
    init(value: String) { self.value = value; remote = value }
    mutating func edit(_ value: String) {
        self.value = value; pending.append(value)
        if pending.count > 64 { pending.removeFirst(pending.count - 64) }
    }
    mutating func receive(_ value: String) {
        if let index = pending.firstIndex(of: value) {
            pending.removeFirst(index + 1); remote = value
            if pending.isEmpty { self.value = value }
        } else if remote != value {
            pending.removeAll(); self.value = value; remote = value
        }
    }
}

final class NativeChatPresentation: ObservableObject {
    @Published var state: NativeChatState
    init(_ state: NativeChatState) { self.state = state }
}
struct NativeChatRootView: View {
    @ObservedObject var presentation: NativeChatPresentation
    let configured: URL
    let onAction: (NativeChatState, String, String?) -> Void
    let onDraft: (NativeChatState, String) -> Void
    var body: some View {
        let state = presentation.state
        NativeChatView(state: state, configured: configured,
                       onAction: { onAction(state, $0, $1) }, onDraft: { onDraft(state, $0) })
            .id(state.identity)
    }
}
struct NativeChatView: View {
    let state: NativeChatState
    let configured: URL
    let onAction: (String, String?) -> Void
    let onDraft: (String) -> Void
    @State private var followingLatest = true
    @Environment(\.colorScheme) private var colorScheme
    private var measured: Bool { state.messages.contains { $0.presentation == "measured" } || (state.screen?.nodes.contains { $0.box != nil } ?? false) }
    private var measuredBackground: Color {
        let source = state.screen?.toolbar.first?.style?.background ?? state.screen?.composer.first?.style?.background
        if state.appearance == (colorScheme == .dark ? "dark" : "light"), let (r, g, b) = NativeAdaptivePalette.rgb(source) {
            return Color(red: r, green: g, blue: b)
        }
        return NativeChatPalette.color(source, role: .background) ?? Color(.systemBackground)
    }
    private func boxed(_ nodes: [NativeComponentNode]) -> Bool { nodes.allSatisfy { $0.box != nil } }
    var body: some View {
        VStack(spacing: 0) {
            if let screen = state.screen { region(screen.toolbar).padding(.horizontal, boxed(screen.toolbar) ? 0 : 16).padding(.vertical, boxed(screen.toolbar) ? 0 : 8) }
            else {
                NativeChatHeader(state: state, onAction: onAction)
                if !state.conversations.isEmpty { NativeChatConversations(state: state, onAction: onAction) }
            }
            if !measured { Divider() }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: measured ? 0 : 12) {
                        if state.messages.isEmpty && state.screen == nil { NativeChatSuggestions(state: state, onAction: onAction) }
                        ForEach(state.messages) { message in
                            if message.presentation == "measured" { region(message.components ?? []).accessibilityIdentifier("trashed-native-chat-message-" + message.id) }
                            else { NativeChatBubble(message: message, state: state, configured: configured, onAction: onAction) }
                        }
                        if let screen = state.screen { region(screen.accessory) }
                        if let status = state.status, !measured {
                            HStack {
                                if status.kind == "loading" { ProgressView() }
                                Text(status.text).font(.footnote).foregroundColor(status.kind == "error" ? .red : .secondary)
                            }.frame(maxWidth: .infinity).accessibilityIdentifier("trashed-native-chat-status")
                        }
                        Color.clear.frame(height: 1).id("chat-bottom")
                            .onAppear { followingLatest = true }.onDisappear { followingLatest = false }
                    }.padding(measured ? 0 : 16)
                }
                .accessibilityIdentifier("trashed-native-chat-messages")
                .onAppear { proxy.scrollTo("chat-bottom", anchor: .bottom) }
                .onChange(of: state.messages.last?.text) { _ in if followingLatest { proxy.scrollTo("chat-bottom", anchor: .bottom) } }
                .onChange(of: state.messages.count) { _ in if followingLatest { proxy.scrollTo("chat-bottom", anchor: .bottom) } }
            }
            if !measured { Divider() }
            if let screen = state.screen {
                region(screen.composer).padding(boxed(screen.composer) ? 0 : 12)
                if let footer = screen.footer { region(footer) }
            }
            else { NativeChatComposer(state: state, onAction: onAction, onDraft: onDraft) }
        }
        .disabled(!(state.screen?.overlay.isEmpty ?? true))
        .accessibilityHidden(!(state.screen?.overlay.isEmpty ?? true))
        .overlay(Group {
            if let screen = state.screen, !screen.overlay.isEmpty {
                ScrollView { region(screen.overlay).padding(boxed(screen.overlay) ? 0 : 20) }
                    .background(measuredBackground)
                    .accessibilityAddTraits(.isModal)
                    .accessibilityIdentifier("trashed-native-chat-overlay")
                    .overlay(Group {
                        // Web popovers dismiss on an outside click/Escape. The
                        // native projection has no DOM backdrop: expose that same
                        // offered action to touch and VoiceOver rather than trap it.
                        if state.offers("screen-dismiss") {
                            Button { onAction("screen-dismiss", nil) } label: {
                                Image(systemName: "xmark.circle.fill").font(.system(size: 24)).frame(width: 44, height: 44)
                            }.padding(8).accessibilityLabel("Dismiss dialog")
                                .accessibilityIdentifier("trashed-native-overlay-dismiss")
                        }
                    }, alignment: .topTrailing)
                    .accessibilityAction(.escape) { if state.offers("screen-dismiss") { onAction("screen-dismiss", nil) } }
            }
        })
        .background(measuredBackground)
        .accentColor(NativeChatPalette.primary)
        .accessibilityIdentifier("trashed-native-chat")
    }
    private func region(_ nodes: [NativeComponentNode]) -> some View {
        VStack(alignment: .leading, spacing: boxed(nodes) ? 0 : 8) {
            ForEach(nodes) { node in NativeComponentView(node: node, state: state, configured: configured, onAction: onAction) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
private struct NativeChatHeader: View {
    let state: NativeChatState
    let onAction: (String, String?) -> Void
    var body: some View {
        HStack(spacing: 10) {
            Image("TrishaAvatar").resizable().scaledToFill().frame(width: 28, height: 28).clipShape(Circle()).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(state.title).font(.headline).accessibilityAddTraits(.isHeader)
                if let subtitle = state.subtitle { Text(subtitle).font(.caption).foregroundColor(.secondary) }
            }
            Spacer(minLength: 0)
            if let action = state.actions.first(where: { $0.kind == "reset" }) {
                Button(action.label) { onAction(action.id, nil) }.frame(minWidth: 44, minHeight: 44).disabled(action.isDisabled).accessibilityIdentifier("trashed-native-chat-reset")
            }
        }.padding(.horizontal, 16).padding(.vertical, 8)
    }
}
private struct NativeChatConversations: View {
    let state: NativeChatState
    let onAction: (String, String?) -> Void
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(state.conversations) { item in
                    Button { onAction(item.id, nil) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text((item.pinned == true ? "★ " : "") + item.title).lineLimit(1).font(.subheadline.weight(item.selected ? .semibold : .regular))
                            Text(item.detail).lineLimit(1).font(.caption).opacity(0.8)
                        }.padding(.horizontal, 12).padding(.vertical, 8).frame(minHeight: 44)
                    }
                    .foregroundColor(item.selected ? .white : .primary)
                    .background(item.selected ? NativeChatPalette.fill : Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .disabled(!state.offers(item.id))
                    .accessibilityIdentifier("trashed-native-chat-conversation-" + item.id)
                }
            }.padding(.horizontal, 16)
        }.padding(.bottom, 8)
    }
}
private struct NativeChatSuggestions: View {
    let state: NativeChatState
    let onAction: (String, String?) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What should Trisha help manage?").font(.title3.weight(.semibold))
            ForEach(state.suggestions) { suggestion in
                Button(suggestion.prompt) { onAction(suggestion.id, nil) }
                    .foregroundColor(NativeChatPalette.primary).padding(12)
                    .frame(minHeight: 44).background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
                    .disabled(!state.offers(suggestion.id))
                    .accessibilityIdentifier("trashed-native-chat-suggestion-" + suggestion.id)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
private struct NativeChatBubble: View {
    let message: NativeChatMessage
    let state: NativeChatState
    let configured: URL
    let onAction: (String, String?) -> Void
    private var isUser: Bool { message.role == "user" }
    var body: some View {
        VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
            if let time = message.time { Text(time).font(.caption2).foregroundColor(.secondary) }
            VStack(alignment: .leading, spacing: 8) {
                if !isUser { Image("TrishaAvatar").resizable().scaledToFill().frame(width: 28, height: 28).clipShape(Circle()).accessibilityLabel("Trisha") }
                if !message.text.isEmpty { NativeChatText(text: message.text).font(.body) }
                ForEach(message.attachments ?? []) { item in
                    Label(item.filename + " · " + item.label, systemImage: "paperclip").font(.caption)
                }
                ForEach(message.components ?? []) { node in
                    NativeComponentView(node: node, state: state, configured: configured, onAction: onAction)
                }
                ForEach(message.actions ?? []) { action in
                    Button(action.label) { onAction(action.id, nil) }
                        .foregroundColor(action.destructive == true ? .black : .white).padding(.horizontal, 12).frame(minHeight: 44)
                        .background(action.destructive == true ? Color.red : NativeChatPalette.fill)
                        .clipShape(RoundedRectangle(cornerRadius: 10)).disabled(action.isDisabled)
                        .accessibilityIdentifier("trashed-native-action-" + action.id)
                }
            }
            .environment(\.nativeBrandedSurface, isUser ? "#7033ff" : nil)
            .padding(12).foregroundColor(isUser ? .white : .primary)
            .background(isUser ? NativeChatPalette.fill : Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 24)).frame(maxWidth: 720, alignment: isUser ? .trailing : .leading)
        }.frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
            .accessibilityIdentifier("trashed-native-chat-message-" + message.id)
    }
}
private struct NativeChatComposer: View {
    let state: NativeChatState
    let onAction: (String, String?) -> Void
    let onDraft: (String) -> Void
    @State private var buffer: NativeDraftBuffer
    init(state: NativeChatState, onAction: @escaping (String, String?) -> Void, onDraft: @escaping (String) -> Void) {
        self.state = state; self.onAction = onAction; self.onDraft = onDraft
        _buffer = State(initialValue: NativeDraftBuffer(value: state.input.value))
    }
    private var loading: Bool { state.status?.kind == "loading" }
    private var actionID: String { loading ? state.input.stopActionId : state.input.sendActionId }
    private var canSubmit: Bool { state.offers(actionID) && (loading || (!state.input.disabled && !buffer.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)) }
    private var binding: Binding<String> { Binding(get: { buffer.value }, set: change) }
    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            ZStack(alignment: .topLeading) {
                TextEditor(text: binding)
                    .frame(height: 64).disabled(state.input.disabled)
                    .accessibilityLabel(state.input.placeholder).accessibilityIdentifier("trashed-native-chat-composer")
                // Overlay rather than paint beneath TextEditor's opaque native background.
                if buffer.value.isEmpty { Text(state.input.placeholder).foregroundColor(.secondary).font(.body).padding(.top, 8).padding(.leading, 5).allowsHitTesting(false).accessibilityHidden(true) }
            }
            Button(loading ? "Stop" : "Send", action: submit)
                .foregroundColor(.white).padding(.horizontal, 14).frame(minHeight: 44)
                .background(NativeChatPalette.fill).clipShape(RoundedRectangle(cornerRadius: 12))
                .disabled(!canSubmit).opacity(canSubmit ? 1 : 0.45)
                .accessibilityIdentifier("trashed-native-chat-send")
        }.padding(12).onChange(of: state.input.value) { buffer.receive($0) }
    }
    private func change(_ value: String) {
        guard !state.input.disabled, NativeChatPolicy.text(value, max: 4000, empty: true) != nil else { return }
        buffer.edit(value); onDraft(value)
    }
    private func submit() { onAction(actionID, loading ? nil : buffer.value) }
}
