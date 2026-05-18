import SwiftUI

struct NativePanelBackground: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            content
                .glassEffect(.regular, in: .rect(cornerRadius: 18))
        } else {
            fallback(content)
        }
        #else
        fallback(content)
        #endif
    }

    private func fallback(_ content: Content) -> some View {
        content
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(.primary.opacity(0.12), lineWidth: 1)
            }
            .clipShape(.rect(cornerRadius: 18, style: .continuous))
    }
}

struct StatusPill: View {
    enum Tone {
        case success
        case error
        case neutral
    }

    let text: String
    let tone: Tone

    var body: some View {
        Label(text, systemImage: systemImage)
            .font(.caption)
            .foregroundStyle(foregroundStyle)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(backgroundStyle, in: Capsule())
            .accessibilityElement(children: .combine)
    }

    private var systemImage: String {
        switch tone {
        case .success:
            return "checkmark.circle.fill"
        case .error:
            return "exclamationmark.triangle.fill"
        case .neutral:
            return "info.circle"
        }
    }

    private var foregroundStyle: Color {
        switch tone {
        case .success:
            return .green
        case .error:
            return .red
        case .neutral:
            return .secondary
        }
    }

    private var backgroundStyle: Color {
        foregroundStyle.opacity(0.12)
    }
}

extension View {
    func nativePanelBackground() -> some View {
        modifier(NativePanelBackground())
    }

    func panelEntrance(isPresented: Bool, reduceMotion: Bool) -> some View {
        modifier(PanelEntranceModifier(isPresented: isPresented, reduceMotion: reduceMotion))
    }
}

private struct PanelEntranceModifier: ViewModifier {
    let isPresented: Bool
    let reduceMotion: Bool

    func body(content: Content) -> some View {
        content
            .opacity(isPresented ? 1 : 0)
            .scaleEffect(reduceMotion || isPresented ? 1 : 0.975, anchor: .top)
            .offset(y: reduceMotion || isPresented ? 0 : -4)
    }
}
