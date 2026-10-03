import SwiftUI
import Photos
import ImageIO

struct FoodScreeningProbeView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var ledger: FoodScreeningLedger?
    @State private var message: String?
    @State private var saving = false

    private var records: [FoodScreeningRecord] {
        (ledger?.records.values.map { $0 } ?? []).sorted {
            if $0.capturedAt != $1.capturedAt { return ($0.capturedAt ?? .distantPast) > ($1.capturedAt ?? .distantPast) }
            return $0.localIdentifier < $1.localIdentifier
        }
    }

    var body: some View {
        List {
            Section("Local food screening") {
                Text("Evaluate food presence on this phone. Photos are not uploaded. Results do not create meals or estimate macros.")
                LabeledContent("Build", value: "\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?") (\(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"))")
                LabeledContent("Screening", value: ledger?.enabled == true ? "Enabled" : "Disabled")
                Button(ledger?.enabled == true ? "Disable Local Food Screening" : "Enable Local Food Screening") {
                    saving = true
                    Task {
                        do { try await LocalFoodScreeningRuntime.session.setEnabled(ledger?.enabled != true); refresh() }
                        catch { message = "Could not change screening. Wait for any running check to finish. Saved state is preserved." }
                        saving = false
                    }
                }
                .frame(minHeight: 44)
                .disabled(saving || message != nil || PHPhotoLibrary.authorizationStatus(for: .readWrite) != .authorized)
                Text("Enabling includes photos already discovered since tracking began. Use disposable test images. Disable the separate PhotoKit extension before a local-only trial.")
                if let message { Text(message).foregroundStyle(.red) }
                Button("Refresh Local Results", action: refresh).frame(minHeight: 44)
            }
            Section("Shortcut setup") {
                Text("Replace Discover New Photos with Discover and Screen New Photos in your Camera Is Closed / Run Immediately automation. Keep Show Notification connected to its text result.")
                Text("Each run checks up to three pending photos. Close Camera again without taking a photo to continue a larger batch. Completed classifications are not repeated. Unavailable images retry at most three times; errors are kept for review.")
                Text("The batch stops starting new checks after 20 seconds. The current check can take longer while Vision cancels. Measure total Shortcut time during the device test.")
            }
            if let ledger {
                Section("Results") {
                    LabeledContent("Policy", value: ledger.policyVersion)
                    LabeledContent("Photos retained", value: String(records.count))
                    ForEach(FoodScreeningOutcome.allCases, id: \.self) { outcome in
                        LabeledContent(outcome.title, value: String(records.filter { $0.result?.outcome == outcome }.count))
                    }
                    LabeledContent("No saved result", value: String(records.filter { $0.result == nil }.count))
                    Text("Scores are experimental. Screenshots and recognized mixed scenes are uncertain. Photos of screens and all sensitive scenes cannot be reliably excluded by this pilot.")
                }
                ForEach(FoodEvaluationSplit.allCases, id: \.self) { split in
                    let evaluation = FoodScreeningEvaluation(records: records, split: split)
                    Section(split == .development ? "Development labels" : "Held-out labels") {
                        LabeledContent("Labelled clear meal recall", value: "\(evaluation.detectedMeals) / \(evaluation.clearMeals)")
                        LabeledContent("Non-food false passes", value: "\(evaluation.falsePasses) / \(evaluation.nonFood)")
                        LabeledContent("Labelled photos awaiting a result", value: String(evaluation.pendingLabels))
                        Text("Counts include every photo with your labels. Pending, interrupted, error and uncertain clear meals count as misses. Keep bursts together; choose the split before using results to tune thresholds.")
                    }
                }
                Section("Review photos") {
                    ForEach(records, id: \.localIdentifier) { record in
                        NavigationLink {
                            FoodScreeningPhotoReview(record: record)
                        } label: {
                            VStack(alignment: .leading) {
                                Text(record.result?.outcome.title ?? (record.needsAttempt ? "Pending" : "Interrupted; retries exhausted"))
                                Text(record.capturedAt?.formatted() ?? "Capture time unavailable").foregroundStyle(.secondary)
                                Text("Attempts: \(record.attempts). Label: \(record.presence.rawValue)").foregroundStyle(.secondary)
                            }
                            .font(.body)
                            .frame(minHeight: 44)
                        }
                    }
                }
            }
        }
        .navigationTitle("Food Screening Test")
        .onAppear(perform: refresh)
        .onChange(of: scenePhase) { _, phase in if phase == .active { refresh() } }
    }

    private func refresh() {
        do { ledger = try LocalFoodScreeningRuntime.store.load(); message = nil }
        catch { ledger = nil; message = "Local screening state is unavailable or invalid. It has not been reset." }
    }
}

private struct FoodScreeningPhotoReview: View {
    @State var record: FoodScreeningRecord
    @State private var preview: LocalScreeningImage?
    @State private var loaded = false
    @State private var saving = false
    @State private var message: String?

    var body: some View {
        Form {
            Section("Photo stays on this phone") {
                if let preview {
                    Image(decorative: preview.cgImage, scale: 1, orientation: preview.orientation.swiftUIOrientation)
                        .resizable().scaledToFit().frame(maxHeight: 300)
                } else { Text(loaded ? "Local preview unavailable." : "Loading local preview…") }
                LabeledContent("Captured", value: record.capturedAt?.formatted() ?? "Unavailable")
                LabeledContent("Result", value: record.result?.outcome.title ?? "No saved result")
                LabeledContent("Reason", value: record.result?.reason ?? "Pending or interrupted")
                if let result = record.result {
                    LabeledContent("Read and classification time", value: "\(result.durationMilliseconds) ms")
                    if let confidence = result.foodConfidence { LabeledContent("Food score", value: confidence.formatted(.number.precision(.fractionLength(3)))) }
                    ForEach(result.labels, id: \.identifier) { label in
                        LabeledContent(label.identifier, value: label.confidence.formatted(.number.precision(.fractionLength(3))))
                    }
                }
            }
            Section("Your evaluation labels") {
                Picker("Food presence", selection: $record.presence) {
                    Text("Unlabelled").tag(FoodPresenceLabel.unlabelled)
                    Text("Food").tag(FoodPresenceLabel.food)
                    Text("Non-food").tag(FoodPresenceLabel.nonFood)
                    Text("Uncertain").tag(FoodPresenceLabel.uncertain)
                }
                Picker("Suitable for macro estimation", selection: $record.suitability) {
                    Text("Unlabelled").tag(MacroSuitabilityLabel.unlabelled)
                    Text("Suitable").tag(MacroSuitabilityLabel.suitable)
                    Text("Unsuitable").tag(MacroSuitabilityLabel.unsuitable)
                    Text("Uncertain").tag(MacroSuitabilityLabel.uncertain)
                }
                Picker("Evaluation set", selection: $record.split) {
                    Text("Development").tag(FoodEvaluationSplit.development)
                    Text("Held-out").tag(FoodEvaluationSplit.heldOut)
                }
                Button("Save Labels Locally") {
                    saving = true
                    Task {
                        do {
                            try await LocalFoodScreeningRuntime.session.label(record.localIdentifier,
                                presence: record.presence, suitability: record.suitability, split: record.split)
                            message = "Labels saved on this phone."
                        } catch { message = "Labels were not saved. Wait for screening to finish, then try again." }
                        saving = false
                    }
                }
                .frame(minHeight: 44)
                if let message { Text(message) }
                Text("Labels do not change routing. Record latency separately for failed checks. Full-resolution access and macro accuracy are not tested by this resized image.")
            }
            .disabled(saving)
        }
        .navigationTitle("Review Local Photo")
        .task {
            if PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized,
               let asset = PHAsset.fetchAssets(withLocalIdentifiers: [record.localIdentifier], options: nil).firstObject {
                preview = await LocalFoodScreeningRuntime.readImage(asset)
            }
            loaded = true
        }
    }
}

private extension CGImagePropertyOrientation {
    var swiftUIOrientation: Image.Orientation {
        switch self {
        case .up: .up
        case .down: .down
        case .left: .left
        case .right: .right
        case .upMirrored: .upMirrored
        case .downMirrored: .downMirrored
        case .leftMirrored: .leftMirrored
        case .rightMirrored: .rightMirrored
        @unknown default: .up
        }
    }
}
